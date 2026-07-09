-- ============================================================
-- Migration: persistent access links + sandbox email support
-- Run this AFTER schema.sql / seed.sql / import_roster.sql on
-- an existing database. Safe to run once.
-- ============================================================

-- Each player gets a permanent, unguessable token. Visiting
-- /access/<token> logs them in immediately -- no email needed
-- each time. The token itself was originally emailed to them
-- once (or given out by the manager); they bookmark that URL /
-- add it to their phone's home screen and it just works from
-- then on, indefinitely.
alter table players
  add column if not exists access_token text unique
  default encode(gen_random_bytes(16), 'hex');

-- Backfill for any rows that existed before this column did
-- (shouldn't be needed given the default above, but harmless).
update players set access_token = encode(gen_random_bytes(16), 'hex')
where access_token is null;

create index if not exists idx_players_access_token on players(access_token);
