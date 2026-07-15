-- ============================================================
-- Migration: captains -- a role between player and manager with
-- granular, per-action permissions.
--
-- Design:
--   - players.role gets a third value: 'captain'.
--   - players.permissions (jsonb) holds a captain's individual
--     grants, e.g. {"roster_change_ranking": true, "matrix_generate_days_ahead": 14}.
--     Meaningless for role='player'/'manager' (managers can do
--     everything regardless; players can do nothing on this list).
--   - has_permission(key) mirrors is_manager(): true for any
--     manager, or a captain with that specific key truthy.
--   - Every RLS policy that used to be a blanket "using (is_manager())"
--     is either split into narrower per-command policies, or backed
--     by a BEFORE trigger that reverts any column change a captain
--     isn't specifically permitted to make (Postgres RLS can gate
--     *which rows* are touched, but not *which columns* -- that
--     needs a trigger, same technique already used for the
--     ranking-lock in migration_ranking_lock.sql).
--   - Server routes get their own application-level check via the
--     new lib/permissions.ts helper -- this migration only covers
--     the surfaces that write directly from the browser client
--     (Settings page courts/time CRUD, Roster page ranking/status/
--     self-serve toggles, Matches page timeout/nudge edits).
--
-- Impersonation ("log in as") is deliberately NOT part of this
-- permission system -- it stays manager-only, full stop, regardless
-- of any captain's permissions. That's enforced in the impersonate
-- API routes directly (unchanged by this migration).
-- ============================================================

alter table players drop constraint if exists players_role_check;
alter table players add constraint players_role_check check (role in ('player', 'captain', 'manager'));
alter table players add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function has_permission(perm_key text)
returns boolean
language sql
security definer
stable
as $$
  select is_manager() or exists (
    select 1 from players
    where auth_user_id = auth.uid()
      and role = 'captain'
      and coalesce((permissions->>perm_key)::boolean, false)
  );
$$;

-- ------------------------------------------------------------
-- players (roster fields a captain might be granted)
-- ------------------------------------------------------------

-- Broaden the update policy so a permitted captain's request even
-- reaches the row; the trigger below then reverts anything they
-- specifically aren't allowed to touch.
drop policy if exists "managers can update any player" on players;
create policy "managers and permitted captains can update any player"
  on players for update
  using (
    is_manager()
    or has_permission('roster_change_ranking')
    or has_permission('roster_change_status')
    or has_permission('roster_change_self_serve_optin')
  );

-- Ranking already had its own protective trigger (migration_ranking_lock.sql).
-- Extend it to recognize the captain permission too, instead of manager-only.
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
       and not has_permission('roster_change_ranking') then
      new.ranking := old.ranking;
    end if;
  end if;
  return new;
end;
$$;

-- New trigger for the other captain-grantable player fields.
create or replace function enforce_captain_player_permissions()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and auth.uid() is not null then
    if new.status is distinct from old.status and not has_permission('roster_change_status') then
      new.status := old.status;
    end if;
    if new.self_serve_opt_in is distinct from old.self_serve_opt_in and not has_permission('roster_change_self_serve_optin') then
      new.self_serve_opt_in := old.self_serve_opt_in;
    end if;
    -- Only a manager can ever grant/change captain status or
    -- permissions themselves -- a captain can't promote themselves
    -- or another captain, or edit their own grant list.
    if (new.role is distinct from old.role or new.permissions is distinct from old.permissions) and not is_manager() then
      new.role := old.role;
      new.permissions := old.permissions;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_captain_player_permissions on players;
create trigger trg_enforce_captain_player_permissions
  before update on players
  for each row
  execute function enforce_captain_player_permissions();

-- ------------------------------------------------------------
-- courts
-- ------------------------------------------------------------

drop policy if exists "managers manage courts" on courts;
create policy "insert courts"
  on courts for insert
  with check (has_permission('settings_add_court'));
create policy "update courts"
  on courts for update
  using (
    is_manager()
    or has_permission('settings_edit_court')
    or has_permission('settings_delete_court')
    or has_permission('settings_change_default_court')
  );
create policy "delete courts"
  on courts for delete
  using (is_manager()); -- the app only ever soft-deletes (is_active=false); hard delete stays manager-only

create or replace function enforce_court_update_permissions()
returns trigger
language plpgsql
as $$
begin
  if is_manager() or auth.uid() is null then
    return new; -- managers, and non-interactive/service-role writes, are unrestricted
  end if;
  if new.is_active is distinct from old.is_active and not has_permission('settings_delete_court') then
    new.is_active := old.is_active;
  end if;
  if new.is_default is distinct from old.is_default and not has_permission('settings_change_default_court') then
    new.is_default := old.is_default;
  end if;
  if (new.name is distinct from old.name or new.address is distinct from old.address or new.sort_order is distinct from old.sort_order)
     and not has_permission('settings_edit_court') then
    new.name := old.name;
    new.address := old.address;
    new.sort_order := old.sort_order;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_court_update_permissions on courts;
create trigger trg_enforce_court_update_permissions
  before update on courts
  for each row
  execute function enforce_court_update_permissions();

-- ------------------------------------------------------------
-- time_slots (identical pattern to courts)
-- ------------------------------------------------------------

drop policy if exists "managers manage time slots" on time_slots;
create policy "insert time slots"
  on time_slots for insert
  with check (has_permission('settings_add_time'));
create policy "update time slots"
  on time_slots for update
  using (
    is_manager()
    or has_permission('settings_edit_time')
    or has_permission('settings_delete_time')
    or has_permission('settings_change_default_time')
  );
