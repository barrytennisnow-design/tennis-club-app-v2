-- ============================================================
-- Migration: draft match workflow
-- Adds a 'draft' status so "Generate Match Matrix" only builds
-- silent drafts (no emails). Nothing gets emailed to players
-- until the manager explicitly clicks "Propose" on a draft.
-- ============================================================

alter table matches drop constraint if exists matches_status_check;
alter table matches add constraint matches_status_check
  check (status in ('draft', 'proposed', 'confirmed', 'cancelled'));
alter table matches alter column status set default 'draft';
