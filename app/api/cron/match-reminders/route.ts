// Scheduled job — replaces the old sheet's "hour for auto cancel" /
// "Nudge Count" columns with actual behavior. Configured to run via
// Vercel Cron (see /vercel.json), every 30 minutes.
//
// For every match still 'proposed':
//   - If we're past the halfway point of its auto_cancel_hours window
//     and no nudge has been sent yet, email everyone who hasn't
//     responded and bump nudge_count.
//   - If we're past the full auto_cancel_hours window, cancel the
//     match and email all 4 players.
//
// Secured with CRON_SECRET so only Vercel's scheduler (or you,
// manually, with the right header) can trigger it.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, matchNudgeEmail, matchCancelledEmail } from "@/lib/email";
import { getEmailTestModeSettings, applyFirstOnlyFilter } from "@/lib/emailTestMode";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    // Fail CLOSED, not open: if the secret was never configured in
    // Vercel's env vars, this endpoint should refuse everyone, not
    // silently become public. Anyone who found this URL could
    // otherwise trigger mass match-cancellation emails on demand.
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();
  const now = new Date();

  // Get nudge frequency from club_settings
  const { data: settings } = await supabaseAdmin.from("club_settings").select("nudge_frequency_hours").single();
  const nudgeFrequency = settings?.nudge_frequency_hours ?? 12;

  const { data: proposedMatches } = await supabaseAdmin
    .from("matches")
    .select("*, court:courts(name), proposer:players!proposed_by(first_name, last_name), match_players(id, response_status, created_at, players(first_name, email))")
    .eq("status", "proposed");

  const defaultTimeDisplay = await getDefaultTimeDisplay(supabaseAdmin);
  const testMode = await getEmailTestModeSettings(supabaseAdmin);

  let nudged = 0;
  let cancelled = 0;

  for (const match of proposedMatches ?? []) {
    const timeDisplay = resolveTimeDisplay(match, defaultTimeDisplay);
    const proposedAt = new Date(match.proposed_at);
    const hoursElapsed = (now.getTime() - proposedAt.getTime()) / (1000 * 60 * 60);
    const deadline = match.auto_cancel_hours ?? 24;

    if (hoursElapsed >= deadline) {
      // Auto-cancel: deadline blown, not everyone accepted in time.
      await supabaseAdmin
        .from("matches")
        .update({ status: "cancelled", cancelled_at: now.toISOString() })
        .eq("id", match.id);

      const sortedMatchPlayers = [...match.match_players].sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const cancelRecipients = applyFirstOnlyFilter(sortedMatchPlayers, testMode);
      for (const mp of cancelRecipients) {
        if (!mp.players) continue;
        const { subject, html } = matchCancelledEmail({
          matchNumber: match.match_number,
          firstName: mp.players.first_name,
          matchDate: match.match_date,
          timeSlot: timeDisplay,
          reason: "not all players responded before the deadline",
          proposedByName: match.proposer ? `${match.proposer.first_name} ${match.proposer.last_name}` : "Manager",
        });
        await sendEmail({ supabaseAdmin, to: mp.players.email, subject, html });
      }
      cancelled++;
      continue;
    }

    // Send nudges at regular intervals based on nudge_frequency_hours
    // Calculate how many nudges should have been sent by now
    const expectedNudges = Math.floor(hoursElapsed / nudgeFrequency);
    const currentNudges = match.nudge_count ?? 0;

    if (expectedNudges > currentNudges) {
      // Send nudge to anyone who hasn't responded yet
      const pending = match.match_players.filter((mp: any) => mp.response_status === "proposed");
      if (pending.length > 0) {
        const sortedPending = [...pending].sort(
          (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const nudgeRecipients = applyFirstOnlyFilter(sortedPending, testMode);
        for (const mp of nudgeRecipients) {
          if (!mp.players) continue;
          const { subject, html } = matchNudgeEmail({
            matchNumber: match.match_number,
            firstName: mp.players.first_name,
            matchDate: match.match_date,
            timeSlot: timeDisplay,
            acceptUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/matches`,
            proposedByName: match.proposer ? `${match.proposer.first_name} ${match.proposer.last_name}` : "Manager",
          });
          await sendEmail({ supabaseAdmin, to: mp.players.email, subject, html });
        }
        await supabaseAdmin
          .from("matches")
          .update({ nudge_count: currentNudges + 1 })
          .eq("id", match.id);
        nudged++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checked: proposedMatches?.length ?? 0,
    nudged,
    cancelled,
  });
}
