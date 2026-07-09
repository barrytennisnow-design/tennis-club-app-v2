import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchConfirmedEmail, matchCancelledEmail } from "@/lib/email";
import { buildMatchIcs } from "@/lib/ics";

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
    .select("*, court:courts(name), match_players(response_status, decline_reason, players(first_name, last_name, email))")
    .eq("id", mpRow.match_id)
    .single();

  if (!updatedMatch) return NextResponse.json({ ok: true });

  if (updatedMatch.status === "confirmed") {
    const playerNames = updatedMatch.match_players.map((mp: any) => `${mp.players.first_name} ${mp.players.last_name}`);
    const ics = buildMatchIcs({
      matchId: mpRow.match_id,
      matchDate: updatedMatch.match_date,
      timeSlot: updatedMatch.time_slot,
      courtName: updatedMatch.court?.name ?? "Court TBD",
      playerNames,
    });
    const icsBase64 = Buffer.from(ics).toString("base64");

    for (const mp of updatedMatch.match_players) {
      const teammates = playerNames.filter((n: string) => n !== `${mp.players.first_name} ${mp.players.last_name}`);
      const { subject, html } = matchConfirmedEmail({
        firstName: mp.players.first_name,
        matchDate: updatedMatch.match_date,
        timeSlot: updatedMatch.time_slot,
        courtName: updatedMatch.court?.name ?? "Court TBD",
        teammates,
      });
      await sendEmail({
        supabaseAdmin: admin,
        to: mp.players.email,
        subject,
        html,
        attachments: [{ filename: "match.ics", content: icsBase64 }],
      });
    }
  } else if (updatedMatch.status === "cancelled" && response === "declined") {
    for (const mp of updatedMatch.match_players) {
      const { subject, html } = matchCancelledEmail({
        firstName: mp.players.first_name,
        matchDate: updatedMatch.match_date,
        timeSlot: updatedMatch.time_slot,
        reason: "a player declined",
        declineReason: decline_reason || null,
      });
      await sendEmail({ supabaseAdmin: admin, to: mp.players.email, subject, html });
    }
  }

  return NextResponse.json({ ok: true, matchStatus: updatedMatch.status });
}
