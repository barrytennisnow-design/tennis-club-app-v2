-- ============================================================
-- Migration: Remove "Send no emails" test-mode setting
-- The auto-login-as-manager bypass tied to this flag has been
-- removed from middleware.ts in favor of real passkey login (see
-- PASSKEYS_SETUP.md). This column is no longer read anywhere in the
-- app, so it's safe to drop.
-- ============================================================

alter table club_settings
  drop column if exists email_test_mode_disable_emails;
