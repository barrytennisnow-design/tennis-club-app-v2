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
  courtAddress,
  courtLatitude,
  courtLongitude,
}: {
  matchId: string;
  matchDate: string;
  timeDisplay: string;
  courtName: string;
  playerNames: string[];
  courtAddress?: string | null;
  courtLatitude?: number | null;
  courtLongitude?: number | null;
}) {
  const slot = parseStartTime(timeDisplay || "");
  const dtStart = icsDate(matchDate, slot.start);
  const dtEnd = icsDate(matchDate, slot.end);
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const summary = escapeIcs(`Tennis Match — ${courtName}`);
  const description = escapeIcs(`${timeDisplay || ""}\nPlaying with: ${playerNames.join(", ")}`);
  const location = escapeIcs(courtName);

  // Confirmed from the prior system's actual working source code:
  // X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M below sets a fixed
  // 30-minute Travel Time directly -- no geocoded location needed.
  // (General Apple documentation describes a location-based, live
  // Apple-Maps-computed version of this feature, which is why an
  // X-APPLE-STRUCTURED-LOCATION option is also supported below for
  // courts that have coordinates entered -- but the static duration
  // property is what the confirmed-working prior system actually
  // used, and doesn't depend on that at all.)
  const structuredLocation =
    courtLatitude != null && courtLongitude != null
      ? `X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="${escapeIcs(courtAddress ?? courtName).replace(/"/g, "'")}";X-APPLE-RADIUS=100;X-TITLE="${courtName.replace(/"/g, "'")}"`
        + `:geo:${courtLatitude},${courtLongitude}`
      : null;

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
    ...(structuredLocation ? [structuredLocation] : []),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT30M",
    `DESCRIPTION:${summary} in 30 minutes`,
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT15M",
    `DESCRIPTION:${summary} in 15 minutes`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return ics;
}
