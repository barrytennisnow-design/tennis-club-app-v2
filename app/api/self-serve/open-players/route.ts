import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { getSelfServeWindowDays, isWithinSelfServeWindow, getAssignedPlayerIds, isManagerOrCaptain } from "@/lib/selfServe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("players").select("*").eq("auth_user_id", userData.user.id).single();
  if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const isStaff = isManagerOrCaptain(me.role);
  if (!isStaff && !me.self_serve_opt_in) {
    return NextResponse.json({ error: "Self-serve isn't turned on for your account" }, { status: 403 });
  }

  // Managers/captains can organize a match for any future date;
  // everyone else is limited to the self-serve window.
  if (!isStaff) {
    const windowDays = await getSelfServeWindowDays(admin);
    if (!isWithinSelfServeWindow(date, windowDays)) {
      return NextResponse.json({ error: "This date isn't open for self-serve yet" }, { status: 403 });
    }
  }

  // Players already tied up in a proposed/confirmed match that day --
  // drafts don't count, same rule as everywhere else in self-serve.
  const assigned = await getAssignedPlayerIds(admin, date);

  // A regular player is always one of the players in the match
  // they're building. eligible-dates already keeps them from picking
  // a date where they're tied up, but double-check here too rather
  // than trust the client's earlier fetch.
  if (!isStaff && assigned.has(me.id)) {
    return NextResponse.json({ error: "You're already in a match that day" }, { status: 403 });
  }

  // Everyone opted in to self-serve can invite from both pools --
  // players marked available that day, and everyone else on the
  // active roster who wasn't. The wave-1/wave-2 split (who gets
  // invited immediately vs. only if the match is still short after
  // the response window) happens at propose time regardless of who's
  // building the match; this endpoint just shows both lists.
  //
  // The organizer's own row is included here too (flagged is_self)
  // rather than handled separately, so the UI can show and select
  // them as a player directly in the list instead of via a hidden
  // side channel. If the organizer is a manager/captain who's
  // already tied up that day, `assigned` filters their own row out
  // below just like anyone else's -- they simply won't be offered as
  // a selectable player for that date.
  const { data: activePlayers } = await admin
    .from("players")
    .select("id, first_name, last_name, status")
    .eq("status", "active");

  const { data: availRows } = await admin.from("availability").select("player_id").eq("date", date).eq("time_slot", "morning");
  const availableIds = new Set((availRows ?? []).map((r: any) => r.player_id));

  const players = (activePlayers ?? [])
    .filter((p: any) => !assigned.has(p.id))
    .map((p: any) => ({ ...p, available: availableIds.has(p.id), is_self: p.id === me.id }))
    .sort((a: any, b: any) => {
      if (a.is_self !== b.is_self) return a.is_self ? -1 : 1;
      if (a.available !== b.available) return a.available ? -1 : 1;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

  return NextResponse.json({ ok: true, players, canInviteAnyRoster: true, isStaff });
}
