-- ============================================================
-- Migration: fcm_tokens -- phase 2 of the notification system
-- (see migration_notifications.sql for phase 1, the in-app inbox).
--
-- One row per (player, browser/device) they've enabled push on. A
-- player can have several rows (phone + laptop, etc.) -- a push send
-- fans out to all of a player's current tokens. Tokens are opaque,
-- rotate periodically, and can go stale (browser data cleared,
-- notification permission revoked, token expired) -- the server-side
-- send helper (lib/push.ts) deletes a token here the moment FCM
-- reports it's no longer valid, so this table is self-cleaning and
-- never needs a cron sweep.
-- ============================================================

create table if not exists fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists fcm_tokens_player_id_idx on fcm_tokens (player_id);

alter table fcm_tokens enable row level security;

-- A player registers/unregisters their own device tokens directly
-- from the browser (no server route needed for this part) -- insert,
-- select (so the client can check "is this token already saved"),
-- and delete are all scoped to their own player_id. There is no
-- update policy: a token is either the current one for a device or
-- it isn't; the client deletes the old value and inserts the new one
-- rather than mutating a row in place.
drop policy if exists "players manage their own fcm tokens" on fcm_tokens;
create policy "players manage their own fcm tokens"
  on fcm_tokens for all
  using (player_id in (select id from players where auth_user_id = auth.uid()))
  with check (player_id in (select id from players where auth_user_id = auth.uid()));
