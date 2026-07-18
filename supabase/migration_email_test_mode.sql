-- ============================================================
-- Migration: Email Test Mode
-- Add flags for email testing/debugging
-- ============================================================

alter table club_settings
  add column if not exists email_test_mode_send_to_first_only boolean not null default false,
  add column if not exists email_test_mode_disable_emails boolean not null default false;
