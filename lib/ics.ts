// Builds a .ics calendar-invite file for a confirmed match, so
// players can add it to their calendar with one tap. "morning" is
// mapped to a concrete 8-10am slot -- adjust TIME_SLOTS below if
// you add more slot options later.

const TIME_SLOTS: Record<string, { start: string; end: string }> = {
  morning: { start: "080000", end: "100000" },
};

function icsDate(dateStr: string, timeStr: string) {
  // dateStr: 'YYYY-MM-DD', timeStr: 'HHMMSS' -> '20260713T080000'
  return `${dateStr.replace(/-/g, "")}T${timeStr}`;
}

function escapeIcs(text: string) {
  return text.replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
}

export function buildMatchIcs({
  matchId,
  matchDate,
  timeSlot,
  courtName,
  playerNames,
}: {
  matchId: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  playerNames: string[];
}) {
  const slot = TIME_SLOTS[timeSlot] ?? TIME_SLOTS.morning;
  const dtStart = icsDate(matchDate, slot.start);
  const dtEnd = icsDate(matchDate, slot.end);
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const summary = escapeIcs(`Tennis Match — ${courtName}`);
  const description = escapeIcs(`Playing with: ${playerNames.join(", ")}`);
  const location = escapeIcs(courtName);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club Tennis//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:match-${matchId}@clubtennis`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return ics;
}
