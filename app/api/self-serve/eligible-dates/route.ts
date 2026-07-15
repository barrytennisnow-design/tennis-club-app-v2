import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { getSelfServeWindowDays, isWithinSelfServeWindow } from "@/lib/selfServe";

export async function GET() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("players").select("*").eq("auth_user_id", userData.user.id).single();
  if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (!me.self_serve_opt_in) return NextResponse.json({ optedIn: false, dates: [] });

  const windowDays = await getSelfServeWindowDays(admin);
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: availRows } = await admin
    .from("availability")
    .select("date")
    .eq("player_id", me.id)
    .gte("date", todayStr);

  const candidateDates = (availRows ?? [])
    .map((r: any) => r.date as string)
    .filter((d: string) => isWithinSelfServeWindow(d, windowDays));

  if (candidateDates.length === 0) return NextResponse.json({ optedIn: true, dates: [] });

  // Drop any date where this player is already tied up in a
  // draft/proposed/confirmed match -- nothing to build there.
  const { data: assignedRows } = await admin
    .from("match_players")
    .select("matches!inner(match_date, status)")
    .eq("player_id", me.id)
    .in("matches.status", ["draft", "proposed", "confirmed"])
    .in("matches.match_date", candidateDates);
  const assignedDates = new Set((assignedRows ?? []).map((r: any) => r.matches.match_date));

  const dates = candidateDates.filter((d: string) => !assignedDates.has(d)).sort();
  return NextResponse.json({ optedIn: true, dates });
}
