-- ============================================================
-- Adds created_at to match_players. Needed so "whoever was listed
-- first when the match was created" is actually determinable --
-- match_players.id is a random UUID (gen_random_uuid()), which has
-- no relationship to insertion order at all. Existing rows will
-- backfill with this migration's run time (their true original
-- order can't be recovered), but every row created from now on will
-- have an accurate timestamp.
-- ============================================================

alter table match_players add column if not exists created_at timestamptz not null default now();
