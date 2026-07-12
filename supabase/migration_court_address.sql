-- ============================================================
-- Migration: Add address field to courts table
-- ============================================================

alter table courts add column if not exists address text;
