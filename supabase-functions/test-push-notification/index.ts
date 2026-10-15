// Supabase Edge Function: test-push-notification
// Sends a single test FCM push to verify the pipeline works end-to-end.
//
// Request body (one of):
//   { fcm_token: string }                      — send directly to this FCM token
//   { user_id: string, platform?: string }     — look up token from user_push_tokens
//
// Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// Returns a full verbose log array in the JSON response so every step is visible.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FCM_PROJECT_ID = 'simple-lecture-1d414';
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** base64url-encode a Uint8Array (no external deps). */
function b64url(buf: Uint8Array): string {
  const b = btoa(String.fromCharCode(...buf));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

interface ServiceAccount {
  private_key: string;
  client_email: string;
}

serve(async (req) => {
  const logs: string[] = [];
  const log = (msg: string, detail?: unknown) => {
    const entry = detail !== undefined ? `[test-push] ${msg}: ${JSON.stringify(detail)}` : `[test-push] ${msg}`;
    console.log(entry);
    logs.push(entry);
  };

  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify({ ...body, logs }), {
      status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  log('Request received', { method: req.method });

  // ── Auth check ──────────────────────────────────────────────────────────────
  // Accepts either the project service role key or the TEST_PUSH_SECRET (a
  // dedicated Supabase project secret used for CI/admin test invocations).
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const testSecret = (Deno.env.get('TEST_PUSH_SECRET') ?? '').trim();
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const isAuthorized = !!bearerToken && (
    bearerToken === serviceRoleKey ||
    (!!testSecret && bearerToken === testSecret)
  );
  log('Auth check', { headerPresent: !!authHeader, keyConfigured: !!serviceRoleKey, testSecretSet: !!testSecret });

  if (!isAuthorized) {
    log('Auth FAILED');
    return respond(401, { error: 'Unauthorized — send Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> or <TEST_PUSH_SECRET>' });
  }
  log('Auth passed');

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { fcm_token?: string; user_id?: string; platform?: string };
  try {
    body = await req.json();
    log('Body parsed', {
      fcm_token: body.fcm_token ? body.fcm_token.slice(0, 15) + '…' : undefined,
      user_id: body.user_id,
      platform: body.platform,
    });
  } catch (e) {
    log('Body parse error', String(e));
    return respond(400, { error: 'Invalid JSON body' });
  }

  let fcmToken = body.fcm_token ?? '';
  const platform = body.platform ?? 'android';

  // ── Token lookup (if user_id provided instead of raw token) ─────────────────
  if (!fcmToken && body.user_id) {
    log('No fcm_token — looking up from user_push_tokens', { user_id: body.user_id, platform });
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    log('Supabase URL', supabaseUrl.slice(0, 30) + '…');

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: rows, error: dbError } = await supabase
      .from('user_push_tokens')
      .select('fcm_token, platform')
      .eq('user_id', body.user_id)
      .eq('platform', platform)
      .limit(1);

    log('DB lookup result', { count: rows?.length ?? 0, error: dbError?.message });
    if (dbError) return respond(500, { error: `DB error: ${dbError.message}` });
    if (!rows || rows.length === 0) {
      return respond(404, { error: `No FCM token found for user_id=${body.user_id} platform=${platform}` });
    }

    fcmToken = rows[0].fcm_token;
    log('Token found from DB', { tokenPrefix: fcmToken.slice(0, 15) + '…' });
  }

  if (!fcmToken) {
    log('No FCM token — provide fcm_token or user_id in body');
    return respond(400, { error: 'Provide fcm_token or user_id in request body' });
  }

  // ── Load service account ─────────────────────────────────────────────────────
  const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  log('FCM_SERVICE_ACCOUNT_JSON present', !!saJson);
  if (!saJson) return respond(500, { error: 'FCM_SERVICE_ACCOUNT_JSON secret not configured in Supabase' });

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saJson);
    log('Service account parsed', { client_email: sa.client_email });
  } catch (e) {
    log('Service account JSON parse error', String(e));
    return respond(500, { error: 'FCM_SERVICE_ACCOUNT_JSON is not valid JSON' });
  }

  // ── Build Google OAuth2 JWT ──────────────────────────────────────────────────
  try {
    log('Building RS256 JWT for Google token exchange');
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const jwtPayload = {
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };

    const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
    const toSign = `${enc(header)}.${enc(jwtPayload)}`;

    const pemBody = sa.private_key
      .replace(/\\n/g, '\n')
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');

    log('PEM body length', pemBody.length);
    const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    log('Binary key bytes', binaryKey.length);

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    log('CryptoKey imported');

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(toSign)
    );
    const jwt = `${toSign}.${b64url(new Uint8Array(signature))}`;
    log('JWT signed, sending to Google token endpoint');

    // ── Exchange JWT for Google access token ─────────────────────────────────
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    log('Google token response', { status: tokenRes.status, ok: tokenRes.ok });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      log('Google token exchange FAILED', errText);
      return respond(500, { error: `Google token exchange failed (${tokenRes.status})`, detail: errText });
    }

    const { access_token } = await tokenRes.json();
    log('Google access token received');

    // ── Send FCM message ─────────────────────────────────────────────────────
    const tokenPrefix = fcmToken.slice(0, 15) + '…';
    log('Sending FCM HTTP v1 message', { tokenPrefix, platform });

    const message = {
      token: fcmToken,
      notification: {
        title: '🔔 Test Notification',
        body: `FCM is working on ${platform}! ✅`,
      },
      data: {
        type: 'test',
        timestamp: String(Date.now()),
      },
    };
    log('FCM message payload (token redacted)', { notification: message.notification });

    const fcmRes = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const fcmBody = await fcmRes.text();
    log('FCM response', { status: fcmRes.status, body: fcmBody.slice(0, 500) });

    if (!fcmRes.ok) {
      return respond(500, {
        error: `FCM send failed (${fcmRes.status})`,
        detail: fcmBody,
      });
    }

    log('SUCCESS — notification dispatched');
    return respond(200, {
      success: true,
      fcmResponse: JSON.parse(fcmBody),
      tokenPrefix,
      platform,
    });
  } catch (e) {
    log('Unhandled exception', String(e));
    return respond(500, { error: String(e) });
  }
});
