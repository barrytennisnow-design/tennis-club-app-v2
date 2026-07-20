// Scheduled job for the self-serve overflow invite pool (see
// lib/selfServe.ts and supabase/migration_self_serve_overflow.sql).
//
// For every still-'proposed' match with a target_size set:
//   - If wave 1 (available players) has had WAVE2_DELAY_HOURS to
//     respond and the match is still short of target_size, promote
//     wave 2 (everyone else on the active roster who was invited but
//     not yet contacted) -- first come, first play, same as wave 1.
//   - If wave 2 has already been promoted (or there was never a
//     wave 2 to promote) and there's genuinely no one left to invite
//     while still short, close the match out rather than let it sit
//     in limbo -- the existing match-reminders cron's full
//     auto_cancel_hours deadline is a backstop, but there's no
//     reason to make players wait that long once the pool is
//     provably exhausted.
//
// Secured with CRON_SECRET, same pattern as match-reminders.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseServer";
import { promoteWave2, cancelExhaustedMatch, WAVE2_DELAY_HOURS } from "@/lib/selfServe";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    // Fail CLOSED -- see match-reminders/route.ts for the reasoning.
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();
  const now = new Date();

  const { data: overflowMatches } = await supabaseAdmin
    .from("matches")
    .select("id, target_size, wave1_sent_at, wave2_promoted_at, match_players(response_status)")
    .eq("status", "proposed")
    .not("target_size", "is", null);

  let promoted = 0;
  let cancelled = 0;

  for (const match of overflowMatches ?? []) {
    const acceptedCount = (match.match_players ?? []).filter((mp: any) => mp.response_status === "accepted").length;
    if (acceptedCount >= match.target_size) continue; // will be/has been confirmed by the trigger already

    if (match.wave2_promoted_at) {
      // Wave 2 already went out (here, or via the early-promotion
      // path in respond-match) -- if literally everyone invited so
      // far has responded and we're still short, there's no one
      // left to wait on.
      const stillWaiting = (match.match_players ?? []).some((mp: any) => mp.response_status === "proposed");
      if (!stillWaiting) {
        await cancelExhaustedMatch(supabaseAdmin, match.id, "not enough players accepted before the invite pool ran out");
        cancelled++;
      }
      continue;
    }

    if (!match.wave1_sent_at) continue; // shouldn't happen, but don't divide by a missing timestamp
    const hoursSinceWave1 = (now.getTime() - new Date(match.wave1_sent_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceWave1 < WAVE2_DELAY_HOURS) continue; // wave 1 still has time on the clock

    const { promoted: promotedCount } = await promoteWave2(supabaseAdmin, match.id);
    if (promotedCount > 0) {
      promoted++;
    } else {
      // No wave-2 candidates at all (a regular player built this
      // with only an "available" pool) and still short after 8
      // hours -- nothing left to wait on.
      await cancelExhaustedMatch(supabaseAdmin, match.id, "not enough players accepted within the self-serve window");
      cancelled++;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: overflowMatches?.length ?? 0,
    promoted,
    cancelled,
  });
}
