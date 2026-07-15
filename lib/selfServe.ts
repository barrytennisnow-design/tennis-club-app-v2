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

// Players already tied up in a proposed/confirmed match on a given
// date. Draft matches do NOT count here -- a draft is just the
// manager's unproposed sketch on the matrix, nothing has actually
// been sent to anyone, so those players should still be pickable
// for a self-serve match until something is actually proposed.
export async function getAssignedPlayerIds(supabaseAdmin: any, date: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("match_players")
    .select("player_id, matches!inner(match_date, status)")
    .eq("matches.match_date", date)
    .in("matches.status", ["proposed", "confirmed"]);
  return new Set((data ?? []).map((r: any) => r.player_id));
}
