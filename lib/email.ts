// Thin wrapper around Resend (https://resend.com — free tier: 3,000
// emails/month, 100/day, no cost). Every send is logged to email_log
// so managers have the same visibility the old "Outbox" tab gave them.
//
// Requires RESEND_API_KEY and EMAIL_FROM in env vars. If RESEND_API_KEY
// isn't set, sends are skipped but still logged with status
// 'skipped_no_api_key' so nothing throws in local/dev without a key.

import { Resend } from "resend";
import { formatShortDate, formatLongDateWithWeekday } from "./formatDate.ts";
import { formatMatchDetailsHtml, type RosterEntry } from "./matchDetails.ts";

let resendClient: Resend | null = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export async function sendEmail({
  supabaseAdmin,
  to,
  subject,
  html,
  attachments,
}: {
  supabaseAdmin: any;
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; content_type?: string }[]; // content = base64
}) {
  const resend = getResend();
  let status = "sent";
  let errorMessage: string | null = null;

  // Sandbox mode: reroute every email to one inbox instead of real
  // players, so you can test the whole system -- match proposals,
  // nudges, cancellations, access links -- without spamming real
  // people. Controlled from Settings (club_settings.sandbox_mode /
  // sandbox_email), manager-only -- not an env var anymore, so it
  // can be toggled without a Vercel redeploy.
  const { data: clubSettings } = await supabaseAdmin
    .from("club_settings")
    .select("sandbox_mode, sandbox_email")
    .single();
  const sandboxOn = clubSettings?.sandbox_mode === true;
  const actualRecipient = sandboxOn && clubSettings?.sandbox_email ? clubSettings.sandbox_email : to;
  const actualSubject = sandboxOn ? `[TEST → ${to}] ${subject}` : subject;

  if (!resend) {
    status = "skipped_no_api_key";
  } else {
    try {
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || "Club Tennis <onboarding@resend.dev>",
        to: actualRecipient,
        subject: actualSubject,
        html,
        ...(attachments ? { attachments: attachments as any } : {}),
      });
      if (error) {
        status = "failed";
        errorMessage = error.message;
      }
    } catch (err: any) {
      status = "failed";
      errorMessage = err?.message ?? "unknown error";
    }
  }

  await supabaseAdmin.from("email_log").insert({
    recipient: to, // always log the REAL intended recipient, even in sandbox mode
    subject,
    body: html,
    status: errorMessage ? `${status}: ${errorMessage}` : sandboxOn ? `${status} (sandboxed → ${actualRecipient})` : status,
  });

  return { status, errorMessage };
}

