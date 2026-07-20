// Creates a self-serve OVERFLOW match: the proposer says how many
// players it needs (target_size: 2 or 4) and picks a pool of
// candidates to invite -- which can be bigger than that. Everyone
// marked available that day (wave 1) is invited immediately, exactly
// like a classic proposal. Anyone else on the active roster who
// wasn't marked available (wave 2, manager/captain-only) is only
// actually invited later -- once wave 1 has had 8 hours to respond,
// or has fully responded already, whichever comes first -- and only
// if the match is still short. See lib/selfServe.ts for the wave
// machinery and supabase/migration_self_serve_overflow.sql for the
// schema and trigger changes this depends on.
//
// Conflicts (someone else grabbing the same date/player between
// page-load and submit) are handled first-to-propose: whichever
// request's re-validation runs first and passes wins the insert;
// anyone after that gets a 409 telling them to pick again with the
// now-current list.
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import {
  getSelfServeWindowDays,
  isWithinSelfServeWindow,
  getAssignedPlayerIds,
  isManagerOrCaptain,
  sendWaveInvites,
  SELF_SERVE_GROUP_SIZES,
} from "@/lib/selfServe";
import { getNextMatchNumber } from "@/lib/matching";

export async function POST(request: Request) {
  const { date, court_id, time_display, target_size, available_player_ids, other_player_ids } = await request.json();

  const targetSize = Number(target_size);
  if (!date || !court_id || !SELF_SERVE_GROUP_SIZES.includes(targetSize as any)) {
    return NextResponse.json({ error: "A date, court, and a target of 2 or 4 total players are required" }, { status: 400 });
  }
  const availableIds: string[] = Array.isArray(available_player_ids) ? available_player_ids : [];
  const otherIds: string[] = Array.isArray(other_player_ids) ? other_player_ids : [];
  const allInviteIds = [...availableIds, ...otherIds];
  if (new Set(allInviteIds).size !== allInviteIds.length) {
    return NextResponse.json({ error: "Duplicate players selected" }, { status: 400 });
  }
  // Need at least enough candidates in the pool to have a shot at
  // filling the match -- inviting MORE than needed is the whole
  // point (first come, first play), but inviting fewer than needed
  // is just a match that can never fill.
  if (allInviteIds.length < targetSize - 1) {
    return NextResponse.json({ error: `You need at least ${targetSize - 1} invited candidates for a ${targetSize}-player match` }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("players").select("*").eq("auth_user_id", userData.user.id).single();
  if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (!me.self_serve_opt_in) {
    return NextResponse.json({ error: "Self-serve isn't turned on for your account" }, { status: 403 });
  }
  if (allInviteIds.includes(me.id)) {
    return NextResponse.json({ error: "You're automatically included as the proposer -- don't select yourself" }, { status: 400 });
  }
  if (otherIds.length > 0 && !isManagerOrCaptain(me.role)) {
    return NextResponse.json({ error: "Only managers and captains can invite players who haven't marked that day available" }, { status: 403 });
  }

  // Re-check everything server-side rather than trusting the list the
  // client fetched a moment ago -- someone else may have grabbed one
  // of these players (or this date) in the meantime.
  const windowDays = await getSelfServeWindowDays(admin);
  if (!isWithinSelfServeWindow(date, windowDays)) {
    return NextResponse.json({ error: "This date isn't open for self-serve yet" }, { status: 403 });
  }

  const allPlayerIds = [me.id, ...allInviteIds];
  const assigned = await getAssignedPlayerIds(admin, date);
  const alreadyTaken = allPlayerIds.filter((id) => assigned.has(id));
  if (alreadyTaken.length > 0) {
    return NextResponse.json({
      error: alreadyTaken.includes(me.id)
        ? "You're already in a match that day"
        : "One of the players you picked was just claimed for this date by someone else -- please pick again",
    }, { status: 409 });
  }

  // Re-verify the proposer's own availability -- they were only ever
  // offered this date because of it (see eligible-dates), but a stale
  // page load could still try to submit an old date.
  const { data: myAvail } = await admin
    .from("availability")
    .select("id")
    .eq("player_id", me.id)
    .eq("date", date)
    .eq("time_slot", "morning")
    .maybeSingle();
  if (!myAvail) {
    return NextResponse.json({ error: "You're not marked available that day" }, { status: 403 });
  }

  const { data: playerRows } = await admin
    .from("players")
    .select("id, status")
    .in("id", allPlayerIds);
  if ((playerRows ?? []).length !== allPlayerIds.length) {
    return NextResponse.json({ error: "One of the players you picked couldn't be found" }, { status: 404 });
  }
  const notActive = (playerRows ?? []).filter((p: any) => p.status !== "active");
  if (notActive.length > 0) {
    return NextResponse.json({ error: "One of the players you picked is no longer active" }, { status: 409 });
  }

  // available_player_ids is only trusted if those players actually
  // marked the day available -- re-derive rather than trust the
  // client's row placement, so a stale/tampered request can't sneak
  // a not-available player into wave 1.
  const { data: availRows } = await admin.from("availability").select("player_id").eq("date", date).eq("time_slot", "morning");
  const trulyAvailable = new Set((availRows ?? []).map((r: any) => r.player_id));
  const wave1Ids = allInviteIds.filter((id) => trulyAvailable.has(id));
  const wave2Ids = allInviteIds.filter((id) => !trulyAvailable.has(id));
  if (wave2Ids.length > 0 && !isManagerOrCaptain(me.role)) {
    return NextResponse.json({ error: "One of the players you picked hasn't marked that day available -- only managers and captains can invite them" }, { status: 403 });
  }

  const { data: court } = await admin.from("courts").select("id, name").eq("id", court_id).eq("is_active", true).maybeSingle();
  if (!court) return NextResponse.json({ error: "Pick a valid court" }, { status: 400 });

  const { data: settings } = await admin.from("club_settings").select("default_timeout_hours").single();
  const autoCancelHours = settings?.default_timeout_hours ?? 24;

  const matchNumber = await getNextMatchNumber(admin);
  const now = new Date().toISOString();

  const { data: newMatch, error: insertError } = await admin
    .from("matches")
    .insert({
      match_number: matchNumber,
      match_date: date,
      time_slot: "morning",
      time_display: time_display ?? null,
      court_id: court.id,
      status: "proposed",
      proposed_at: now,
      auto_cancel_hours: autoCancelHours,
      nudge_count: 0,
      created_by: me.id,
      proposed_by: me.id,
      target_size: targetSize,
      wave1_sent_at: now,
    })
    .select()
    .single();
  if (insertError || !newMatch) {
    return NextResponse.json({ error: insertError?.message ?? "Couldn't create the match" }, { status: 500 });
  }

  // The proposer built this match on purpose -- auto-accept them so
  // they're not stuck waiting on their own response.
  await admin.from("match_players").insert([
    { match_id: newMatch.id, player_id: me.id, response_status: "accepted", responded_at: now },
  ]);

  // Every candidate goes into the pool. Wave 1 gets invited (sent)
  // right away below; wave 2 stays 'pending' until it's promoted.
  await admin.from("match_invite_pool").insert([
    ...wave1Ids.map((pid) => ({ match_id: newMatch.id, player_id: pid, wave: 1, status: "pending" as const })),
    ...wave2Ids.map((pid) => ({ match_id: newMatch.id, player_id: pid, wave: 2, status: "pending" as const })),
  ]);

  await sendWaveInvites(admin, newMatch.id, wave1Ids);

  return NextResponse.json({ ok: true, matchNumber, invited: wave1Ids.length, waitingOnWave2: wave2Ids.length });
}
