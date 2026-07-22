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

  // Regular (non-staff) players are always one of the players in the
  // match they're building, so drop any date where they're already
  // tied up in a proposed/confirmed match. A draft doesn't count --
  // it's just an unproposed sketch on the matrix, nothing's actually
  // been sent to anyone, so those players are still free to build a
  // self-serve match until something is actually proposed.
  //
  // Managers/captains are NOT filtered by their own schedule here:
  // they can organize a match for any date in the horizon whether or
  // not they intend to play in it, and whether or not they're free
  // that day. Whether they can additionally join AS a player on a
  // given date is decided later, once a date is picked (see
  // open-players/route.ts) -- their own name simply won't be offered
  // as a selectable player on a date they're already committed to.
  let dates = candidateDates;
  if (!isStaff) {
    const { data: assignedRows } = await admin
      .from("match_players")
      .select("matches!inner(match_date, status)")
      .eq("player_id", me.id)
      .in("matches.status", ["proposed", "confirmed"])
      .in("matches.match_date", candidateDates);
    const assignedDates = new Set((assignedRows ?? []).map((r: any) => r.matches.match_date));
    dates = candidateDates.filter((d: string) => !assignedDates.has(d));
  }

  return NextResponse.json({ optedIn: true, dates: dates.sort(), canInviteAnyRoster: isStaff, isStaff });
}
