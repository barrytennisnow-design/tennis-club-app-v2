-- ============================================================
-- Fix: locked_availability was created as an implicit
-- SECURITY DEFINER view (Postgres/Supabase default when no
-- security_invoker option is set), which means it runs with the
-- view owner's privileges rather than the querying user's --
-- bypassing the RLS policies on match_players/matches that would
-- otherwise restrict a player to only seeing their own rows.
--
-- Switching to security_invoker = true makes it respect the
-- querying user's own RLS instead. This doesn't affect
-- lib/matching.ts's use of the view (it queries via the
-- service-role admin client, which bypasses RLS either way).
-- ============================================================

alter view locked_availability set (security_invoker = true);
