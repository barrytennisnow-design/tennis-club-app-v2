// Thin wrapper around Resend (https://resend.com — free tier: 3,000
// emails/month, 100/day, no cost). Every send is logged to email_log
// so managers have the same visibility the old "Outbox" tab gave them.
//
// Requires RESEND_API_KEY and EMAIL_FROM in env vars. If RESEND_API_KEY
// isn't set, sends are skipped but still logged with status
// 'skipped_no_api_key' so nothing throws in local/dev without a key.

import { Resend } from "resend";
import { formatShortDate } from "./formatDate";

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
  attachments?: { filename: string; content: string }[]; // content = base64
}) {
  const resend = getResend();
  let status = "sent";
  let errorMessage: string | null = null;

  // Sandbox mode: reroute every email to one inbox (the manager's)
  // instead of real players, so you can test the whole system --
  // match proposals, nudges, cancellations, access links -- without
  // spamming real people. Turn on by setting SANDBOX_MODE=true and
  // SANDBOX_EMAIL=you@example.com in your environment variables.
  const sandboxOn = process.env.SANDBOX_MODE === "true";
  const actualRecipient = sandboxOn && process.env.SANDBOX_EMAIL ? process.env.SANDBOX_EMAIL : to;
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
        ...(attachments ? { attachments } : {}),
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
  teammates,
  acceptUrl,
  conflictNote,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  teammates: string[];
  acceptUrl: string;
  conflictNote?: string | null;
}) {
  const displayDate = formatShortDate(matchDate);
  return {
    subject: `New match proposed: ${displayDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>You've been proposed for a match:</p>
      <ul>
        <li><strong>Match ID:</strong> M${matchNumber}</li>
        <li><strong>Date:</strong> ${displayDate}</li>
        <li><strong>Time:</strong> ${timeSlot}</li>
        <li><strong>Court:</strong> ${courtName}</li>
        <li><strong>Playing with:</strong> ${teammates.join(", ")}</li>
      </ul>
      ${conflictNote ? `<p style="color:#b45309;"><strong>⚠️ Possible conflict:</strong> ${conflictNote}</p>` : ""}
      <p>Please accept or decline as soon as you can — the match will
      auto-cancel if everyone hasn't accepted in time.</p>
      <p><a href="${acceptUrl}">Respond to this match</a></p>
    `,
  };
}

export function matchNudgeEmail({
  matchNumber,
  firstName,
  matchDate,
  timeSlot,
  acceptUrl,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  acceptUrl: string;
}) {
  const displayDate = formatShortDate(matchDate);
  return {
    subject: `Reminder: respond to your ${displayDate} match`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Just a reminder — you still have a proposed match, <strong>Match ID: M${matchNumber}</strong>,
      on <strong>${displayDate}</strong> (${timeSlot}) waiting on your response.
      It will be automatically cancelled if you don't respond in time.</p>
      <p><a href="${acceptUrl}">Respond now</a></p>
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
  teammates,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  courtAddress?: string | null;
  playerAddress?: string | null;
  teammates: string[];
}) {
  const displayDate = formatShortDate(matchDate);
  // Directions need a destination at minimum -- the court's address.
  // The player's own address (their profile "Street address" plus
  // city/state/zip) is used as the starting point when we have it;
  // if not, the link still works, Google Maps just asks the player
  // for a starting location instead of assuming one.
  const directionsUrl = courtAddress ? buildDirectionsUrl(courtAddress, playerAddress) : null;
  return {
    subject: `Confirmed: your match on ${displayDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Everyone accepted — your match is confirmed! 🎾</p>
      <ul>
        <li><strong>Match ID:</strong> M${matchNumber}</li>
        <li><strong>Date:</strong> ${displayDate}</li>
        <li><strong>Time:</strong> ${timeSlot}</li>
        <li><strong>Court:</strong> ${courtName}${courtAddress ? ` — ${courtAddress}` : ""}</li>
        <li><strong>Playing with:</strong> ${teammates.join(", ")}</li>
      </ul>
      ${
        directionsUrl
          ? `<p><a href="${directionsUrl}" style="display:inline-block;padding:8px 16px;background:#2d5a3d;color:#ffffff;border-radius:6px;text-decoration:none;">Get Directions</a></p>`
          : ""
      }
      <p>A calendar invite is attached — tap it to add this to your calendar.</p>
    `,
  };
}

export function matchCancelledEmail({
  matchNumber,
  firstName,
  matchDate,
  timeSlot,
  reason,
  declineReason,
}: {
  matchNumber: number | string;
  firstName: string;
  matchDate: string;
  timeSlot: string;
  reason: string;
  declineReason?: string | null;
}) {
  const displayDate = formatShortDate(matchDate);
  return {
    subject: `Match cancelled: ${displayDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Your match, <strong>Match ID: M${matchNumber}</strong>, on <strong>${displayDate}</strong> (${timeSlot}) has been
      cancelled. Reason: ${reason}</p>
      ${declineReason ? `<p>Reason given: "${declineReason}"</p>` : ""}
      <p>Check your availability and matches page for updates.</p>
    `,
  };
}
