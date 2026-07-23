import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchProposedEmail, selfServeInviteEmail, matchConfirmedEmail, matchCancelledEmail } from "@/lib/email";
import { buildMatchIcs } from "@/lib/ics";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";
import { proposerDisplayName } from "@/lib/formatName";

// Manager-only "preview" tool for the Match Matrix: builds the exact
// same propose / confirm / cancel email (and .ics, for confirm) that
// would go out for real, using this match's real data, but sends it
// ONLY to the manager's own inbox -- real players are never touched
// and no rows are written to matches/match_players. Safe to click on
// a draft, proposed, confirmed, or cancelled match; it's just a
// content preview, not a state change.
export async function POST(request: Request) {
  const { match_id, kind } = await request.json();

  if (!["proposed", "confirmed", "cancelled"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();

  // Deliberately role-gated to "manager" only (not the general
  // hasPermission() system captains can be granted into) -- this is
  // a raw content-preview tool, not a normal matrix action.
  const { data: me } = await admin.from("players").select("id, first_name, last_name, role, email").eq("auth_user_id", userData.user.id).single();
  if (!me || me.role !== "manager") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!me.email) return NextResponse.json({ error: "Your player profile has no email address on file" }, { status: 400 });

  const { data: match } = await admin
    .from("matches")
    .select(
      "*, court:courts(name, address), proposer:players!proposed_by(first_name, last_name, role), match_players(id, player_id, created_at, response_status, players(first_name, last_name, email, phone, access_token))"
    )
    .eq("id", match_id)
    .single();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay(match, defaultTimeDisplay);
  const proposedByName = proposerDisplayName(match.proposer, match.target_size) ?? proposerDisplayName(me, match.target_size) ?? "Manager";
  const roster = match.match_players
    .filter((mp: any) => mp.players)
    .map((mp: any) => ({
      name: `${mp.players.first_name} ${mp.players.last_name}`,
      status: mp.response_status,
      phone: mp.players.phone ?? null,
    }));

  let subject: string;
  let html: string;
  let attachments: { filename: string; content: string; content_type?: string }[] | undefined;

  if (kind === "proposed") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const firstPlayer = match.match_players.find((mp: any) => mp.players);
    const acceptUrl = firstPlayer?.players?.access_token
      ? `${siteUrl}/access/${firstPlayer.players.access_token}?next=${encodeURIComponent(`/matches#match-${match_id}`)}`
      : `${siteUrl}/matches`;
    if (match.target_size) {
      // Preview the ACTUAL email a Build-a-Match invitee gets, not
      // the classic one -- otherwise this preview tool would
      // misrepresent what self-serve players actually receive.
      const { data: poolRows } = await admin
        .from("match_invite_pool")
        .select("wave, players(first_name, last_name)")
        .eq("match_id", match_id);
      let availableNames = (poolRows ?? [])
        .filter((r: any) => r.wave === 1 && r.players)
        .map((r: any) => `${r.players.first_name} ${r.players.last_name}`);
      const otherNames = (poolRows ?? [])
        .filter((r: any) => r.wave === 2 && r.players)
        .map((r: any) => `${r.players.first_name} ${r.players.last_name}`);

      // A manager/captain organizer who put themselves in the match
      // always shows as "available", regardless of the availability
      // page -- matches the real send logic in lib/selfServe.ts.
      const proposerIsStaff = match.proposer?.role === "manager" || match.proposer?.role === "captain";
      const proposerInRoster = match.match_players.some((mp: any) => mp.player_id === match.proposed_by);
      if (proposerIsStaff && proposerInRoster && match.proposer) {
        const proposerFullName = `${match.proposer.first_name} ${match.proposer.last_name}`;
        if (!availableNames.includes(proposerFullName)) {
          availableNames = [proposerFullName, ...availableNames];
        }
      }
      ({ subject, html } = selfServeInviteEmail({
        matchNumber: match.match_number,
        firstName: me.first_name,
        matchDate: match.match_date,
        timeSlot: timeDisplay,
        courtName: match.court?.name ?? "Court TBD",
        targetSize: match.target_size,
        wave: 1,
        availableNames,
        otherNames,
        roster,
        acceptUrl,
        proposedByName,
      }));
    } else {
      ({ subject, html } = matchProposedEmail({
        matchNumber: match.match_number,
        firstName: me.first_name,
        matchDate: match.match_date,
        timeSlot: timeDisplay,
        courtName: match.court?.name ?? "Court TBD",
        roster,
        proposedAt: match.proposed_at ?? new Date().toISOString(),
        acceptUrl,
        proposedByName,
      }));
    }
  } else if (kind === "confirmed") {
    const confirmedAt = match.confirmed_at ?? new Date().toISOString();
    const playerNames = roster.map((r: any) => r.name);
    const ics = buildMatchIcs({
      matchId: match.id,
      matchNumber: match.match_number,
      matchDate: match.match_date,
      timeDisplay,
      courtName: match.court?.name ?? "Court TBD",
      playerNames,
      roster,
      courtAddress: match.court?.address ?? null,
      confirmedAt,
      proposedByName,
    });
    attachments = [
      { filename: "match.ics", content: Buffer.from(ics).toString("base64"), content_type: "text/calendar; charset=utf-8; method=PUBLISH" },
    ];
    // Preview only -- points at the first real participant's own
    // download-link credential just to demonstrate the button; the
    // actual confirmed email always uses each real recipient's own.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const firstMatchPlayer = match.match_players.find((mp: any) => mp.players);
    const icsDownloadUrl = firstMatchPlayer?.id ? `${siteUrl}/api/ics/${firstMatchPlayer.id}` : null;

    ({ subject, html } = matchConfirmedEmail({
      matchNumber: match.match_number,
      firstName: me.first_name,
      matchDate: match.match_date,
      timeSlot: timeDisplay,
      courtName: match.court?.name ?? "Court TBD",
      courtAddress: match.court?.address ?? null,
      playerAddress: null,
      roster,
      confirmedAt,
      proposedByName,
      icsDownloadUrl,
    }));
  } else {
    ({ subject, html } = matchCancelledEmail({
      matchNumber: match.match_number,
      firstName: me.first_name,
      matchDate: match.match_date,
      timeSlot: timeDisplay,
      courtName: match.court?.name ?? "Court TBD",
      roster,
      cancelledAt: match.cancelled_at ?? new Date().toISOString(),
      reason: "this is a manager-requested test email -- no real cancellation happened",
      proposedByName,
    }));
  }

  const result = await sendEmail({
    supabaseAdmin: admin,
    to: me.email,
    subject: `[TEST] ${subject}`,
    html,
    attachments,
  });

  if (result.status === "failed") {
    return NextResponse.json({ error: result.errorMessage ?? "Send failed" }, { status: 500 });
  }
  if (result.status === "skipped_no_api_key") {
    return NextResponse.json({ error: "No RESEND_API_KEY configured -- email was logged but not actually sent" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sentTo: me.email });
}
