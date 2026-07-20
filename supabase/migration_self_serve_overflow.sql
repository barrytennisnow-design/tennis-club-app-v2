-- ============================================================
-- Migration: self-serve overflow invites
--
-- Reworks self-serve match building from "invite exactly 1 or 3
-- other players" to "say how many you need (2 or 4 total), invite
-- as many candidates as you want, first-come-first-served fills the
-- spots." Adds a waved invite pool so a self-serve proposer (or a
-- manager/captain) can invite more people than a match needs
-- without a decline from an extra invitee cancelling the whole
-- match -- something the old "any decline cancels" trigger would
-- otherwise do.
--
-- Wave 1 = players who marked themselves available that day --
--   invited immediately.
-- Wave 2 = every other active roster player, not marked available
--   that day -- ONLY invitable by a manager/captain, and only
--   actually sent once wave 1 has had 8 hours to respond (or has
--   fully responded/declined already, whichever comes first) and
--   the match still needs more players.
-- ============================================================

-- 2 or 4 -- how many total players (including the proposer) this
-- match needs. NULL for every match that isn't a self-serve overflow
-- match (manager/matrix-generated matches, and any match created
-- before this migration) -- those keep their old fixed-roster,
-- any-decline-cancels behavior untouched (see the trigger below).
alter table matches add column if not exists target_size int check (target_size in (2, 4));

-- When wave 1 invites went out -- the 8-hour clock for promoting
-- wave 2 starts here.
alter table matches add column if not exists wave1_sent_at timestamptz;

-- Set once wave 2 has been sent (by the 8-hour cron, or immediately
-- if wave 1 fully responds early and the match is still short) so
-- neither path double-sends it.
alter table matches add column if not exists wave2_promoted_at timestamptz;

-- ------------------------------------------------------------
-- MATCH_INVITE_POOL
-- Every candidate a self-serve proposer picked for an overflow
-- match, independent of match_players -- a candidate only gets a
-- match_players row (and an email) once their wave is actually
-- sent. This is what lets "invite 10 for a 4-person match" work:
-- the extra 6 are tracked here, not as live proposed match_players
-- rows that could trip the classic decline-cancels trigger.
-- ------------------------------------------------------------
create table if not exists match_invite_pool (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  wave int not null check (wave in (1, 2)),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'withdrawn')),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists match_invite_pool_match_id_idx on match_invite_pool(match_id);

alter table match_invite_pool enable row level security;

drop policy if exists "players view own invite pool rows" on match_invite_pool;
create policy "players view own invite pool rows"
  on match_invite_pool for select
  using (player_id in (select id from players where auth_user_id = auth.uid()));

drop policy if exists "managers manage all invite pool rows" on match_invite_pool;
create policy "managers manage all invite pool rows"
  on match_invite_pool for all
  using (exists (select 1 from players where auth_user_id = auth.uid() and role = 'manager'));

-- ------------------------------------------------------------
-- MATCH STATUS AUTOMATION -- made target_size-aware.
--
-- Classic matches (target_size is null): unchanged behavior --
-- any decline cancels the match, and it only confirms once every
-- invited player has accepted.
--
-- Overflow matches (target_size is set): a decline no longer
-- cancels anything by itself -- there may be more candidates
-- waiting in match_invite_pool, and the application (respond-match
-- route / cron) decides whether to promote wave 2 or give up.
-- The match confirms as soon as enough players accept to reach
-- target_size, regardless of how many other invitees are still
-- pending -- the application is responsible for withdrawing those
-- once that happens.
-- ------------------------------------------------------------
create or replace function handle_match_player_response()
returns trigger
language plpgsql
security definer
as $$
declare
  match_target_size int;
  total int;
  accepted int;
  declined int;
begin
  select target_size into match_target_size from matches where id = new.match_id;

  select count(*) into total from match_players where match_id = new.match_id;
  select count(*) into accepted from match_players where match_id = new.match_id and response_status = 'accepted';
  select count(*) into declined from match_players where match_id = new.match_id and response_status = 'declined';

  if match_target_size is not null then
    if accepted >= match_target_size then
      update matches set status = 'confirmed', confirmed_at = now()
        where id = new.match_id and status <> 'confirmed';
    end if;
  else
    if declined > 0 then
      update matches set status = 'cancelled', cancelled_at = now()
        where id = new.match_id and status <> 'cancelled';
    elsif accepted = total then
      update matches set status = 'confirmed', confirmed_at = now()
        where id = new.match_id and status <> 'confirmed';
    end if;
  end if;

  return new;
end;
$$;
