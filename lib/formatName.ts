// Privacy-friendly display name: "Jane D." instead of "Jane Doe".
// Used specifically for showing who proposed a match -- match matrix,
// matches pages, emails, ics files, etc. General roster/admin views
// (where a manager/captain needs to identify a specific player) still
// use full names; this is only for the "proposed by" attribution.
export function proposerDisplayName(
  player: { first_name?: string | null; last_name?: string | null } | null | undefined
): string | null {
  if (!player?.first_name) return null;
  const initial = player.last_name?.trim()?.charAt(0);
  return initial ? `${player.first_name} ${initial}. BAM` : player.first_name;
}
