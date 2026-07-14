-- ============================================================
-- Migration: lock the official `ranking` field to managers tmp
--
-- `players.self_reported_ranking` -- what the player enters on
-- signup/profile, always player-editable, never shown as "the"
-- rating anywhere but their own profile.
--
-- `players.ranking` -- the manager's official rating, used
-- everywhere else in the app. Rules:
--   1. Seeded ONCE from self_reported_ranking the first time a
--      player row is created (if nothing else set it).
--   2. From then on, only a manager can change it -- including
--      against a player calling the update API directly instead
--      of going through the profile page UI, which is why this
--      is enforced as a trigger and not just "the UI doesn't show
--      a way to edit it."
--   3. A player later changing their self_reported_ranking never
--      touches `ranking` again.
--
-- Server routes using the service-role admin client (no end-user
-- auth.uid() in that connection -- e.g. approve-player) are trusted
-- to have already checked role === 'manager' in application code,
-- so the trigger only intervenes when there's an actual
-- authenticated non-manager session behind the change.
-- ============================================================

create or replace function protect_official_ranking()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if new.ranking is null and new.self_reported_ranking is not null then
      new.ranking := new.self_reported_ranking;
    end if;
  elsif TG_OP = 'UPDATE' then
    if new.ranking is distinct from old.ranking
       and auth.uid() is not null
       and not is_manager() then
      new.ranking := old.ranking;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_official_ranking on players;
create trigger trg_protect_official_ranking
  before insert or update on players
  for each row
  execute function protect_official_ranking();

-- One-time backfill: give existing players who have a self-reported
-- rank but no official one yet the same starting point managers
-- would have gotten if this had been in place from day one.
update players
set ranking = self_reported_ranking
where ranking is null and self_reported_ranking is not null;
