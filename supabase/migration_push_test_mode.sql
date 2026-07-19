-- ============================================================
-- Migration: push test mode -- same idea as email's
-- sandbox_mode/sandbox_email (migration_email_test_mode.sql), but
-- for push notifications: while push_test_mode is on, every push
-- that would have gone to a real player's device instead goes to
-- one chosen player's devices (push_test_player_id), with the
-- notification title prefixed to show who it was really for. Lets
-- you test match proposals/nudges/cancellations end to end -- the
-- actual phone alert included -- without spamming real players'
-- devices. Manager-only, toggled from Settings, no redeploy needed.
-- ============================================================

alter table club_settings
  add column if not exists push_test_mode boolean not null default false,
  add column if not exists push_test_player_id uuid references players(id) on delete set null;
