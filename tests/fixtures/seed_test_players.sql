-- ============================================================
-- Test fixtures for the Playwright E2E suite.
--
-- !! RUN THIS ONLY ON A SEPARATE, DEDICATED TEST SUPABASE PROJECT !!
-- Never run this against your production database. It creates
-- fake player rows and (when the suite runs) fake matches. If run
-- against production, real availability/matches data could get
-- mixed in with test junk, and -- if SANDBOX_MODE isn't also set --
-- real emails could go out referencing fake matches.
--
-- Run this AFTER schema.sql + every migration_*.sql on your TEST
-- project (same setup as production, just a different project).
-- Courts/time slots below intentionally match seed.sql so the
-- fixtures aren't relying on you also running seed.sql separately.
-- ============================================================

insert into courts (name, location, is_active, is_default, sort_order) values
  ('Test Court 1', 'Test Facility', true, true, 0),
  ('Test Court 2', 'Test Facility', true, false, 1)
on conflict do nothing;

insert into time_slots (description, is_active, is_default, sort_order) values
  ('8:00am warmup, 8:15am start play', true, true, 0),
  ('8:30am warmup, 8:45am start play', true, false, 1)
on conflict do nothing;

-- Test players. NOT real people -- fake, clearly-labeled emails so
-- there is never any ambiguity with real club data. auth_user_id is
-- filled in by tests/setup/global-setup.ts the first time each
-- account logs in (same first-login-links-the-row flow real users
-- go through via /auth/callback), so these rows start unlinked.
insert into players
  (email, first_name, last_name, status, role, self_serve_opt_in, self_reported_ranking, permissions)
values
  ('e2e-manager@example-test.invalid',   'E2E', 'Manager',    'active', 'manager', true, 4.0, '{}'),
  ('e2e-captain@example-test.invalid',   'E2E', 'Captain',    'active', 'captain', true, 4.0,
    '{"matrix_generate": true, "matrix_propose_match": true, "matrix_cancel_match": true}'),
  ('e2e-player-a@example-test.invalid',  'E2E', 'PlayerA',    'active', 'player',  true, 4.0, '{}'),
  ('e2e-player-b@example-test.invalid',  'E2E', 'PlayerB',    'active', 'player',  true, 3.5, '{}'),
  ('e2e-player-c@example-test.invalid',  'E2E', 'PlayerC',    'active', 'player',  true, 3.5, '{}'),
  ('e2e-player-d@example-test.invalid',  'E2E', 'PlayerD',    'active', 'player',  true, 3.0, '{}'),
  ('e2e-player-e@example-test.invalid',  'E2E', 'PlayerE',    'active', 'player',  true, 3.0, '{}'),
  ('e2e-player-f@example-test.invalid',  'E2E', 'PlayerF',    'active', 'player',  false, 3.0, '{}') -- deliberately NOT opted into self-serve
on conflict (email) do nothing;
