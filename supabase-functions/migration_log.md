# Migration Log — user_push_tokens

## Context

Created as part of Task #44 (Firebase FCM push notification integration).
The `user_push_tokens` table stores FCM registration tokens per user per platform
so the `send-push-notification` Edge Function can look up the correct device token
when sending a targeted push notification.

## Execution

- **Date**: 2026-04-11
- **Project ref**: oxwhqvsoelqqsblmqkxx (simple-lecture-1d414)
- **Method used**: Supabase Management API
  (`POST https://api.supabase.com/v1/projects/{ref}/database/query`)
- **Auth header**: `Authorization: Bearer <personal-access-token>`
- **Response**: HTTP 201 — executed without errors

### Why Management API instead of service-role REST

The `SUPABASE_SERVICE_ROLE_KEY` authenticates against the PostgREST REST API
(`/rest/v1/`) which only supports CRUD row operations. DDL statements
(`CREATE TABLE`, `ALTER TABLE`, `CREATE POLICY`) are not supported via PostgREST.
Direct PostgreSQL connections require the Supabase database password (a separate
credential, not the service role JWT). The Supabase Management API supports
arbitrary SQL execution and is the correct channel for schema migrations; it
requires a personal access token (PAT), which the project owner provided.

## SQL Executed

```sql
create table if not exists user_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fcm_token   text not null,
  platform    text not null default 'android',
  updated_at  timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists user_push_tokens_user_id_idx
  on user_push_tokens(user_id);

alter table user_push_tokens enable row level security;

create policy "Users manage their own push tokens"
  on user_push_tokens
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## Verification Query

```sql
SELECT
  t.table_name,
  c.relrowsecurity AS rls_enabled,
  array_agg(DISTINCT col.column_name ORDER BY col.column_name) AS columns,
  (SELECT array_agg(policyname) FROM pg_policies
   WHERE tablename = 'user_push_tokens') AS policies,
  (SELECT array_agg(indexname) FROM pg_indexes
   WHERE tablename = 'user_push_tokens') AS indexes
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN information_schema.columns col
  ON col.table_name = t.table_name AND col.table_schema = 'public'
WHERE t.table_schema = 'public' AND t.table_name = 'user_push_tokens'
GROUP BY t.table_name, c.relrowsecurity;
```

## Verification Result

```json
[
  {
    "table_name": "user_push_tokens",
    "rls_enabled": true,
    "columns": "{fcm_token,id,platform,updated_at,user_id}",
    "policies": "{\"Users manage their own push tokens\"}",
    "indexes": "{user_push_tokens_pkey,user_push_tokens_user_id_platform_key,user_push_tokens_user_id_idx}"
  }
]
```

## Verification Checklist

- ✅ Table `public.user_push_tokens` exists
- ✅ All 5 columns present: `id`, `user_id`, `fcm_token`, `platform`, `updated_at`
- ✅ RLS enabled (`rls_enabled: true`)
- ✅ Policy created: "Users manage their own push tokens"
- ✅ 3 indexes: primary key, unique(user_id, platform), user_id lookup index
