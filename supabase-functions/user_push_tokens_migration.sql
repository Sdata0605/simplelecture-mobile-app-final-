-- Run this in Supabase SQL editor to create the push tokens table.
-- Project: simple-lecture-1d414
--
-- Trust model:
--   READ (server sends): Edge Function uses SUPABASE_SERVICE_ROLE_KEY → bypasses RLS entirely.
--   WRITE (app registers/removes token): App REST calls use the signed-in user's JWT,
--   so auth.uid() resolves correctly → the policy below allows each user to manage only
--   their own rows, preventing cross-user token tampering.

create table if not exists user_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fcm_token   text not null,
  platform    text not null default 'android',   -- 'android' | 'ios'
  updated_at  timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists user_push_tokens_user_id_idx on user_push_tokens(user_id);

alter table user_push_tokens enable row level security;

-- Authenticated users can upsert/delete ONLY their own token rows.
-- The edge function (service role) bypasses RLS automatically — no extra policy needed.
create policy "Users manage their own push tokens"
  on user_push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
