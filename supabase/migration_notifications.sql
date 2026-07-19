-- ============================================================
-- Migration: notifications -- a persistent, per-player history of
-- every email-worthy event in the system (match proposed, confirmed,
-- cancelled, reminder nudges), shown as an in-app inbox (newest
-- first, read/unread, tap-through to the match).
--
-- Design:
--   - One row per (event, recipient) -- exactly mirrors who actually
--     got the matching email, written from the same server routes
--     right alongside the existing sendEmail() call, using the same
--     subject/summary text so the inbox and the email never drift
--     apart.
--   - Rows are only ever inserted by server routes using the admin
--     (service-role) client -- there is deliberately no insert policy
--     for authenticated users below, so a player can never write a
--     notification claiming to be from the system.
--   - A player can select and update (read_at only, via the app) just
--     their own rows.
--   - This is phase 1 (no push yet). Phase 2 adds an fcm_tokens table
--     and calls out to Firebase Cloud Messaging from the same
--     notifyPlayer() helper that writes these rows, so every event
--     that lands here also fires a push.
-- ============================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  type text not null check (type in ('match_proposed', 'match_confirmed', 'match_cancelled', 'match_reminder')),
  title text not null,
  body text,
  match_id uuid references matches(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Inbox is always "my rows, newest first" -- this index covers both
-- the ORDER BY and the player_id filter in one pass.
create index if not exists notifications_player_id_created_at_idx
  on notifications (player_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "players can view their own notifications" on notifications;
create policy "players can view their own notifications"
  on notifications for select
  using (player_id in (select id from players where auth_user_id = auth.uid()));

-- Read/unread toggling only -- the with check clause keeps a player
-- from reassigning a row to someone else's player_id, but note this
-- doesn't itself restrict *which columns* they change; the app only
-- ever sends { read_at }, and there's nothing else on this table
-- worth protecting column-by-column (title/body/type are just a
-- notification a player already received in their own inbox).
drop policy if exists "players can mark their own notifications read" on notifications;
create policy "players can mark their own notifications read"
  on notifications for update
  using (player_id in (select id from players where auth_user_id = auth.uid()))
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

-- No insert policy for authenticated users: rows are only ever
-- written via the service-role admin client from server routes.
-- Delete IS allowed for a player's own rows -- this is what backs
-- the "dismiss" / "clear" action on the Notifications inbox page.
drop policy if exists "players can delete their own notifications" on notifications;
create policy "players can delete their own notifications"
  on notifications for delete
  using (player_id in (select id from players where auth_user_id = auth.uid()));

