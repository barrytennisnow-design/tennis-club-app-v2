-- ============================================================
-- Adds tracking of WHO actually proposed each match (i.e. clicked
-- "Propose" / built it via self-serve), as distinct from
-- created_by (who drafted it -- for manager-generated matches
-- that's the automated matching run, not a specific person).
-- ============================================================

alter table matches add column if not exists proposed_by uuid references players(id);
