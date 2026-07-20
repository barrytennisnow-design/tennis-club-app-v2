import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchConfirmedEmail, matchCancelledEmail } from "@/lib/email";
import { getEmailTestModeSettings, applyFirstOnlyFilter } from "@/lib/emailTestMode";
import { buildMatchIcs } from "@/lib/ics";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";
import { notifyPlayer } from "@/lib/notifications";
import { finalizeOverflowMatch, handlePostDecline, sendOverflowConfirmedEmails } from "@/lib/selfServe";

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

  // Self-serve overflow matches (target_size set -- see
  // lib/selfServe.ts and migration_self_serve_overflow.sql) follow a
  // different lifecycle than classic fixed-roster matches: a decline
  // doesn't cancel anything by itself (there may be more candidates
  // waiting in the invite pool), and confirming means withdrawing
  // whoever else is still pending rather than emailing a roster that
  // includes them. Handle those here and return early; everything
  // below this block is the classic path only.
  const { data: matchRow } = await admin.from("matches").select("target_size, status").eq("id", mpRow.match_id).single();
  if (matchRow?.target_size) {
    if (matchRow.status === "confirmed") {
      await finalizeOverflowMatch(admin, mpRow.match_id);
      await sendOverflowConfirmedEmails(admin, mpRow.match_id);
    } else if (response === "declined") {
      await handlePostDecline(admin, mpRow.match_id, matchRow.target_size);
    }
    const { data: finalMatch } = await admin.from("matches").select("status").eq("id", mpRow.match_id).single();
    return NextResponse.json({ ok: true, matchStatus: finalMatch?.status ?? matchRow.status });
  }

  // The DB trigger (handle_match_player_response) has already run
  // synchronously as part of that update -- re-fetch to see the
  // resulting match status.
  const { data: updatedMatch, error: updatedMatchError } = await admin
    .from("matches")
    .select("*, court:courts(name, address), proposer:players!proposed_by(first_name, last_name), match_players(id, player_id, response_status, decline_reason, created_at, players(first_name, last_name, email, phone, address, city, state, zip))")
    .eq("id", mpRow.match_id)
    .single();

  if (updatedMatchError) {
    console.error("respond-match: failed to reload match after response", updatedMatchError);
  }

  if (!updatedMatch) return NextResponse.json({ ok: true });

  if (updatedMatch.status === "confirmed") {
    const playerNames = updatedMatch.match_players.map((mp: any) => mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : 'Unknown');
    const roster = updatedMatch.match_players.map((mp: any) => ({
      name: mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : "Unknown Player",
      status: mp.response_status,
      phone: mp.players?.phone ?? null,
    }));
    const confirmedAt = updatedMatch.confirmed_at ?? new Date().toISOString();
    const proposedByName = updatedMatch.proposer
      ? `${updatedMatch.proposer.first_name} ${updatedMatch.proposer.last_name}`
      : "Manager";
    const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
    const timeDisplay = resolveTimeDisplay(updatedMatch, defaultTimeDisplay);
    const ics = buildMatchIcs({
      matchId: mpRow.match_id,
      matchNumber: updatedMatch.match_number,
      matchDate: updatedMatch.match_date,
      timeDisplay,
      courtName: updatedMatch.court?.name ?? "Court TBD",
      playerNames,
      roster,
      courtAddress: updatedMatch.court?.address,
      confirmedAt,
      proposedByName,
    });
    const icsBase64 = Buffer.from(ics).toString("base64");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

    const testMode = await getEmailTestModeSettings(admin);
    const sortedMatchPlayers = [...updatedMatch.match_players].sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const emailRecipients = applyFirstOnlyFilter(sortedMatchPlayers, testMode);

    for (const mp of emailRecipients) {
      if (!mp.players) continue;
      const playerAddress = [mp.players.address, mp.players.city, mp.players.state, mp.players.zip]
        .filter(Boolean)
        .join(", ") || null;
      // Same match_player_id credential the "Download Calendar Invite"
      // button on the My Matches page already uses -- works without a
      // login session, same as that button, so it's a real one-tap
      // download for anyone whose email client doesn't auto-detect
      // the .ics attachment (Gmail's own "Add to Calendar" smart card
      // is separate, client-side behavior we don't control).
      const icsDownloadUrl = mp.id ? `${siteUrl}/api/ics/${mp.id}` : null;
      const { subject, html } = matchConfirmedEmail({
        matchNumber: updatedMatch.match_number,
        firstName: mp.players.first_name,
        matchDate: updatedMatch.match_date,
        timeSlot: timeDisplay,
        courtName: updatedMatch.court?.name ?? "Court TBD",
        courtAddress: updatedMatch.court?.address ?? null,
        playerAddress,
        roster,
        confirmedAt,
        proposedByName,
        icsDownloadUrl,
      });
      await sendEmail({
        supabaseAdmin: admin,
        to: mp.players.email,
        subject,
        html,
        attachments: [{ filename: "match.ics", content: icsBase64, content_type: "text/calendar; charset=utf-8; method=PUBLISH" }],
      });
      await notifyPlayer({
        admin,
        playerId: mp.player_id,
        type: "match_confirmed",
        title: subject,
        body: "Everyone accepted -- tap for details and directions.",
        matchId: mpRow.match_id,
      });
    }
  } else if (updatedMatch.status === "cancelled" && response === "declined") {
    const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
    const timeDisplay = resolveTimeDisplay(updatedMatch, defaultTimeDisplay);
    const testMode = await getEmailTestModeSettings(admin);
    const roster = updatedMatch.match_players.map((mp: any) => ({
      name: mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : "Unknown Player",
      status: mp.response_status,
      phone: mp.players?.phone ?? null,
    }));
    const cancelledAt = updatedMatch.cancelled_at ?? new Date().toISOString();
    const sortedMatchPlayers = [...updatedMatch.match_players].sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const emailRecipients = applyFirstOnlyFilter(sortedMatchPlayers, testMode);
    for (const mp of emailRecipients) {
      if (!mp.players) continue;
      const { subject, html } = matchCancelledEmail({
        matchNumber: updatedMatch.match_number,
        firstName: mp.players.first_name,
        matchDate: updatedMatch.match_date,
        timeSlot: timeDisplay,
        courtName: updatedMatch.court?.name ?? "Court TBD",
        roster,
        cancelledAt,
        reason: "a player declined",
        declineReason: decline_reason || null,
        proposedByName: updatedMatch.proposer
          ? `${updatedMatch.proposer.first_name} ${updatedMatch.proposer.last_name}`
          : "Manager",
      });
      await sendEmail({ supabaseAdmin: admin, to: mp.players.email, subject, html });
      await notifyPlayer({
        admin,
        playerId: mp.player_id,
        type: "match_cancelled",
        title: subject,
        body: "A player declined -- the match was cancelled.",
        matchId: mpRow.match_id,
      });
    }
  }

  return NextResponse.json({ ok: true, matchStatus: updatedMatch.status });
}
