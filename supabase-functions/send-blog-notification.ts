// =============================================================================
// Supabase Edge Function: send-blog-notification
// =============================================================================
//
// Triggered automatically by PostgreSQL triggers (pg_net) when a blog post is
// inserted or updated to 'published' status. See blog-notification-trigger.sql.
//
// Broadcasts a Firebase Cloud Messaging (FCM HTTP v1) push to EVERY registered
// device in `user_push_tokens` so all logged-in users learn about the new post.
// Tapping the push opens the article (BlogDetail screen, by slug).
//
// Auth: x-webhook-secret header validated against BLOG_WEBHOOK_SECRET env var
// (set as a Supabase Edge Function secret). The trigger sends the same header.
//
// Required secrets: FCM_SERVICE_ACCOUNT_JSON, BLOG_WEBHOOK_SECRET,
//                   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy: supabase functions deploy send-blog-notification --no-verify-jwt
//
// Manual test (broadcasts to ALL devices — use intentionally):
// curl -X POST https://oxwhqvsoelqqsblmqkxx.supabase.co/functions/v1/send-blog-notification \
//   -H "x-webhook-secret: <BLOG_WEBHOOK_SECRET>" \
//   -H "Content-Type: application/json" \
//   -d '{"record": {"id": "...", "title": "...", "slug": "...", "meta_description": "...", "featured_image_url": "...", "status": "published"}}'
//
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BLOG_WEBHOOK_SECRET = Deno.env.get('BLOG_WEBHOOK_SECRET')!

const FCM_PROJECT_ID = 'simple-lecture-1d414'
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

// FCM v1 sends one message per request; cap concurrency so a large audience
// doesn't open thousands of sockets at once.
const SEND_CONCURRENCY = 100

interface BlogRecord {
  id: string
  title: string
  slug: string
  meta_description?: string
  featured_image_url?: string | null
  status: string
}

interface TokenRow {
  id: string
  fcm_token: string
  platform: string
}

interface ServiceAccount {
  private_key: string
  client_email: string
}

