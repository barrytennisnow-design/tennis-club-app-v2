import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchProposedEmail } from "@/lib/email";
import { buildMatchIcs } from "@/lib/ics";

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

  const { error: updateError } = await admin
    .from("matches")
    .update({ status: "proposed", proposed_at: new Date().toISOString() })
    .eq("id", match_id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  
  // Generate ICS file for the match
  const playerNames = match.match_players
    .filter((mp: any) => mp.players)
    .map((mp: any) => `${mp.players.first_name} ${mp.players.last_name}`);
  const ics = buildMatchIcs({
    matchId: match_id,
    matchDate: match.match_date,
    timeSlot: match.time_slot,
    courtName: match.court?.name ?? "Court TBD",
    playerNames,
  });
  const icsBase64 = Buffer.from(ics).toString("base64");
  
  for (const mp of match.match_players) {
    if (!mp.players) continue;
    const teammates = match.match_players
      .filter((other: any) => other.player_id !== mp.player_id && other.players)
      .map((other: any) => `${other.players.first_name} ${other.players.last_name}`);

    const { subject, html } = matchProposedEmail({
      firstName: mp.players.first_name,
      matchDate: match.match_date,
      timeSlot: match.time_slot,
      courtName: match.court?.name ?? "Court TBD",
      teammates,
      acceptUrl: `${siteUrl}/matches`,
    });

    await sendEmail({
      supabaseAdmin: admin,
      to: mp.players.email,
      subject,
      html,
      attachments: [{ filename: "match.ics", content: icsBase64 }],
    });
  }

  return NextResponse.json({ ok: true });
}
