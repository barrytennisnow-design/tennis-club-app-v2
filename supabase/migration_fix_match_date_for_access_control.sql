-- ============================================================
-- Fix: match_date_for had no access control -- any caller
-- (including logged-out/anon) could call
-- /rest/v1/rpc/match_date_for with any match_id and get that
-- match's date back, bypassing RLS on `matches` entirely.
--
-- This restricts it to: managers, captains, or a player who is
-- actually in that match. Safe to run on top of what's already
-- deployed -- it's create-or-replace.
-- ============================================================

create or replace function match_date_for(match_id_arg uuid)
returns date
language sql
security definer
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
