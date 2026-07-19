// Creates a self-serve match: re-validates everything server-side,
// auto-accepts the proposer, proposes to everyone else picked (group
// size is exactly 2 or 4 total, i.e. exactly 1 or 3 other players --
// no other sizes allowed) through the exact same pipeline as a
// manager-proposed match. Conflicts (someone else grabbing the same
// date/player between page-load and submit) are handled first-to-
// propose: whichever request's re-validation runs first and passes
// wins the insert; anyone after that gets a 409 telling them to pick
// again with the now-current list.
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchProposedEmail } from "@/lib/email";
import { getEmailTestModeSettings, applyFirstOnlyFilter } from "@/lib/emailTestMode";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";
import { checkSameDayConflict } from "@/lib/conflict";
import { getSelfServeWindowDays, isWithinSelfServeWindow, getAssignedPlayerIds } from "@/lib/selfServe";
import { getNextMatchNumber } from "@/lib/matching";
import { notifyPlayer } from "@/lib/notifications";

export async function POST(request: Request) {
  const { date, court_id, time_display, player_ids } = await request.json();

  if (!date || !court_id || !Array.isArray(player_ids) || (player_ids.length !== 1 && player_ids.length !== 3)) {
    return NextResponse.json({ error: "A date, court, and exactly 1 or 3 other players are required (2 or 4 players total)" }, { status: 400 });
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

  // Re-verify the proposer's own availability -- they were only ever
  // offered this date because of it (see eligible-dates), but a stale
  // page load could still try to submit an old date.
  const { data: myAvail } = await admin
    .from("availability")
    .select("id")
    .eq("player_id", me.id)
    .eq("date", date)
    .eq("time_slot", "morning")
    .maybeSingle();
  if (!myAvail) {
    return NextResponse.json({ error: "You're not marked available that day" }, { status: 403 });
  }

  // The other players do NOT need to have marked themselves available
  // that day -- anyone active and not already assigned is pickable.
  // Just pull their details directly rather than via the availability
  // join, so someone without an availability row still gets included
  // (and still gets their email).
  const { data: playerRows } = await admin
    .from("players")
    .select("id, first_name, last_name, email, phone, access_token, status")
    .in("id", allPlayerIds);
  if ((playerRows ?? []).length !== allPlayerIds.length) {
    return NextResponse.json({ error: "One of the players you picked couldn't be found" }, { status: 404 });
  }
  const notActive = (playerRows ?? []).filter((p: any) => p.status !== "active");
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
      proposed_by: me.id,
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

  const namesById = new Map<string, string>((playerRows ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]));
  const rowById = new Map<string, any>((playerRows ?? []).map((p: any) => [p.id, p]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  // Full roster shown in the email, same shape as the My Matches page.
  const roster = allPlayerIds.map((id) => ({
    name: namesById.get(id) ?? "Unknown",
    status: id === me.id ? "accepted" : "proposed",
    phone: rowById.get(id)?.phone ?? null,
  }));

  const testMode = await getEmailTestModeSettings(admin);
  const emailRecipientIds = applyFirstOnlyFilter(player_ids, testMode);

  for (const pid of emailRecipientIds) {
    const player = (playerRows ?? []).find((p: any) => p.id === pid);
    if (!player) continue;
    const conflictNote = await checkSameDayConflict(admin, pid, date, newMatch.id);
    // Self-authenticating access-token link -- deep-links straight to
    // this match on /matches with the player already logged in, same
    // as the manager-propose flow.
    const acceptUrl = player.access_token
      ? `${siteUrl}/access/${player.access_token}?next=${encodeURIComponent(`/matches#match-${newMatch.id}`)}`
      : `${siteUrl}/matches`;
    const { subject, html } = matchProposedEmail({
      matchNumber,
      firstName: player.first_name,
      matchDate: date,
      timeSlot: timeDisplay,
      courtName: court.name,
      roster,
      proposedAt: newMatch.proposed_at,
      acceptUrl,
      conflictNote,
      proposedByName: `${me.first_name} ${me.last_name}`,
    });
    await sendEmail({ supabaseAdmin: admin, to: player.email, subject, html });
    await notifyPlayer({
      admin,
      playerId: pid,
      type: "match_proposed",
      title: subject,
      body: "Tap to view the match and respond.",
      matchId: newMatch.id,
    });
  }

  return NextResponse.json({ ok: true, matchNumber });
}
