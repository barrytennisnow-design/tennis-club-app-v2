// Checks whether a player already has another proposed/confirmed
// match on a given date -- the only "calendar" this app actually has
// access to (see propose-match/route.ts for the fuller explanation).
// Shared between manager-initiated proposals and self-serve ones so
// both surface the exact same warning the exact same way.

export async function checkSameDayConflict(
  supabaseAdmin: any,
  playerId: string,
  date: string,
  excludeMatchId: string
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("match_players")
    .select("matches!inner(id, match_number, match_date, status)")
    .eq("player_id", playerId)
    .eq("matches.match_date", date)
    .in("matches.status", ["proposed", "confirmed"])
    .neq("matches.id", excludeMatchId);
  const conflict = (data ?? [])[0]?.matches as any;
  return conflict ? `You already have Match M${conflict.match_number} scheduled on this same date.` : null;
}
