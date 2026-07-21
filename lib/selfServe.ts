// Shared eligibility logic for self-serve match building. Kept in
// one place so the "eligible dates" list, the "open players" list,
// and the actual propose action can never disagree with each other
// about who's allowed to do what.
//
// Also owns the overflow invite pool (see
// supabase/migration_self_serve_overflow.sql): a self-serve match
// now says how many players it NEEDS (target_size, 2 or 4) and can
// invite more candidates than that. Wave 1 (players marked available
// that day) is invited immediately; wave 2 (everyone else on the
// active roster, manager/captain-invited only) is only actually sent
// once wave 1 has had 8 hours to respond -- or has fully responded
// already, whichever comes first -- and the match is still short.
// First to accept, first to play; the rest get withdrawn once the
// match is full.

import { sendEmail, matchProposedEmail, matchConfirmedEmail, matchCancelledEmail, matchSpotFilledEmail } from "@/lib/email";
import { getEmailTestModeSettings, applyFirstOnlyFilter } from "@/lib/emailTestMode";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";
import { checkSameDayConflict } from "@/lib/conflict";
import { proposerDisplayName } from "@/lib/formatName";
import { notifyPlayer } from "@/lib/notifications";
import { buildMatchIcs } from "@/lib/ics";

export const SELF_SERVE_GROUP_SIZES = [2, 4] as const;
export type SelfServeGroupSize = (typeof SELF_SERVE_GROUP_SIZES)[number];

// How long wave 1 (available players) gets before wave 2 (everyone
// else) is brought in, if the match is still short.
export const WAVE2_DELAY_HOURS = 8;

// Only managers and captains may invite players who haven't marked
// themselves available that day -- everyone else building their own
// match can only pick from players who've actually said they're
// free.
export function isManagerOrCaptain(role: string | null | undefined): boolean {
  return role === "manager" || role === "captain";
}

export async function getSelfServeWindowDays(supabaseAdmin: any): Promise<number> {
  const { data } = await supabaseAdmin.from("club_settings").select("self_serve_window_days").single();
  return data?.self_serve_window_days ?? 3;
}

export function isWithinSelfServeWindow(dateStr: string, windowDays: number): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= windowDays;
}

// Players already tied up in a proposed/confirmed match on a given
// date. Draft matches do NOT count here -- a draft is just the
// manager's unproposed sketch on the matrix, nothing has actually
// been sent to anyone, so those players should still be pickable
// for a self-serve match until something is actually proposed.
export async function getAssignedPlayerIds(supabaseAdmin: any, date: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("match_players")
    .select("player_id, matches!inner(match_date, status)")
    .eq("matches.match_date", date)
    .in("matches.status", ["proposed", "confirmed"]);
  return new Set((data ?? []).map((r: any) => r.player_id));
}

// ------------------------------------------------------------
// Invite pool helpers
// ------------------------------------------------------------

// Sends (or promotes) a wave of invites: creates the live
// match_players rows, marks the corresponding pool rows 'sent', and
// emails/notifies each new invitee -- exactly like a fresh proposal,
// because from their point of view it is one. Shared by the initial
// propose (wave 1), an early wave-2 promotion triggered by wave 1
// fully responding, and the 8-hour cron.
export async function sendWaveInvites(admin: any, matchId: string, playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;

  const { data: match } = await admin
    .from("matches")
    .select("id, match_number, match_date, time_display, time_slot, proposed_at, court:courts(name), proposer:players!proposed_by(first_name, last_name)")
    .eq("id", matchId)
    .single();
  if (!match) return;

  const now = new Date().toISOString();
  await admin.from("match_players").insert(
    playerIds.map((pid: string) => ({ match_id: matchId, player_id: pid, response_status: "proposed" }))
  );
  await admin
    .from("match_invite_pool")
    .update({ status: "sent", invited_at: now })
    .eq("match_id", matchId)
    .in("player_id", playerIds);

  const { data: playerRows } = await admin
    .from("players")
    .select("id, first_name, last_name, email, access_token")
    .in("id", playerIds);
  const { data: allMps } = await admin
    .from("match_players")
    .select("player_id, response_status, players(first_name, last_name, phone)")
    .eq("match_id", matchId);
  const roster = (allMps ?? []).map((mp: any) => ({
    name: mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : "Unknown",
    status: mp.response_status,
    phone: mp.players?.phone ?? null,
  }));

  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay(match, defaultTimeDisplay);
  const testMode = await getEmailTestModeSettings(admin);
  const emailRecipientIds = applyFirstOnlyFilter(playerIds, testMode);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const proposedByName = proposerDisplayName(match.proposer) ?? "a club member";

  for (const pid of emailRecipientIds) {
    const player = (playerRows ?? []).find((p: any) => p.id === pid);
    if (!player) continue;
    const conflictNote = await checkSameDayConflict(admin, pid, match.match_date, matchId);
    const acceptUrl = player.access_token
      ? `${siteUrl}/access/${player.access_token}?next=${encodeURIComponent(`/matches#match-${matchId}`)}`
      : `${siteUrl}/matches`;
    const { subject, html } = matchProposedEmail({
      matchNumber: match.match_number,
      firstName: player.first_name,
      matchDate: match.match_date,
      timeSlot: timeDisplay,
      courtName: match.court?.name ?? "Court TBD",
      roster,
      proposedAt: match.proposed_at,
      acceptUrl,
      conflictNote,
      proposedByName,
    });
    await sendEmail({ supabaseAdmin: admin, to: player.email, subject, html });
    await notifyPlayer({
      admin,
      playerId: pid,
      type: "match_proposed",
      title: subject,
      body: "Tap to view the match and respond.",
      matchId,
    });
  }
}

