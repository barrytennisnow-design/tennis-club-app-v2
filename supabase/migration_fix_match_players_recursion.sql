-- ============================================================
-- Fix: "infinite recursion detected in policy for relation
-- match_players" when loading the Match Matrix.
--
-- Cause: the base schema's "players view matches they're in"
-- policy (on `matches`) subqueries `match_players`. The captains
-- migration then added a `match_players` policy that joins back to
-- `matches`. Postgres evaluates both together, and each one
-- re-triggers the other forever.
--
-- Fix: look up the match's date through a security-definer
-- function (same trick is_manager()/has_permission() already use)
-- instead of joining `matches` directly from within a
-- `match_players` policy -- this bypasses `matches`' own RLS
-- instead of re-triggering it, breaking the cycle.
--
-- Safe to run even though migration_captains.sql already ran --
-- everything here is create-or-replace / drop-if-exists.
-- ============================================================

-- SECURITY DEFINER means this runs with the function owner's
-- privileges, which bypasses RLS entirely for every query inside
-- it -- that's what breaks the recursion cycle with match_players'
-- own policies. But it also means this function had NO access
-- control of its own: as originally written, anyone (including a
-- logged-out anon caller) could call
-- /rest/v1/rpc/match_date_for with any match_id and get its date,
-- bypassing the matches table's RLS entirely. This adds an actual
-- check: only managers, captains, or someone actually in the match
-- get a result back. Since the whole function body still runs
-- with bypassrls, this internal check does NOT re-trigger
-- match_players' or matches' RLS policies either -- no recursion
-- risk from adding it.
create or replace function match_date_for(match_id_arg uuid)
returns date
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select match_date from matches
  where id = match_id_arg
    and (
      is_manager()
      or exists (
        select 1 from players p
        where p.auth_user_id = auth.uid() and p.role = 'captain'
      )
      or exists (
        select 1 from match_players mp
        join players pl on pl.id = mp.player_id
        where mp.match_id = match_id_arg and pl.auth_user_id = auth.uid()
      )
    );
$$;

drop policy if exists "captains view match_players within display cap" on match_players;
create policy "captains view match_players within display cap"
  on match_players for select
  using (
    exists (
      select 1 from players p
      where p.auth_user_id = auth.uid()
        and p.role = 'captain'
        and match_date_for(match_players.match_id) <= (current_date + coalesce((p.permissions->>'matrix_display_days_ahead')::int, 0))
    )
  );