/** base64url-encode a Uint8Array (no external deps). */
function b64url(buf: Uint8Array): string {
  const b = btoa(String.fromCharCode(...buf))
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = { iss: sa.client_email, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }

  const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)))
  const toSign = `${enc(header)}.${enc(payload)}`

  const pemBody = sa.private_key
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(toSign))
  const jwt = `${toSign}.${b64url(new Uint8Array(signature))}`

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${err}`)
  }

  const { access_token } = await tokenRes.json()
  return access_token as string
}

serve(async (req) => {
  const startTime = Date.now()
  console.log('[BlogNotif] INVOKED', new Date().toISOString(), req.method)

  try {
    // [STEP 1] Auth validation (webhook secret, not API key).
    const webhookSecret = req.headers.get('x-webhook-secret')
    if (!webhookSecret || webhookSecret !== BLOG_WEBHOOK_SECRET) {
      console.log('[BlogNotif] Unauthorized — bad/missing x-webhook-secret')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }

    // [STEP 2] Parse payload.
    const body = await req.json()
    const record: BlogRecord = body.record || body
    if (!record || !record.title || !record.slug) {
      console.log('[BlogNotif] No valid blog record in payload')
      return new Response(JSON.stringify({ error: 'No blog record provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }
    console.log('[BlogNotif] Blog:', record.title, '| status:', record.status)

    // [STEP 3] Only notify on published posts.
    if (record.status !== 'published') {
      console.log('[BlogNotif] Skipping — not published')
      return new Response(
        JSON.stringify({ message: 'Post not published, skipping notification', status: record.status }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // [STEP 4] Fetch all registered device tokens.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: tokens, error: tokenError } = await supabase
      .from('user_push_tokens')
      .select('id, fcm_token, platform')

    if (tokenError) {
      console.error('[BlogNotif] Token fetch failed:', tokenError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch push tokens', details: tokenError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const validTokens = (tokens ?? []).filter((t: TokenRow) => t.fcm_token && t.fcm_token.length > 0)
    console.log('[BlogNotif] Devices to notify:', validTokens.length)

    if (validTokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No devices to notify', tokensInDB: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // [STEP 5] Build notification content.
    const description = (record.meta_description || '').trim()
    const previewText = description.length > 0
      ? description
      : 'A new article is live on Simple Lecture. Tap to read the latest insights, tips, and study strategies from our experts.'
    const bodyText = previewText.length > 300 ? previewText.substring(0, 297) + '...' : previewText

    // FCM v1 data values MUST be strings. Keep them flat — the app's tap handler
    // reads data.screen + data.blogSlug.
    const data: Record<string, string> = {
      type: 'new_blog',
      screen: 'BlogDetail',
      blogSlug: record.slug,
      blogId: String(record.id ?? ''),
    }
    if (record.featured_image_url) data.imageUrl = record.featured_image_url

    // [STEP 6] Acquire a Google access token, then send to every device.
    const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')
    if (!saJson) {
      return new Response(JSON.stringify({ error: 'FCM_SERVICE_ACCOUNT_JSON secret not set' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
    const sa: ServiceAccount = JSON.parse(saJson)
    const accessToken = await getGoogleAccessToken(sa)

    let totalSent = 0
    let totalFailed = 0
    const staleTokenIds: string[] = []

    for (let i = 0; i < validTokens.length; i += SEND_CONCURRENCY) {
      const batch = validTokens.slice(i, i + SEND_CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(async (t: TokenRow) => {
          const message: Record<string, unknown> = {
            token: t.fcm_token,
            notification: { title: `New Blog: ${record.title}`, body: bodyText },
            data,
            android: { priority: 'HIGH', notification: { channel_id: 'default', sound: 'default' } },
          }

          const fcmRes = await fetch(FCM_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
          })

          if (!fcmRes.ok) {
            const errBody = await fcmRes.text()
            // Parse FCM v1's structured error to find the FcmError errorCode.
            let errorCode = ''
            try {
              const parsed = JSON.parse(errBody)
              const details = parsed?.error?.details
              if (Array.isArray(details)) {
                for (const d of details) {
                  if (d?.errorCode) { errorCode = d.errorCode; break }
                }
              }
              if (!errorCode && parsed?.error?.status) errorCode = parsed.error.status
            } catch { /* non-JSON error body — leave errorCode empty */ }
            // Only remove tokens FCM explicitly reports as no longer registered.
            // Do NOT delete on INVALID_ARGUMENT or a bare 404 — a malformed
            // payload returns those for EVERY token and would wipe the table.
            if (errorCode === 'UNREGISTERED') staleTokenIds.push(t.id)
            throw new Error(`FCM ${fcmRes.status} ${errorCode}: ${errBody.slice(0, 160)}`)
          }
          return true
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled') totalSent++
        else totalFailed++
      }
    }

    // [STEP 7] Clean up dead tokens so future sends stay healthy.
    let cleaned = 0
    if (staleTokenIds.length > 0) {
      const { error: delError } = await supabase
        .from('user_push_tokens')
        .delete()
        .in('id', staleTokenIds)
      if (delError) console.error('[BlogNotif] Stale token cleanup failed:', delError.message)
      else cleaned = staleTokenIds.length
    }

    const elapsed = Date.now() - startTime
    console.log('[BlogNotif] DONE', JSON.stringify({ sent: totalSent, failed: totalFailed, cleaned, elapsedMs: elapsed }))

    return new Response(
      JSON.stringify({
        success: true,
        blog: record.title,
        blogId: record.id,
        sent: totalSent,
        failed: totalFailed,
        staleTokensRemoved: cleaned,
        totalDevices: validTokens.length,
        elapsedMs: elapsed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error('[BlogNotif] FATAL after', elapsed + 'ms:', (error as Error)?.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: (error as Error)?.message, elapsedMs: elapsed }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