// Once enough players have accepted to fill an overflow match,
// anyone else still waiting on a response is out of the running --
// pull their live invite (delete, don't decline, so the classic
// decline-cancels trigger path is never touched and the confirmed
// roster only shows the actual winners) and let them know politely.
// Also closes out any wave-2 candidates who were never even sent an
// invite.
export async function withdrawRemainingInvites(admin: any, matchId: string): Promise<void> {
  const { data: pending } = await admin
    .from("match_players")
    .select("id, player_id, players(first_name, email)")
    .eq("match_id", matchId)
    .eq("response_status", "proposed");

  const pendingIds = (pending ?? []).map((p: any) => p.player_id);

  if (pendingIds.length > 0) {
    await admin.from("match_players").delete().eq("match_id", matchId).eq("response_status", "proposed");
    await admin.from("match_invite_pool").update({ status: "withdrawn" }).eq("match_id", matchId).in("player_id", pendingIds);
  }
  // Wave-2 candidates who were never sent an invite at all.
  await admin.from("match_invite_pool").update({ status: "withdrawn" }).eq("match_id", matchId).eq("status", "pending");

  if (pendingIds.length === 0) return;
  const { data: match } = await admin.from("matches").select("match_number, match_date").eq("id", matchId).single();
  for (const p of pending ?? []) {
    if (!p.players?.email) continue;
    const { subject, html } = matchSpotFilledEmail({
      matchNumber: match?.match_number,
      firstName: p.players.first_name,
      matchDate: match?.match_date,
    });
    await sendEmail({ supabaseAdmin: admin, to: p.players.email, subject, html });
    await notifyPlayer({
      admin,
      playerId: p.player_id,
      type: "match_invite_withdrawn",
      title: subject,
      body: "This match filled up with other players before you responded.",
      matchId,
    });
  }
}

// A match filled to target_size -- withdraw everyone else still
// pending and email/notify them, then finalize.
export async function finalizeOverflowMatch(admin: any, matchId: string): Promise<void> {
  await withdrawRemainingInvites(admin, matchId);
}

// Sends wave 2 (the not-marked-available candidates) right now, if
// there's anyone left in it. Used by both the 8-hour cron and the
// early-promotion path (wave 1 fully responded and the match is
// still short -- no point waiting out the rest of the window).
export async function promoteWave2(admin: any, matchId: string): Promise<{ promoted: number }> {
  const { data: pendingPool } = await admin
    .from("match_invite_pool")
    .select("player_id")
    .eq("match_id", matchId)
    .eq("wave", 2)
    .eq("status", "pending");
  const ids = (pendingPool ?? []).map((r: any) => r.player_id);
  if (ids.length === 0) return { promoted: 0 };

  await admin.from("matches").update({ wave2_promoted_at: new Date().toISOString() }).eq("id", matchId);
  await sendWaveInvites(admin, matchId, ids);
  return { promoted: ids.length };
}

