// Shared eligibility logic for self-serve match building. Kept in
// one place so the "eligible dates" list, the "open players" list,
// and the actual propose action can never disagree with each other
// about who's allowed to do what.

export async function getSelfServeWindowDays(supabaseAdmin: any): Promise<number> {
  const { data } = await supabaseAdmin.from("club_settings").select("self_serve_window_days").single();
  return data?.self_serve_window_days ?? 3;
}

export function isWithinSelfServeWindow(dateStr: string, windowDays: number): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= windowDays;
}

// Players already tied up in a draft/proposed/confirmed match on a
// given date -- drafts count here (unlike some other checks in this
// app) because a self-serve match shouldn't silently double-book
// someone the manager has already sketched in on the matrix.
export async function getAssignedPlayerIds(supabaseAdmin: any, date: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("match_players")
    .select("player_id, matches!inner(match_date, status)")
    .eq("matches.match_date", date)
    .in("matches.status", ["draft", "proposed", "confirmed"]);
  return new Set((data ?? []).map((r: any) => r.player_id));
}
