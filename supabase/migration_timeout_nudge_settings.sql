-- ============================================================
-- Migration: Add default timeout and nudge frequency settings
-- ============================================================

alter table club_settings add column if not exists default_timeout_hours int not null default 24;
alter table club_settings add column if not exists nudge_frequency_hours int not null default 12;