// Nobody left to invite and still short of target_size -- rather
// than leave the match stuck in limbo until its full auto-cancel
// deadline, close it out now and tell whoever's still on the roster
// (the proposer, plus anyone else who accepted or declined).
export async function cancelExhaustedMatch(admin: any, matchId: string, reason: string): Promise<void> {
  const { data: match } = await admin.from("matches").select("status").eq("id", matchId).single();
  if (!match || match.status !== "proposed") return;

  const now = new Date().toISOString();
  await admin.from("matches").update({ status: "cancelled", cancelled_at: now }).eq("id", matchId);
  await admin.from("match_invite_pool").update({ status: "withdrawn" }).eq("match_id", matchId).eq("status", "pending");

  const { data: updatedMatch } = await admin
    .from("matches")
    .select("*, court:courts(name), proposer:players!proposed_by(first_name, last_name), match_players(id, player_id, response_status, decline_reason, created_at, players(first_name, last_name, email, phone))")
    .eq("id", matchId)
    .single();
  if (!updatedMatch) return;

  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay(updatedMatch, defaultTimeDisplay);
  const testMode = await getEmailTestModeSettings(admin);
  const roster = updatedMatch.match_players.map((mp: any) => ({
    name: mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : "Unknown Player",
    status: mp.response_status,
    phone: mp.players?.phone ?? null,
  }));
  const sortedMatchPlayers = [...updatedMatch.match_players].sort(
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const emailRecipients = applyFirstOnlyFilter(sortedMatchPlayers, testMode);
  const proposedByName = proposerDisplayName(updatedMatch.proposer) ?? "Manager";

  for (const mp of emailRecipients) {
    if (!mp.players) continue;
    const { subject, html } = matchCancelledEmail({
      matchNumber: updatedMatch.match_number,
      firstName: mp.players.first_name,
      matchDate: updatedMatch.match_date,
      timeSlot: timeDisplay,
      courtName: updatedMatch.court?.name ?? "Court TBD",
      roster,
      cancelledAt: now,
      reason,
      proposedByName,
    });
    await sendEmail({ supabaseAdmin: admin, to: mp.players.email, subject, html });
    await notifyPlayer({
      admin,
      playerId: mp.player_id,
      type: "match_cancelled",
      title: subject,
      body: reason,
      matchId,
    });
  }
}

// Mirrors the classic "match just confirmed" email/ics flow (see
// respond-match/route.ts), but reloaded AFTER withdrawRemainingInvites
// has already pruned the still-pending invitees -- so the roster
// here only ever shows the players who actually won a spot.
export async function sendOverflowConfirmedEmails(admin: any, matchId: string): Promise<void> {
  const { data: updatedMatch } = await admin
    .from("matches")
    .select("*, court:courts(name, address), proposer:players!proposed_by(first_name, last_name), match_players(id, player_id, response_status, created_at, players(first_name, last_name, email, phone, address, city, state, zip))")
    .eq("id", matchId)
    .single();
  if (!updatedMatch) return;

  const playerNames = updatedMatch.match_players.map((mp: any) => (mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : "Unknown"));
  const roster = updatedMatch.match_players.map((mp: any) => ({
    name: mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : "Unknown Player",
    status: mp.response_status,
    phone: mp.players?.phone ?? null,
  }));
  const confirmedAt = updatedMatch.confirmed_at ?? new Date().toISOString();
  const proposedByName = proposerDisplayName(updatedMatch.proposer) ?? "Manager";
  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay(updatedMatch, defaultTimeDisplay);
  const ics = buildMatchIcs({
    matchId,
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
    const playerAddress = [mp.players.address, mp.players.city, mp.players.state, mp.players.zip].filter(Boolean).join(", ") || null;
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
      matchId,
    });
  }
}

// Called after a decline on an overflow (target_size) match that
// didn't cancel anything by itself. Figures out what happens next:
//   - still someone out there who hasn't answered yet -> wait, do
//     nothing (their window, or the 8-hour cron, will resolve it)
//   - everyone invited so far has answered and we're still short ->
//     promote wave 2 right now rather than waiting out the clock
//   - nothing left to invite at all and still short -> give up and
//     cancel, rather than sit in limbo until the full auto-cancel
//     deadline
export async function handlePostDecline(admin: any, matchId: string, targetSize: number): Promise<void> {
  const { data: mps } = await admin.from("match_players").select("response_status").eq("match_id", matchId);
  const acceptedCount = (mps ?? []).filter((m: any) => m.response_status === "accepted").length;
  if (acceptedCount >= targetSize) return; // trigger already confirmed it; nothing to do here

  const stillWaiting = (mps ?? []).some((m: any) => m.response_status === "proposed");
  if (stillWaiting) return; // someone else invited so far hasn't answered yet -- give them their window

  const { promoted } = await promoteWave2(admin, matchId);
  if (promoted > 0) return;

  await cancelExhaustedMatch(admin, matchId, "not enough players accepted before the invite pool ran out");
}
