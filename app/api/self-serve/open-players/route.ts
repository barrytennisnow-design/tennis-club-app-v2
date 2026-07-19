import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { getSelfServeWindowDays, isWithinSelfServeWindow, getAssignedPlayerIds } from "@/lib/selfServe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const mode = searchParams.get("mode") === "any" ? "any" : "available";
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("players").select("*").eq("auth_user_id", userData.user.id).single();
  if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (!me.self_serve_opt_in) return NextResponse.json({ error: "Self-serve isn't turned on for your account" }, { status: 403 });

  const windowDays = await getSelfServeWindowDays(admin);
  if (!isWithinSelfServeWindow(date, windowDays)) {
    return NextResponse.json({ error: "This date isn't open for self-serve yet" }, { status: 403 });
  }

  const { data: myAvail } = await admin
    .from("availability")
    .select("id")
    .eq("player_id", me.id)
    .eq("date", date)
    .eq("time_slot", "morning")
    .maybeSingle();
  if (!myAvail) return NextResponse.json({ error: "You're not marked available that day" }, { status: 403 });

  const assigned = await getAssignedPlayerIds(admin, date);
  if (assigned.has(me.id)) {
    return NextResponse.json({ error: "You're already in a match that day" }, { status: 403 });
  }

  // Two distinct modes, picked by the client:
  //  - "available": only players who've marked themselves available
  //    that day (the original, narrower self-serve pool).
  //  - "any": every active roster player, whether or not they've
  //    marked that day available -- opt-in only controls who can
  //    BUILD a match; anyone active can still be invited into one.
  // Either way, nobody already tied up in a proposed/confirmed match
  // that day is included, and they do NOT need to be opted into
  // self-serve themselves to be invited.
  let players: any[];

  if (mode === "any") {
    const { data: activePlayers } = await admin
      .from("players")
      .select("id, first_name, last_name, status")
      .eq("status", "active")
      .neq("id", me.id);

    const { data: availRows } = await admin
      .from("availability")
      .select("player_id")
      .eq("date", date)
      .eq("time_slot", "morning");
    const availableIds = new Set((availRows ?? []).map((r: any) => r.player_id));

    players = (activePlayers ?? [])
      .filter((p: any) => !assigned.has(p.id))
      .map((p: any) => ({ ...p, available: availableIds.has(p.id) }))
      .sort((a: any, b: any) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      });
  } else {
    const { data: availRows } = await admin
      .from("availability")
      .select("player_id, players!inner(id, first_name, last_name, status)")
      .eq("date", date)
      .eq("time_slot", "morning")
      .eq("players.status", "active")
      .neq("player_id", me.id);

    players = (availRows ?? [])
      .map((r: any) => ({ ...r.players, available: true }))
      .filter((p: any) => !assigned.has(p.id))
      .sort((a: any, b: any) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  }

  return NextResponse.json({ ok: true, players });
}