export function accessLinkEmail({
  firstName,
  accessUrl,
}: {
  firstName: string;
  accessUrl: string;
}) {
  return {
    subject: `Your Club Tennis link (bookmark this!)`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Here's your personal Club Tennis link. Unlike a normal login,
      this one link works every time, forever -- no need to check your
      email again.</p>
      <p><strong>What to do with it:</strong></p>
      <ul>
        <li>On your phone: open this link, then use your browser's
        "Add to Home Screen" option so it sits right next to your other
        apps.</li>
        <li>On a computer: bookmark it.</li>
      </ul>
      <p><a href="${accessUrl}">${accessUrl}</a></p>
      <p>Tap it any time to see your matches, update your availability,
      or edit your profile.</p>
    `,
  };
}

export function matchProposedEmail({
  matchNumber,
  firstName,
  matchDate,
  timeSlot,
  courtName,
  roster,
  proposedAt,
  acceptUrl,
  conflictNote,
  proposedByName,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  roster: RosterEntry[];
  proposedAt: string;
  acceptUrl: string;
  conflictNote?: string | null;
  proposedByName?: string | null;
}) {
  const displayDate = formatShortDate(matchDate);
  const detailsHtml = formatMatchDetailsHtml({
    matchNumber,
    statusLabel: "PROPOSED",
    matchDate,
    timeSlot,
    courtName,
    roster,
    footerLines: [
      `Proposed: ${new Date(proposedAt).toLocaleString()}`,
      `match created by: ${proposedByName ?? "Manager"}`,
    ],
  });
  return {
    subject: `New match proposed: ${displayDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>You've been proposed for a match:</p>
      ${detailsHtml}
      ${conflictNote ? `<p style="color:#b45309;"><strong>⚠️ Possible conflict:</strong> ${conflictNote}</p>` : ""}
      <p>Please accept or decline as soon as you can — the match will
      auto-cancel if everyone hasn't accepted in time.</p>
      <p><a href="${acceptUrl}" style="display:inline-block;padding:8px 16px;background:#2d5a3d;color:#ffffff;border-radius:6px;text-decoration:none;">Accept or Decline this Match</a></p>
    `,
  };
}

// Build-a-Match (self-serve, target_size 2 or 4) invite email --
// deliberately separate from matchProposedEmail above rather than a
// branch inside it, because the content this needs to say is
// genuinely different: it names an exact singles/doubles match type,
// and -- when the proposer invited more candidates than the match
// needs -- is upfront about the WHOLE invite plan, not just "you've
// been proposed." Sent to a recipient in either wave (see `wave`):
// wave 1 (marked available that day, invited immediately) or wave 2
// (not marked available, only asked once wave 1 hasn't filled the
// match in time). Both waves see the same full picture -- who
// marked available and is being asked to confirm, and who else is
// being asked in case more players are needed -- just worded from
// their own side of that list.
export function selfServeInviteEmail({
  matchNumber,
  firstName,
  matchDate,
  timeSlot,
  courtName,
  targetSize,
  wave,
  availableNames,
  otherNames,
  roster,
  acceptUrl,
  conflictNote,
  proposedByName,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  targetSize: 2 | 4;
  wave: 1 | 2;
  availableNames: string[];
  otherNames: string[];
  roster: RosterEntry[];
  acceptUrl: string;
  conflictNote?: string | null;
  proposedByName?: string | null;
}) {
  const matchType = targetSize === 2 ? "singles" : "doubles";
  const displayDate = formatShortDate(matchDate);
  const shortHanded = otherNames.length > 0;

  const introLine =
    wave === 1
      ? `You've been invited to a ${matchType} match on ${displayDate}.`
      : `You're being asked to help fill a ${matchType} match on ${displayDate}.`;

  let explainerHtml = "";
  if (shortHanded) {
    const availableList = availableNames.length ? availableNames.join(", ") : "no one yet";
    const otherList = otherNames.join(", ");
    explainerHtml =
      wave === 1
        ? `<p>We may be short on players who marked themselves available that day, so we're also asking a
           few players who haven't as a backup, in case we need them. The available players being asked to
           confirm are: <strong>${availableList}</strong>. The system is also asking the following players who
           were not marked as available: <strong>${otherList}</strong>. If and when enough players accept this
           match, on a first-come basis, it will be confirmed.</p>`
        : `<p>The available players who marked themselves free that day were asked first: <strong>${availableList}</strong>.
           Not enough of them have accepted yet, so we're also asking you and a few other players who weren't
           marked as available: <strong>${otherList}</strong>. If and when enough players accept this match, on a
           first-come basis, it will be confirmed.</p>`;
  }

  const details = formatMatchDetailsHtml({
    matchNumber,
    statusLabel: `PROPOSED (BAM${targetSize})`,
    matchDate,
    timeSlot,
    courtName,
    roster: roster.filter((p) => p.status.toLowerCase() === "accepted"),
    footerLines: [`match created by: ${proposedByName ?? "a club member"}`],
  });

  return {
    subject: `You're invited: ${matchType} match on ${displayDate}${shortHanded ? " (need players)" : ""}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>${introLine}</p>
      ${explainerHtml}
      ${details}
      ${conflictNote ? `<p style="color:#b45309;"><strong>⚠️ Possible conflict:</strong> ${conflictNote}</p>` : ""}
      <p>Please click below ASAP to accept this match -- spots go to whoever responds first.</p>
      <p><a href="${acceptUrl}" style="display:inline-block;padding:8px 16px;background:#2d5a3d;color:#ffffff;border-radius:6px;text-decoration:none;">Accept or Decline this Match</a></p>
    `,
  };
}

export function matchNudgeEmail({
  matchNumber,
  firstName,
  matchDate,
  timeSlot,
  acceptUrl,
  proposedByName,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  acceptUrl: string;
  proposedByName?: string | null;
}) {
  const displayDate = formatShortDate(matchDate);
  const longDate = formatLongDateWithWeekday(matchDate);
  return {
    subject: `Reminder: respond to your ${displayDate} match`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Just a reminder — you still have a proposed match, <strong>Match ID: M${matchNumber}</strong>,
      on <strong>${longDate}</strong> (${timeSlot}) waiting on your response.
      It will be automatically cancelled if you don't respond in time.</p>
      ${proposedByName ? `<p>Proposed by: ${proposedByName}</p>` : ""}
      <p><a href="${acceptUrl}" style="display:inline-block;padding:8px 16px;background:#2d5a3d;color:#ffffff;border-radius:6px;text-decoration:none;">Accept or Decline this Match</a></p>
    `,
  };
}

function buildDirectionsUrl(destination: string, origin?: string | null) {
  const params = new URLSearchParams({ api: "1", destination });
  if (origin) params.set("origin", origin);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function matchConfirmedEmail({
  matchNumber,
  firstName,
  matchDate,
  timeSlot,
  courtName,
  courtAddress,
  playerAddress,
  roster,
  confirmedAt,
  proposedByName,
  icsDownloadUrl,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  courtAddress?: string | null;
  playerAddress?: string | null;
  roster: RosterEntry[];
  confirmedAt: string;
  proposedByName?: string | null;
  icsDownloadUrl?: string | null;
}) {
  const displayDate = formatShortDate(matchDate);
  // Directions need a destination at minimum -- the court's address.
  // The player's own address (their profile "Street address" plus
  // city/state/zip) is used as the starting point when we have it;
  // if not, the link still works, Google Maps just asks the player
  // for a starting location instead of assuming one.
  const directionsUrl = courtAddress ? buildDirectionsUrl(courtAddress, playerAddress) : null;
  const details = formatMatchDetailsHtml({
    matchNumber,
    statusLabel: "CONFIRMED",
    matchDate,
    timeSlot,
    courtName: courtAddress ? `${courtName} — ${courtAddress}` : courtName,
    roster,
    footerLines: [
      `Confirmed: ${new Date(confirmedAt).toLocaleString()}`,
      `match created by: ${proposedByName ?? "Manager"}`,
    ],
  });
  const buttonStyle = "display:inline-block;padding:8px 16px;background:#2d5a3d;color:#ffffff;border-radius:6px;text-decoration:none;margin-right:8px;margin-bottom:8px;";
  return {
    subject: `Confirmed: your match on ${displayDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Everyone accepted — your match is confirmed! 🎾</p>
      ${details}
      ${
        directionsUrl || icsDownloadUrl
          ? `<p>${directionsUrl ? `<a href="${directionsUrl}" style="${buttonStyle}">Get Directions</a>` : ""}${
              icsDownloadUrl ? `<a href="${icsDownloadUrl}" style="${buttonStyle}">Download Calendar (.ics)</a>` : ""
            }</p>`
          : ""
      }
      <p>A calendar invite is also attached — tap it to add this to your calendar.</p>
    `,
  };
}

// Sent to an overflow-match invitee (see migration_self_serve_overflow.sql)
// who never got to respond because the match filled up with other
// candidates first -- distinct from matchCancelledEmail, since the
// match itself is still happening, just without them.
export function matchSpotFilledEmail({
  matchNumber,
  firstName,
  matchDate,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
}) {
  const displayDate = formatShortDate(matchDate);
  return {
    subject: `Match M${matchNumber} filled up (${displayDate})`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Thanks for your interest in the ${displayDate} match -- it
      filled up with other players before you responded, so there's
      nothing left for you to do here. No action needed.</p>
      <p>Keep an eye out for the next one!</p>
    `,
  };
}

export function matchCancelledEmail({
  matchNumber,
  firstName,
  matchDate,
  timeSlot,
  courtName,
  roster,
  cancelledAt,
  reason,
  declineReason,
  proposedByName,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  roster: RosterEntry[];
  cancelledAt: string;
  reason: string;
  declineReason?: string | null;
  proposedByName?: string | null;
}) {
  const displayDate = formatShortDate(matchDate);
  const details = formatMatchDetailsHtml({
    matchNumber,
    statusLabel: "CANCELLED",
    matchDate,
    timeSlot,
    courtName,
    roster,
    footerLines: [
      `Cancelled: ${new Date(cancelledAt).toLocaleString()}`,
      `match created by: ${proposedByName ?? "Manager"}`,
    ],
  });
  return {
    subject: `Match cancelled: ${displayDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Your match has been cancelled. Reason: ${reason}</p>
      ${declineReason ? `<p>Reason given: "${declineReason}"</p>` : ""}
      ${details}
      <p>Check your availability and matches page for updates.</p>
    `,
  };
}
