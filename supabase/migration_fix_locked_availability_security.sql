-- ============================================================
-- Fixes Supabase Security Advisor warning: security_definer_view
-- on public.locked_availability.
--
-- By default, Postgres views run with the permissions of the
-- view's OWNER rather than the querying user -- which means a
-- view can silently bypass the RLS policies on its underlying
-- tables. Since locked_availability is exposed to PostgREST (every
-- table/view in the public schema is, by default), any logged-in
-- user could query it directly and see every player's locked
-- availability, not just their own.
--
-- security_invoker = true (Postgres 15+) makes the view run with
-- the QUERYING user's own permissions instead, so it correctly
-- respects match_players' existing "players view their own match
-- entries" RLS policy.
-- ============================================================

alter view locked_availability set (security_invoker = true);
