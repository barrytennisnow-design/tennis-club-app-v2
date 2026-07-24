// One shared plain-text "match details" block, reused by every match
// email (proposed / confirmed / cancelled) AND the .ics DESCRIPTION
// field. Previously each place built its own ad hoc summary (a
// bullet list here, "time display + playing with" there), which is
// why the ICS attachment and the emails never quite matched. Keeping
// the format in one function means all of them stay consistent by
// construction.

import { formatLongDateWithWeekday } from "./formatDate.ts";
import { formatPhone } from "./formatPhone.ts";

const NAME_COLUMN_WIDTH = 22;

export type RosterEntry = {
  name: string;
  status: string;
  phone?: string | null;
};

export function formatMatchDetailsText({
  matchNumber,
  statusLabel,
  matchDate,
  timeSlot,
  courtName,
  roster,
  footerLines = [],
}: {
  matchNumber: number | string;
  statusLabel: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  roster: RosterEntry[];
  footerLines?: string[];
}): string {
  const lines = [
    `Match ID: M${matchNumber} ${statusLabel}`,
    `Date: ${formatLongDateWithWeekday(matchDate)}`,
    `Time: ${timeSlot}`,
    `Court: ${courtName}`,
    `Players:`,
    ...roster.map((p) => {
      const namePart = p.name.length >= NAME_COLUMN_WIDTH ? `${p.name} ` : p.name.padEnd(NAME_COLUMN_WIDTH, " ");
      const phonePart = p.phone ? ` | Phone: ${formatPhone(p.phone)}` : "";
      return `${namePart}Status: ${p.status.toUpperCase()}${phonePart}`;
    }),
    ...footerLines,
  ];
  return lines.join("\n");
}

// HTML "card" version of the same match details block, used by every
// match email (proposed / confirmed / cancelled / build-a-match
// invite) in place of a monospace <pre> block. The old fixed-width
// padded-columns text approach reads fine on desktop but wraps badly
// on an iPhone-width screen, splitting each player's name/status/phone
// across multiple ragged lines. This mirrors the mobile-friendly,
// one-fact-per-line "web" layout instead: bold name, then Status on
// its own line, then Phone on its own line below that, with a thin
// rule between players so it's still easy to scan.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatMatchDetailsHtml({
  matchNumber,
  statusLabel,
  matchDate,
  timeSlot,
  courtName,
  roster,
  footerLines = [],
}: {
  matchNumber: number | string;
  statusLabel: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  roster: RosterEntry[];
  footerLines?: string[];
}): string {
  const statusColor = statusLabel.startsWith("CONFIRMED")
    ? "#1a7f37"
    : statusLabel.startsWith("CANCELLED")
    ? "#b42318"
    : "#0f2d52";

  const playerRows = roster
    .map((p) => {
      const statusUpper = p.status.toUpperCase();
      const statusStyle =
        statusUpper === "ACCEPTED"
          ? "color:#1a7f37;font-weight:700;"
          : statusUpper === "PROPOSED" || statusUpper === "DECLINED"
          ? "color:#c0342a;font-weight:700;"
          : "color:#555555;font-weight:700;";
      return `
        <div style="padding:12px 0;border-top:1px solid #cfe3f3;">
          <div style="font-size:16px;font-weight:700;color:#0f2d52;">${escapeHtml(p.name)}</div>
          <div style="font-size:14px;${statusStyle}">Status: ${statusUpper}</div>
          ${p.phone ? `<div style="font-size:14px;color:#333333;">Phone: ${escapeHtml(formatPhone(p.phone))}</div>` : ""}
        </div>`;
    })
    .join("");

  const footerHtml = footerLines.length
    ? `<div style="border-top:1px solid #cfe3f3;margin-top:6px;padding-top:10px;font-size:13px;color:#555555;">${footerLines
        .map(escapeHtml)
        .join("<br/>")}</div>`
    : "";

  return `
    <div style="background:#eaf6fd;border-left:4px solid #2d6cdf;border-radius:6px;padding:16px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;">
      <div style="font-size:15px;color:#0f2d52;"><strong>Match ID:</strong> M${matchNumber}</div>
      <div style="font-size:24px;font-weight:800;color:${statusColor};text-align:center;margin:6px 0 14px;letter-spacing:0.5px;">${escapeHtml(statusLabel)}</div>
      <div style="font-size:15px;color:#0f2d52;margin-bottom:8px;"><strong>Court:</strong> ${escapeHtml(courtName)}</div>
      <div style="font-size:15px;color:#0f2d52;margin-bottom:14px;"><strong>Date &amp; Time:</strong> ${escapeHtml(formatLongDateWithWeekday(matchDate))} at ${escapeHtml(timeSlot)}</div>
      <div style="font-size:15px;font-weight:700;color:#0f2d52;margin-bottom:2px;">Players:</div>
      ${playerRows}
      ${footerHtml}
    </div>`;
}
