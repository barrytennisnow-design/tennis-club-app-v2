import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchCancelledEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { match_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role").eq("auth_user_id", userData.user.id).single();
  if (me?.role !== "manager") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select("*, match_players(players(first_name, email))")
    .eq("id", match_id)
    .single();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status === "cancelled") {
    return NextResponse.json({ error: "Match is already cancelled" }, { status: 400 });
  }

  const wasDraft = match.status === "draft"; // players were never told about drafts -- no email needed

  const { error: updateError } = await admin
    .from("matches")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", match_id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (!wasDraft) {
    for (const mp of match.match_players) {
      const { subject, html } = matchCancelledEmail({
        firstName: mp.players.first_name,
        matchDate: match.match_date,
        timeSlot: match.time_slot,
        reason: "cancelled by the manager",
      });
      await sendEmail({ supabaseAdmin: admin, to: mp.players.email, subject, html });
    }
  }

  return NextResponse.json({ ok: true });
}
