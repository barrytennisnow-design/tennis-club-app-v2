-- ============================================================
-- Migration: self-serve match building
--
-- Lets unassigned, opted-in players put together their own match
-- for a date once that date is inside the manager's configured
-- "self-serve window" -- e.g. 3 days out or less. Goes through the
-- exact same proposed -> accept -> confirmed pipeline as a
-- manager-generated match (auto-cancel, nudges, emails, ICS all
-- keep working unchanged); the only difference is who initiated it
-- and that the initiator is auto-marked accepted.
-- ============================================================

-- How close to a date self-serve opens up. Same "manager sets a
-- club-wide default" pattern as default_timeout_hours.
alter table club_settings add column if not exists self_serve_window_days integer not null default 3;

-- Opt-in, not opt-out -- a player has to be explicitly enabled by a
-- manager on the Roster page before they can see/build self-serve
-- matches.
alter table players add column if not exists self_serve_opt_in boolean not null default false;

-- Nullable: null = manager-generated (via Generate Match Matrix),
-- set = the player who built this match themselves. Lets the
-- Matches page distinguish the two later if useful; doesn't change
-- any existing behavior.
alter table matches add column if not exists created_by uuid references players(id);
