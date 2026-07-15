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

create or replace function match_date_for(match_id_arg uuid)
returns date
language sql
security definer
stable
as $$
  select match_date from matches where id = match_id_arg;
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
