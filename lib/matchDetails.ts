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
