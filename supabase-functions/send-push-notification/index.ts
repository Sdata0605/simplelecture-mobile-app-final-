// Supabase Edge Function: send-push-notification
// Sends a Firebase Cloud Messaging (FCM HTTP v1 API) push notification to a user.
//
// Request body:
//   { user_id: string, title: string, body: string, data?: Record<string,string>, platform?: 'android'|'ios' }
//
// Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// Required secrets: FCM_SERVICE_ACCOUNT_JSON, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FCM_PROJECT_ID = 'simple-lecture-1d414';
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** base64url-encode a Uint8Array (no external deps). */
function b64url(buf: Uint8Array): string {
  let b = btoa(String.fromCharCode(...buf));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

interface ServiceAccount {
  private_key: string;
  client_email: string;
}

function log(step: string, detail?: unknown) {
  const msg = detail !== undefined ? `[send-push] ${step}: ${JSON.stringify(detail)}` : `[send-push] ${step}`;
  console.log(msg);
}

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  log('JWT build', { client_email: sa.client_email });
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: sa.client_email, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 };

  const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const toSign = `${enc(header)}.${enc(payload)}`;

  const pemBody = sa.private_key
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(toSign));
  const jwt = `${toSign}.${b64url(new Uint8Array(signature))}`;
  log('JWT signed, exchanging for Google access token');

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });

  log('Google token response status', tokenRes.status);
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    log('Google token exchange FAILED', err);
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${err}`);
  }

  const { access_token } = await tokenRes.json();
  log('Google access token obtained');
  return access_token as string;
}

serve(async (req) => {
  log('Request received', { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  log('Auth check', { headerPresent: !!authHeader, keyPresent: !!serviceRoleKey });

  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    log('Auth FAILED — unauthorized');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  log('Auth passed');

  try {
    const body = await req.json();
    log('Request body parsed', { user_id: body.user_id, title: body.title, platform: body.platform });
    const { user_id, title, body: msgBody, data, platform } = body as {
      user_id: string; title: string; body: string;
      data?: Record<string, string>; platform?: 'android' | 'ios';
    };

    if (!user_id || !title || !msgBody) {
      log('Validation failed — missing required fields');
      return new Response(JSON.stringify({ error: 'user_id, title, body are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    log('Supabase lookup', { url: supabaseUrl.slice(0, 30), user_id, platform });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    let query = supabaseAdmin.from('user_push_tokens').select('fcm_token, platform').eq('user_id', user_id);
    if (platform) query = query.eq('platform', platform);

    const { data: tokens, error: dbError } = await query;
    log('Supabase token lookup result', { count: tokens?.length ?? 0, error: dbError?.message });

    if (dbError || !tokens || tokens.length === 0) {
      log('No FCM tokens found for user');
      return new Response(JSON.stringify({ error: 'No FCM token found for user', dbError: dbError?.message }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    log('FCM secret present', !!saJson);
    if (!saJson) {
      return new Response(JSON.stringify({ error: 'FCM_SERVICE_ACCOUNT_JSON secret not set' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const sa: ServiceAccount = JSON.parse(saJson);
    log('Service account parsed', { client_email: sa.client_email });

    const accessToken = await getGoogleAccessToken(sa);

    const results = await Promise.allSettled(
      tokens.map(async ({ fcm_token, platform: tokenPlatform }: { fcm_token: string; platform: string }) => {
        const tokenPrefix = fcm_token.slice(0, 15) + '…';
        log('Sending FCM message', { tokenPrefix, platform: tokenPlatform });

        const message: Record<string, unknown> = {
          token: fcm_token,
          notification: { title, body: msgBody },
        };
        if (data && Object.keys(data).length > 0) message.data = data;

        const fcmRes = await fetch(FCM_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });

        const fcmBody = await fcmRes.text();
        log('FCM response', { status: fcmRes.status, body: fcmBody.slice(0, 300) });

        if (!fcmRes.ok) throw new Error(`FCM failed (${fcmRes.status}) token=${tokenPrefix}: ${fcmBody}`);
        return JSON.parse(fcmBody);
      })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results
      .filter((r) => r.status === 'rejected')
      .map((r) => (r as PromiseRejectedResult).reason?.message);

    log('Done', { succeeded, failed: failed.length });
    return new Response(
      JSON.stringify({ succeeded, failed: failed.length > 0 ? failed : undefined }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    log('Unhandled error', String(e));
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
