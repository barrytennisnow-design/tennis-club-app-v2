import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMatchIcs } from "../../lib/ics.ts";

const baseArgs = {
  matchId: "abc-123",
  matchNumber: 7,
  matchDate: "2026-07-16",
  timeDisplay: "8:00am warmup, 8:15am start play",
  courtName: "Langford 1",
  playerNames: ["Alice Anderson", "Bob Brown"],
};

describe("buildMatchIcs", () => {
  test("produces a well-formed VCALENDAR/VEVENT with CRLF line endings", () => {
    const ics = buildMatchIcs(baseArgs);
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /\r\nEND:VCALENDAR$/);
    assert.match(ics, /BEGIN:VEVENT\r\n/);
    assert.match(ics, /END:VEVENT\r\n/);
  });

  test("includes exactly two VALARM blocks -- 30 min and 15 min before -- and not more or fewer", () => {
    const ics = buildMatchIcs(baseArgs);
    const alarmCount = (ics.match(/BEGIN:VALARM/g) || []).length;
    assert.equal(alarmCount, 2, "expected exactly 2 VALARM blocks");
    assert.match(ics, /TRIGGER:-PT30M/);
    assert.match(ics, /TRIGGER:-PT15M/);
  });

  test("includes X-APPLE-TRAVEL-DURATION set to 30 minutes -- confirmed from the prior working system's real source", () => {
    const ics = buildMatchIcs(baseArgs);
    assert.match(ics, /X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M/);
  });

  test("parses the start time out of the display text correctly (8:00am -> DTSTART at 08:00:00)", () => {
    const ics = buildMatchIcs(baseArgs);
    assert.match(ics, /DTSTART:20260716T080000/);
  });

  test("defaults to a 2-hour block when computing DTEND", () => {
    const ics = buildMatchIcs(baseArgs);
    assert.match(ics, /DTEND:20260716T100000/);
  });

  test("falls back to 8:00am when the display text has no parseable time at all", () => {
    const ics = buildMatchIcs({ ...baseArgs, timeDisplay: "" });
    assert.match(ics, /DTSTART:20260716T080000/);
  });

  test("correctly handles a PM time crossing into the next parseable hour (e.g. 6:00pm)", () => {
    const ics = buildMatchIcs({ ...baseArgs, timeDisplay: "6:00pm warmup, 6:15pm start play" });
    assert.match(ics, /DTSTART:20260716T180000/);
    assert.match(ics, /DTEND:20260716T200000/);
  });

  test("only includes X-APPLE-STRUCTURED-LOCATION when court coordinates are actually provided", () => {
    const withoutCoords = buildMatchIcs(baseArgs);
    assert.doesNotMatch(withoutCoords, /X-APPLE-STRUCTURED-LOCATION/);

    const withCoords = buildMatchIcs({ ...baseArgs, courtLatitude: 27.123456, courtLongitude: -80.123456 });
    assert.match(withCoords, /X-APPLE-STRUCTURED-LOCATION/);
    assert.match(withCoords, /geo:27\.123456,-80\.123456/);
  });

  test("escapes commas in player names so the ICS format isn't corrupted", () => {
    const ics = buildMatchIcs({ ...baseArgs, playerNames: ["Smith, Jr., John"] });
    // A raw unescaped comma would break the DESCRIPTION field's structure.
    // Periods correctly do NOT need escaping in ICS -- only , ; and newlines do.
    assert.match(ics, /Smith\\, Jr\.\\, John/);
  });

  test("every match gets a unique, stable UID derived from its match id", () => {
    const ics1 = buildMatchIcs({ ...baseArgs, matchId: "match-1" });
    const ics2 = buildMatchIcs({ ...baseArgs, matchId: "match-2" });
    assert.match(ics1, /UID:match-match-1@clubtennis/);
    assert.match(ics2, /UID:match-match-2@clubtennis/);
  });

  test("DESCRIPTION uses the standardized match-details block (Match ID header, CONFIRMED status)", () => {
    const ics = buildMatchIcs(baseArgs);
    assert.match(ics, /DESCRIPTION:Match ID: M7 CONFIRMED\\n/);
    assert.match(ics, /Date: Thursday\\, 7-16-26\\n/);
    assert.match(ics, /Court: Langford 1\\n/);
    assert.match(ics, /Players:\\n/);
  });

  test("DESCRIPTION lists each roster player's status and phone when a roster is provided", () => {
    const ics = buildMatchIcs({
      ...baseArgs,
      roster: [
        { name: "Alice Anderson", status: "accepted", phone: "7729248587" },
        { name: "Bob Brown", status: "proposed", phone: null },
      ],
    });
    assert.match(ics, /Alice Anderson.*Status: ACCEPTED \| Phone: \(772\) 924-8587/);
    assert.match(ics, /Bob Brown.*Status: PROPOSED(?!.*Phone)/);
  });

  test("DESCRIPTION falls back to ACCEPTED status per playerNames when no roster is given", () => {
    const ics = buildMatchIcs(baseArgs);
    assert.match(ics, /Alice Anderson.*Status: ACCEPTED/);
  });

  test("DESCRIPTION includes Confirmed and match-created-by footer lines when provided", () => {
    const ics = buildMatchIcs({
      ...baseArgs,
      confirmedAt: "2026-07-15T11:04:43-04:00",
      proposedByName: "Barry Richman",
    });
    assert.match(ics, /Confirmed: /);
    assert.match(ics, /match created by: Barry Richman/);
  });

  test("LOCATION includes the court address when provided, not just the court name", () => {
    const ics = buildMatchIcs({ ...baseArgs, courtAddress: "123 Court Rd" });
    assert.match(ics, /LOCATION:Langford 1\\, 123 Court Rd/);
  });
});
