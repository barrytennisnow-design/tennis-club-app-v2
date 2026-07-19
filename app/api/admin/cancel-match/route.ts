import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchCancelledEmail } from "@/lib/email";
import { getEmailTestModeSettings, applyFirstOnlyFilter } from "@/lib/emailTestMode";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";
import { hasPermission } from "@/lib/permissions";
import { notifyPlayer } from "@/lib/notifications";

export async function POST(request: Request) {
  const { match_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role, permissions").eq("auth_user_id", userData.user.id).single();
  if (!hasPermission(me, "matrix_cancel_match")) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select("*, court:courts(name), proposer:players!proposed_by(first_name, last_name), match_players(player_id, response_status, players(first_name, last_name, email, phone), created_at)")
    .eq("id", match_id)
    .single();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status === "cancelled") {
    return NextResponse.json({ error: "Match is already cancelled" }, { status: 400 });
  }

  const wasDraft = match.status === "draft"; // players were never told about drafts -- no email needed

  const cancelledAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("matches")
    .update({ status: "cancelled", cancelled_at: cancelledAt })
    .eq("id", match_id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (!wasDraft) {
    const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
    const timeDisplay = resolveTimeDisplay(match, defaultTimeDisplay);
    const testMode = await getEmailTestModeSettings(admin);
    const roster = match.match_players.map((mp: any) => ({
      name: mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : "Unknown Player",
      status: mp.response_status,
      phone: mp.players?.phone ?? null,
    }));
    const sortedMatchPlayers = [...match.match_players].sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const emailRecipients = applyFirstOnlyFilter(sortedMatchPlayers, testMode);
    for (const mp of emailRecipients) {
      if (!mp.players) continue;
      const { subject, html } = matchCancelledEmail({
        matchNumber: match.match_number,
        firstName: mp.players.first_name,
        matchDate: match.match_date,
        timeSlot: timeDisplay,
        courtName: match.court?.name ?? "Court TBD",
        roster,
        cancelledAt,
        reason: "cancelled by the manager",
        proposedByName: match.proposer ? `${match.proposer.first_name} ${match.proposer.last_name}` : "Manager",
      });
      await sendEmail({ supabaseAdmin: admin, to: mp.players.email, subject, html });
      await notifyPlayer({
        admin,
        playerId: mp.player_id,
        type: "match_cancelled",
        title: subject,
        body: "Cancelled by the manager.",
        matchId: match_id,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
