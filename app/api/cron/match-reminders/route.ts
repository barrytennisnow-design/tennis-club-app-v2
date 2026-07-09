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

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();
  const now = new Date();

  const { data: proposedMatches } = await supabaseAdmin
    .from("matches")
    .select("*, court:courts(name), match_players(id, response_status, players(first_name, email))")
    .eq("status", "proposed");

  let nudged = 0;
  let cancelled = 0;

  for (const match of proposedMatches ?? []) {
    const proposedAt = new Date(match.proposed_at);
    const hoursElapsed = (now.getTime() - proposedAt.getTime()) / (1000 * 60 * 60);
    const deadline = match.auto_cancel_hours ?? 24;

    if (hoursElapsed >= deadline) {
      // Auto-cancel: deadline blown, not everyone accepted in time.
      await supabaseAdmin
        .from("matches")
        .update({ status: "cancelled", cancelled_at: now.toISOString() })
        .eq("id", match.id);

      for (const mp of match.match_players) {
        const { subject, html } = matchCancelledEmail({
          firstName: mp.players.first_name,
          matchDate: match.match_date,
          timeSlot: match.time_slot,
          reason: "not all players responded before the deadline",
        });
        await sendEmail({ supabaseAdmin, to: mp.players.email, subject, html });
      }
      cancelled++;
      continue;
    }

    if (hoursElapsed >= deadline / 2 && (match.nudge_count ?? 0) === 0) {
      // Halfway-point nudge to anyone who hasn't responded yet.
      const pending = match.match_players.filter((mp: any) => mp.response_status === "proposed");
      if (pending.length > 0) {
        for (const mp of pending) {
          const { subject, html } = matchNudgeEmail({
            firstName: mp.players.first_name,
            matchDate: match.match_date,
            timeSlot: match.time_slot,
            acceptUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/matches`,
          });
          await sendEmail({ supabaseAdmin, to: mp.players.email, subject, html });
        }
        await supabaseAdmin
          .from("matches")
          .update({ nudge_count: (match.nudge_count ?? 0) + 1 })
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
