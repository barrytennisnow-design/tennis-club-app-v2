// Shared rule for whether a given match_players row should be hidden
// from a "who's in this match" roster display (manager Matches page,
// the Match Matrix's per-match detail panel, and a player's own "Your
// Matches" page). Kept in one place so all three stay consistent --
// previously each page had its own ad hoc (or missing) filter, which
// is why a declined Build-a-Match invitee could show up on one page
// and not another.
//
// Classic, manager-assigned matches (no target_size) always show
// their full fixed roster -- a decline there is meaningful, permanent
// information about that specific match.
//
// Build-a-Match / self-serve matches (target_size set) work
// differently: a decline just means that candidate's slot goes back
// into the pool and gets backfilled from wave 2 or another candidate.
// It was never "part of the match" in any lasting sense, so once the
// match is proposed or confirmed, a decline is just noise -- it
// shouldn't clutter the list of who's actually playing. Cancelled BAM
// matches are the one exception: there, seeing who had accepted vs.
// declined is useful context for why the match fell through, so those
// stay visible.
export function shouldHideBamDecline(
  responseStatus: string | null | undefined,
  targetSize: number | null | undefined,
  matchStatus: string | null | undefined
): boolean {
  if (!targetSize) return false;
  if (responseStatus !== "declined") return false;
  return matchStatus === "proposed" || matchStatus === "confirmed";
}

// The player's own "Your Matches" page wants a simpler picture than
// the manager Matches page / Match Matrix: while a Build-a-Match
// invite is proposed or confirmed, show ONLY the players who have
// actually accepted -- not every candidate who's been asked (still-
// pending "proposed" invites and declines alike). That "who's still
// out for confirmation" detail belongs on the manager-facing pages;
// a player just wants to know who they're actually playing with, plus
// the "3/4 accepted" count shown alongside it. Classic manager-
// assigned matches, and cancelled BAM matches (kept as full history),
// are unaffected.
export function shouldShowInPlayerRoster(
  responseStatus: string | null | undefined,
  targetSize: number | null | undefined,
  matchStatus: string | null | undefined
): boolean {
  if (!targetSize) return true;
  if (matchStatus === "proposed" || matchStatus === "confirmed") {
    return responseStatus === "accepted";
  }
  return true;
}
