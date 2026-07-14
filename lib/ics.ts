// Builds a .ics calendar-invite file for a CONFIRMED match only (never
// for a proposed one -- see propose-match/route.ts). The event's start
// time is parsed out of the match's actual display time (e.g. "8:00am
// warmup, 8:15am start play"), so it always matches whatever time is
// shown to the player -- default or manager override -- instead of a
// fixed slot.

const FALLBACK_START = "080000"; // used only if the display text has no parseable time at all
const DEFAULT_DURATION_MINUTES = 120; // matches the old fixed 2-hour block

function parseStartTime(display: string): { start: string; end: string } {
  const match = display.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) {
    const endHour = (parseInt(FALLBACK_START.slice(0, 2), 10) + 2) % 24;
    return { start: FALLBACK_START, end: `${String(endHour).padStart(2, "0")}${FALLBACK_START.slice(2)}` };
  }

  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  const startTotalMinutes = hour * 60 + parseInt(minute, 10);
  const endTotalMinutes = (startTotalMinutes + DEFAULT_DURATION_MINUTES) % (24 * 60);

  const start = `${String(Math.floor(startTotalMinutes / 60)).padStart(2, "0")}${String(startTotalMinutes % 60).padStart(2, "0")}00`;
  const end = `${String(Math.floor(endTotalMinutes / 60)).padStart(2, "0")}${String(endTotalMinutes % 60).padStart(2, "0")}00`;
  return { start, end };
}

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
  timeDisplay,
  courtName,
  playerNames,
}: {
  matchId: string;
  matchDate: string;
  timeDisplay: string;
  courtName: string;
  playerNames: string[];
}) {
  const slot = parseStartTime(timeDisplay || "");
  const dtStart = icsDate(matchDate, slot.start);
  const dtEnd = icsDate(matchDate, slot.end);
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const summary = escapeIcs(`Tennis Match — ${courtName}`);
  const description = escapeIcs(`${timeDisplay || ""}\nPlaying with: ${playerNames.join(", ")}`);
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
