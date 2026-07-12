-- Players could previously only see their OWN row in match_players
-- (per the original "players view their own match entries" policy),
-- which is why the player-facing "My Matches" page only ever showed
-- themselves instead of all 4 players. This adds visibility into
-- every player's row for any match they're personally part of.
create policy "players view co-participants in their matches"
  on match_players for select
  using (
    match_id in (
      select mp2.match_id from match_players mp2
      join players p on p.id = mp2.player_id
      where p.auth_user_id = auth.uid()
    )
  );
