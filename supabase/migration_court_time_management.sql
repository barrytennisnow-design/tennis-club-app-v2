-- ============================================================
-- Migration: Court & Time Slot management upgrade
--
-- Adds to both `courts` and `time_slots`:
--   - sort_order  : manager-controlled display/assignment order
--   - is_active   : soft-delete flag (retired items are hidden
--                   from pickers but stay attached to historical
--                   matches instead of breaking a foreign key)
-- And to `courts` specifically:
--   - is_default  : mirrors the pattern already used by
--                   time_slots, so "default court" lives on the
--                   court row itself instead of only in
--                   club_settings.default_court_id.
--
-- club_settings.default_court_id / default_time_slot_id /
-- default_time_display are left in place for backward
-- compatibility but are no longer the source of truth -- the app
-- now reads defaults directly off courts.is_default and
-- time_slots.is_default.
-- ============================================================

-- --- courts ---
alter table courts add column if not exists sort_order integer not null default 0;
alter table courts add column if not exists is_default boolean not null default false;
alter table courts add column if not exists is_active boolean not null default true;

-- Give existing courts a stable sort order (alphabetical, matching
-- the old UI's default sort) so nothing reshuffles on upgrade.
with ordered as (
  select id, row_number() over (order by name) as rn
  from courts
)
update courts set sort_order = ordered.rn * 10
from ordered
where courts.id = ordered.id and courts.sort_order = 0;

-- Carry over whatever was already set as the club-wide default court.
update courts c
set is_default = true
from club_settings s
where s.default_court_id = c.id;

-- If nothing was marked default, fall back to the first active
-- court so the match matrix and auto-generator always have
-- something to assign.
update courts
set is_default = true
where is_active = true
  and not exists (select 1 from courts where is_default = true)
  and id = (select id from courts where is_active = true order by sort_order, name limit 1);

-- Enforce at most one default court at the database level too.
create unique index if not exists one_default_court
  on courts (is_default)
  where is_default = true;

-- --- time_slots ---
alter table time_slots add column if not exists sort_order integer not null default 0;
alter table time_slots add column if not exists is_active boolean not null default true;

with ordered as (
  select id, row_number() over (order by name) as rn
  from time_slots
)
update time_slots set sort_order = ordered.rn * 10
from ordered
where time_slots.id = ordered.id and time_slots.sort_order = 0;

-- Mirror the same one-default guarantee for time slots.
create unique index if not exists one_default_time_slot
  on time_slots (is_default)
  where is_default = true;
