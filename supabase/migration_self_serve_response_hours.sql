-- ============================================================
-- Migration: configurable self-serve response window
--
-- Replaces the hardcoded 8-hour wait (WAVE2_DELAY_HOURS in
-- lib/selfServe.ts) with a manager-configurable setting: how long
-- wave 1 (players who marked themselves available) gets to respond
-- before wave 2 (everyone else) is invited, if the match is still
-- short. Same knob a manager already has for the self-serve window
-- (self_serve_window_days) -- see migration_self_serve.sql.
-- ============================================================

alter table club_settings add column if not exists self_serve_response_hours int not null default 1;
