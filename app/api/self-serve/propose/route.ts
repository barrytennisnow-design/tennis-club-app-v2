// Creates a self-serve match: re-validates everything server-side,
// auto-accepts the proposer, proposes to everyone else picked (group
// size 2-6 total, i.e. 1-5 other players) through the exact same
// pipeline as a manager-proposed match. Conflicts (someone else
// grabbing the same date/player between page-load and submit) are
// handled first-to-propose: whichever request's re-validation runs
// first and passes wins the insert; anyone after that gets a 409
// telling them to pick again with the now-current list.
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchProposedEmail } from "@/lib/email";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";
import { checkSameDayConflict } from "@/lib/conflict";
import { getSelfServeWindowDays, isWithinSelfServeWindow, getAssignedPlayerIds } from "@/lib/selfServe";
import { getNextMatchNumber } from "@/lib/matching";

export async function POST(request: Request) {
  const { date, court_id, time_display, player_ids } = await request.json();

  if (!date || !court_id || !Array.isArray(player_ids) || player_ids.length < 1 || player_ids.length > 5) {
    return NextResponse.json({ error: "A date, court, and 1 to 5 other players are required (2-6 players total)" }, { status: 400 });
  }
  if (new Set(player_ids).size !== player_ids.length) {
    return NextResponse.json({ error: "Duplicate players selected" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("players").select("*").eq("auth_user_id", userData.user.id).single();
  if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (!me.self_serve_opt_in) {
    return NextResponse.json({ error: "Self-serve isn't turned on for your account" }, { status: 403 });
  }
  if (player_ids.includes(me.id)) {
    return NextResponse.json({ error: "You're automatically included as the proposer -- don't select yourself" }, { status: 400 });
  }

  // Re-check everything server-side rather than trusting the list the
  // client fetched a moment ago -- someone else may have grabbed one
  // of these players (or this date) in the meantime.
  const windowDays = await getSelfServeWindowDays(admin);
  if (!isWithinSelfServeWindow(date, windowDays)) {
    return NextResponse.json({ error: "This date isn't open for self-serve yet" }, { status: 403 });
  }

  const allPlayerIds = [me.id, ...player_ids];
  const assigned = await getAssignedPlayerIds(admin, date);
  const alreadyTaken = allPlayerIds.filter((id) => assigned.has(id));
  if (alreadyTaken.length > 0) {
    return NextResponse.json({
      error: alreadyTaken.includes(me.id)
        ? "You're already in a match that day"
        : "One of the players you picked was just claimed for this date by someone else -- please pick again",
    }, { status: 409 });
  }

  const { data: availRows } = await admin
    .from("availability")
    .select("player_id, players!inner(id, first_name, last_name, email, status)")
    .eq("date", date)
    .eq("time_slot", "morning")
    .in("player_id", allPlayerIds);
  const availableIds = new Set((availRows ?? []).map((r: any) => r.player_id));
  const notAvailable = allPlayerIds.filter((id) => !availableIds.has(id));
  if (notAvailable.length > 0) {
    return NextResponse.json({ error: "Everyone in the match needs to be marked available that day" }, { status: 400 });
  }
  const notActive = (availRows ?? []).filter((r: any) => r.players.status !== "active");
  if (notActive.length > 0) {
    return NextResponse.json({ error: "One of the players you picked is no longer active" }, { status: 409 });
  }

  const { data: court } = await admin.from("courts").select("id, name").eq("id", court_id).eq("is_active", true).maybeSingle();
  if (!court) return NextResponse.json({ error: "Pick a valid court" }, { status: 400 });

  const { data: settings } = await admin.from("club_settings").select("default_timeout_hours").single();
  const autoCancelHours = settings?.default_timeout_hours ?? 24;
  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay({ time_display }, defaultTimeDisplay);

  const matchNumber = await getNextMatchNumber(admin);

  const { data: newMatch, error: insertError } = await admin
    .from("matches")
    .insert({
      match_number: matchNumber,
      match_date: date,
      time_slot: "morning",
      time_display: timeDisplay,
      court_id: court.id,
      status: "proposed",
      proposed_at: new Date().toISOString(),
      auto_cancel_hours: autoCancelHours,
      nudge_count: 0,
      created_by: me.id,
    })
    .select()
    .single();
  if (insertError || !newMatch) {
    return NextResponse.json({ error: insertError?.message ?? "Couldn't create the match" }, { status: 500 });
  }

  // The proposer built this match on purpose -- auto-accept them so
  // they're not stuck waiting on their own response. Everyone else
  // goes through the exact same accept/decline flow as any
  // manager-proposed match, including auto-cancel and nudges.
  const now = new Date().toISOString();
  await admin.from("match_players").insert([
    { match_id: newMatch.id, player_id: me.id, response_status: "accepted", responded_at: now },
    ...player_ids.map((pid: string) => ({ match_id: newMatch.id, player_id: pid, response_status: "proposed" })),
  ]);

  const namesById = new Map<string, string>((availRows ?? []).map((r: any) => [r.player_id, `${r.players.first_name} ${r.players.last_name}`]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  for (const pid of player_ids) {
    const row = (availRows ?? []).find((r: any) => r.player_id === pid);
    if (!row) continue;
    const teammates = allPlayerIds.filter((id) => id !== pid).map((id) => namesById.get(id) ?? "Unknown");
    const conflictNote = await checkSameDayConflict(admin, pid, date, newMatch.id);
    const { subject, html } = matchProposedEmail({
      matchNumber,
      firstName: row.players.first_name,
      matchDate: date,
      timeSlot: timeDisplay,
      courtName: court.name,
      teammates,
      acceptUrl: `${siteUrl}/matches`,
      conflictNote,
    });
    await sendEmail({ supabaseAdmin: admin, to: row.players.email, subject, html });
  }

  return NextResponse.json({ ok: true, matchNumber });
}
