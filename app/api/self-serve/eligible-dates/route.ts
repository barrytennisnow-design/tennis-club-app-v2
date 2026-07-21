import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { getSelfServeWindowDays, isWithinSelfServeWindow, isManagerOrCaptain } from "@/lib/selfServe";

// How far out to offer date buttons for managers/captains, who
// aren't bound by the self-serve window -- they can organize a
// match for any future date, but the list still needs a horizon
// rather than an infinite button list. This is just a UI cap; the
// propose route itself doesn't enforce it for staff.
const STAFF_DATE_HORIZON_DAYS = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Whether the organizer plans to include themselves as one of the
  // players -- affects whether "am I already tied up that day"
  // should exclude a date. Only meaningful for managers/captains,
  // who are the only ones allowed to leave themselves out at all.
  const includeSelf = searchParams.get("include_self") !== "false";

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("players").select("*").eq("auth_user_id", userData.user.id).single();
  if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const isStaff = isManagerOrCaptain(me.role);
  // Regular players still need to be opted in; managers/captains are
  // organizing, not necessarily playing, so this doesn't gate them.
  if (!isStaff && !me.self_serve_opt_in) {
    return NextResponse.json({ optedIn: false, dates: [], canInviteAnyRoster: isStaff, isStaff });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  let candidateDates: string[];

  if (isStaff) {
    candidateDates = Array.from({ length: STAFF_DATE_HORIZON_DAYS }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  } else {
    const windowDays = await getSelfServeWindowDays(admin);
    candidateDates = Array.from({ length: windowDays + 1 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    }).filter((d) => isWithinSelfServeWindow(d, windowDays));
  }

  if (candidateDates.length === 0) {
    return NextResponse.json({ optedIn: true, dates: [], canInviteAnyRoster: isStaff, isStaff });
  }

  // Drop any date where the organizer is already tied up in a
  // draft/proposed/confirmed match -- only relevant if they're
  // planning to be a player themselves.
  let dates = candidateDates;
  if (includeSelf) {
    const { data: assignedRows } = await admin
      .from("match_players")
      .select("matches!inner(match_date, status)")
      .eq("player_id", me.id)
      .in("matches.status", ["draft", "proposed", "confirmed"])
      .in("matches.match_date", candidateDates);
    const assignedDates = new Set((assignedRows ?? []).map((r: any) => r.matches.match_date));
    dates = candidateDates.filter((d: string) => !assignedDates.has(d));
  }

  return NextResponse.json({ optedIn: true, dates: dates.sort(), canInviteAnyRoster: isStaff, isStaff });
}