create policy "delete time slots"
  on time_slots for delete
  using (is_manager());

create or replace function enforce_time_slot_update_permissions()
returns trigger
language plpgsql
as $$
begin
  if is_manager() or auth.uid() is null then
    return new;
  end if;
  if new.is_active is distinct from old.is_active and not has_permission('settings_delete_time') then
    new.is_active := old.is_active;
  end if;
  if new.is_default is distinct from old.is_default and not has_permission('settings_change_default_time') then
    new.is_default := old.is_default;
  end if;
  if (new.name is distinct from old.name or new.description is distinct from old.description or new.sort_order is distinct from old.sort_order)
     and not has_permission('settings_edit_time') then
    new.name := old.name;
    new.description := old.description;
    new.sort_order := old.sort_order;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_time_slot_update_permissions on time_slots;
create trigger trg_enforce_time_slot_update_permissions
  before update on time_slots
  for each row
  execute function enforce_time_slot_update_permissions();

-- ------------------------------------------------------------
-- club_settings (only self_serve_window_days is captain-grantable;
-- default_timeout_hours / nudge_frequency_hours stay manager-only)
-- ------------------------------------------------------------

drop policy if exists "managers can update settings" on club_settings;
create policy "managers and permitted captains can update settings"
  on club_settings for update
  using (is_manager() or has_permission('settings_change_self_serve_window'));

create or replace function enforce_club_settings_permissions()
returns trigger
language plpgsql
as $$
begin
  if is_manager() or auth.uid() is null then
    return new;
  end if;
  if new.self_serve_window_days is distinct from old.self_serve_window_days
     and not has_permission('settings_change_self_serve_window') then
    new.self_serve_window_days := old.self_serve_window_days;
  end if;
  -- Anything else (timeout/nudge defaults, legacy fields) a
  -- non-manager tried to change gets reverted outright.
  new.default_timeout_hours := old.default_timeout_hours;
  new.nudge_frequency_hours := old.nudge_frequency_hours;
  return new;
end;
$$;

drop trigger if exists trg_enforce_club_settings_permissions on club_settings;
create trigger trg_enforce_club_settings_permissions
  before update on club_settings
  for each row
  execute function enforce_club_settings_permissions();

-- ------------------------------------------------------------
-- matches (only auto_cancel_hours / nudge_count are edited directly
-- from the browser client, on the Matches page; everything else --
-- court, time, propose, cancel, generate -- already goes through
-- API routes and is gated in lib/permissions.ts instead)
-- ------------------------------------------------------------

drop policy if exists "managers manage all matches" on matches;
create policy "managers manage all matches"
  on matches for all
  using (is_manager());
create policy "permitted captains update match tracking fields"
  on matches for update
  using (has_permission('matches_change_timeout') or has_permission('matches_change_nudge_count'));

create or replace function enforce_match_tracking_permissions()
returns trigger
language plpgsql
as $$
begin
  if is_manager() or auth.uid() is null then
    return new;
  end if;
  if new.auto_cancel_hours is distinct from old.auto_cancel_hours and not has_permission('matches_change_timeout') then
    new.auto_cancel_hours := old.auto_cancel_hours;
  end if;
  if new.nudge_count is distinct from old.nudge_count and not has_permission('matches_change_nudge_count') then
    new.nudge_count := old.nudge_count;
  end if;
  -- A captain reaching this trigger only has timeout/nudge_count
  -- permissions (see the policy above) -- revert every other field
  -- outright so those two permissions can never be used as a side
  -- door into court/time/status edits.
  new.court_id := old.court_id;
  new.time_display := old.time_display;
  new.time_slot := old.time_slot;
  new.status := old.status;
  new.match_date := old.match_date;
  return new;
end;
$$;

drop trigger if exists trg_enforce_match_tracking_permissions on matches;
create trigger trg_enforce_match_tracking_permissions
  before update on matches
  for each row
  execute function enforce_match_tracking_permissions();

-- ------------------------------------------------------------
-- Read access for the "how many days ahead may this captain VIEW
-- the matrix" numeric cap. Triggers can't gate SELECT, so this is
-- RLS-only -- a permissive policy that ADDS read access for capped
-- captains without touching what managers or players can already
-- see (all existing select policies stay exactly as they were).
-- ------------------------------------------------------------

create policy "captains view matches within display cap"
  on matches for select
  using (
    exists (
      select 1 from players p
      where p.auth_user_id = auth.uid()
        and p.role = 'captain'
        and matches.match_date <= (current_date + coalesce((p.permissions->>'matrix_display_days_ahead')::int, 0))
    )
  );

create policy "captains view availability within display cap"
  on availability for select
  using (
    exists (
      select 1 from players p
      where p.auth_user_id = auth.uid()
        and p.role = 'captain'
        and availability.date <= (current_date + coalesce((p.permissions->>'matrix_display_days_ahead')::int, 0))
    )
  );

create policy "captains view match_players within display cap"
  on match_players for select
  using (
    exists (
      select 1 from players p
      join matches m on m.id = match_players.match_id
      where p.auth_user_id = auth.uid()
        and p.role = 'captain'
        and m.match_date <= (current_date + coalesce((p.permissions->>'matrix_display_days_ahead')::int, 0))
    )
  );

-- ------------------------------------------------------------
-- email_log
-- ------------------------------------------------------------

create policy "permitted captains view email log"
  on email_log for select
  using (has_permission('roster_view_email_log'));
