-- ============================================================
-- Fixes Supabase Security Advisor warning: function_search_path_mutable.
--
-- SECURITY DEFINER functions run with the function owner's
-- privileges. If search_path isn't pinned, a caller could
-- (in principle) create objects in a schema that resolves earlier
-- in their own session's search_path, shadowing an unqualified
-- table/function name referenced inside the function body -- and
-- get that object executed with the DEFINER's elevated privileges
-- instead of the caller's own.
--
-- Pinning search_path to a fixed, known value closes that door.
-- This covers all three SECURITY DEFINER functions this app owns
-- (match_date_for was the one actually flagged; has_permission and
-- is_manager aren't flagged yet in this scan, but have the exact
-- same gap, so fixing all three now).
-- ============================================================

alter function has_permission(text) set search_path = public, pg_temp;
alter function is_manager() set search_path = public, pg_temp;
alter function match_date_for(uuid) set search_path = public, pg_temp;
