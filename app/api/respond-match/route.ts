import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchConfirmedEmail, matchCancelledEmail } from "@/lib/email";
import { buildMatchIcs } from "@/lib/ics";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";

export async function POST(request: Request) {
  const { match_player_id, response, decline_reason } = await request.json();

  if (!["accepted", "declined"].includes(response)) {
    return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();

  // Ownership check: this match_players row must belong to the
  // currently logged-in player.
  const { data: me } = await admin.from("players").select("id").eq("auth_user_id", userData.user.id).single();
  const { data: mpRow } = await admin
    .from("match_players")
    .select("id, player_id, match_id")
    .eq("id", match_player_id)
    .single();

  if (!me || !mpRow || mpRow.player_id !== me.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: match } = await admin.from("matches").select("status").eq("id", mpRow.match_id).single();
  if (!match || match.status !== "proposed") {
    return NextResponse.json({ error: "This match is no longer awaiting responses" }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("match_players")
    .update({
      response_status: response,
      decline_reason: response === "declined" ? decline_reason ?? null : null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", match_player_id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // The DB trigger (handle_match_player_response) has already run
  // synchronously as part of that update -- re-fetch to see the
  // resulting match status.
  const { data: updatedMatch } = await admin
    .from("matches")
    .select("*, court:courts(name, address), match_players(response_status, decline_reason, players(first_name, last_name, email, address, city, state, zip))")
    .eq("id", mpRow.match_id)
    .single();

  if (!updatedMatch) return NextResponse.json({ ok: true });

  // Fetch email test mode settings
  const { data: settings } = await admin.from("club_settings").select("email_test_mode_send_to_first_only").single();
  const sendToFirstOnly = settings?.email_test_mode_send_to_first_only === true;

  if (updatedMatch.status === "confirmed") {
    const playerNames = updatedMatch.match_players.map((mp: any) => mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : 'Unknown');
    const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
    const timeDisplay = resolveTimeDisplay(updatedMatch, defaultTimeDisplay);
    const ics = buildMatchIcs({
      matchId: mpRow.match_id,
      matchDate: updatedMatch.match_date,
      timeDisplay,
      courtName: updatedMatch.court?.name ?? "Court TBD",
      playerNames,
    });
    const icsBase64 = Buffer.from(ics).toString("base64");

    let firstPlayerSent = false;
    for (const mp of updatedMatch.match_players) {
      if (!mp.players) continue;
      
      // If send_to_first_only is enabled, only send to the first player
      if (sendToFirstOnly && firstPlayerSent) continue;
      
      const teammates = playerNames.filter((n: string) => n !== `${mp.players.first_name} ${mp.players.last_name}`);
      const playerAddress = [mp.players.address, mp.players.city, mp.players.state, mp.players.zip]
        .filter(Boolean)
        .join(", ") || null;
      const { subject, html } = matchConfirmedEmail({
        matchNumber: updatedMatch.match_number,
        firstName: mp.players.first_name,
        matchDate: updatedMatch.match_date,
        timeSlot: timeDisplay,
        courtName: updatedMatch.court?.name ?? "Court TBD",
        courtAddress: updatedMatch.court?.address ?? null,
        playerAddress,
        teammates,
      });
      await sendEmail({
        supabaseAdmin: admin,
        to: mp.players.email,
        subject,
        html,
        attachments: [{ filename: "match.ics", content: icsBase64, content_type: "text/calendar; charset=utf-8; method=PUBLISH" }],
      });
      
      firstPlayerSent = true;
    }
  } else if (updatedMatch.status === "cancelled" && response === "declined") {
    const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
    const timeDisplay = resolveTimeDisplay(updatedMatch, defaultTimeDisplay);
    
    let firstPlayerSent = false;
    for (const mp of updatedMatch.match_players) {
      if (!mp.players) continue;
      
      // If send_to_first_only is enabled, only send to the first player
      if (sendToFirstOnly && firstPlayerSent) continue;
      
      const { subject, html } = matchCancelledEmail({
        matchNumber: updatedMatch.match_number,
        firstName: mp.players.first_name,
        matchDate: updatedMatch.match_date,
        timeSlot: timeDisplay,
        reason: "a player declined",
        declineReason: decline_reason || null,
      });
      await sendEmail({ supabaseAdmin: admin, to: mp.players.email, subject, html });
      
      firstPlayerSent = true;
    }
  }

  return NextResponse.json({ ok: true, matchStatus: updatedMatch.status });
}
