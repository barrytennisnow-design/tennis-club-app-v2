import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchProposedEmail } from "@/lib/email";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";
import { checkSameDayConflict } from "@/lib/conflict";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: Request) {
  const { match_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("id, first_name, last_name, role, permissions").eq("auth_user_id", userData.user.id).single();
  if (!me || !hasPermission(me, "matrix_propose_match")) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select("*, court:courts(name), match_players(player_id, players(first_name, last_name, email))")
    .eq("id", match_id)
    .single();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "draft") {
    return NextResponse.json({ error: "Only draft matches can be proposed" }, { status: 400 });
  }
  if (!match.court_id) {
    return NextResponse.json({ error: "Assign a court before proposing this match" }, { status: 400 });
  }

  // Pull the manager's current default timeout so it applies fresh at
  // the moment of proposing -- mirrors the old sheet's "hour for auto
  // cancel" column, which the manager set going into each proposal
  // round. Nudge count always restarts at 0 for a newly-proposed
  // match; both stay manager-editable afterward on the Matches page.
  const { data: settings } = await admin.from("club_settings").select("default_timeout_hours").single();
  const autoCancelHours = settings?.default_timeout_hours ?? 24;

  const { error: updateError } = await admin
    .from("matches")
    .update({
      status: "proposed",
      proposed_at: new Date().toISOString(),
      auto_cancel_hours: autoCancelHours,
      nudge_count: 0,
      proposed_by: me.id,
    })
    .eq("id", match_id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // If the manager/captain proposing this match is themselves one of
  // the players in it, auto-accept on their behalf -- same as
  // self-serve, where the person building the match is implicitly
  // "in" as soon as they propose it. Everyone else still has to
  // respond normally.
  const proposerIsInMatch = match.match_players.some((mp: any) => mp.player_id === me.id);
  if (proposerIsInMatch) {
    await admin
      .from("match_players")
      .update({ response_status: "accepted", responded_at: new Date().toISOString() })
      .eq("match_id", match_id)
      .eq("player_id", me.id);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay(match, defaultTimeDisplay);

  // Lock the resolved time onto the match row itself right now. This
  // is what guarantees the time shown in this proposal email is the
  // EXACT same time that ends up on the confirmed email and its .ics
  // file later -- even if the manager changes the default time slot
  // in Manager Settings while this match is still awaiting responses.
  // (If the manager already set a custom time_display on this match
  // before proposing, timeDisplay already equals that override, so
  // this write-back is a harmless no-op in that case.)
  await admin.from("matches").update({ time_display: timeDisplay }).eq("id", match_id);

  // No .ics attachment at proposal time -- a match can still fall
  // through (declined / timed out), so a downloadable calendar file
  // is only offered once it's actually confirmed (see
  // respond-match/route.ts and the "Download Calendar Invite" button
  // on the player's Matches page).
  for (const mp of match.match_players) {
    if (!mp.players) continue;
    if (mp.player_id === me.id) continue; // already auto-accepted above, no need to ask them to respond
    const teammates = match.match_players
      .filter((other: any) => other.player_id !== mp.player_id && other.players)
      .map((other: any) => `${other.players.first_name} ${other.players.last_name}`);

    // Conflict check: does this player already have another
    // proposed/confirmed match on the same date? We have no access to
    // anyone's personal/external calendar, so this only checks other
    // matches already tracked in this system -- but it's the same
    // "can't be in two places at once" conflict that matters here.
    const conflictNote = await checkSameDayConflict(admin, mp.player_id, match.match_date, match_id);

    const { subject, html } = matchProposedEmail({
      matchNumber: match.match_number,
      firstName: mp.players.first_name,
      matchDate: match.match_date,
      timeSlot: timeDisplay,
      courtName: match.court?.name ?? "Court TBD",
      teammates,
      acceptUrl: `${siteUrl}/matches`,
      conflictNote,
      proposedByName: `${me.first_name} ${me.last_name}`,
    });

    await sendEmail({
      supabaseAdmin: admin,
      to: mp.players.email,
      subject,
      html,
    });
  }

  return NextResponse.json({ ok: true });
}
