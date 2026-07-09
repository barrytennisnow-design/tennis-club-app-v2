-- Run this ONCE in Supabase SQL Editor to clear out old test matches
-- created before the draft/propose workflow existed (back when
-- "Generate Matches" created status='proposed' matches directly).
-- Safe to run -- this only deletes rows in `matches` (and their
-- linked `match_players`, via cascade); it does NOT touch players,
-- availability, or anything else.

delete from matches;

-- Confirm it's empty:
select count(*) from matches;
