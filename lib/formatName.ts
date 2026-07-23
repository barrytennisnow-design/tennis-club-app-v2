// Privacy-friendly display name: "Jane D." instead of "Jane Doe".
// Used specifically for showing who proposed a match -- match matrix,
// matches pages, emails, ics files, etc. General roster/admin views
// (where a manager/captain needs to identify a specific player) still
// use full names; this is only for the "proposed by" attribution.
//
// `targetSize` is a self-serve (Build-a-Match) match's target_size
// column (2 or 4) -- pass it whenever the match being displayed
// actually IS one, and this appends a "BAM2" / "BAM4" tag so it's
// visible at a glance everywhere a proposer's name shows: which
// matches came from Build-a-Match (vs. the classic Generate Matches
// + manager Propose flow), and how many total players that specific
// match needs. Omit it (or pass null/undefined) for classic matches
// -- target_size is null for those in the database, so there's
// nothing to tag.
export function proposerDisplayName(
  player: { first_name?: string | null; last_name?: string | null } | null | undefined,
  targetSize?: number | null
): string | null {
  if (!player?.first_name) return null;
  const initial = player.last_name?.trim()?.charAt(0);
  const bamTag = targetSize === 2 || targetSize === 4 ? ` BAM${targetSize}` : "";
  return initial ? `${player.first_name} ${initial}.${bamTag}` : `${player.first_name}${bamTag}`;
}
