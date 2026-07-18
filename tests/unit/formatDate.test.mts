import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatShortDate, formatShortDateWithWeekday, formatLongDateWithWeekday } from "../../lib/formatDate.ts";

describe("formatShortDate", () => {
  test("formats as M-D-YY with no leading zeros", () => {
    assert.equal(formatShortDate("2026-07-16"), "7-16-26");
    assert.equal(formatShortDate("2026-01-05"), "1-5-26");
  });

  test("handles a full ISO timestamp, not just a bare date", () => {
    assert.equal(formatShortDate("2026-07-16T14:30:00.000Z"), formatShortDate("2026-07-16"));
  });

  test("returns an em dash for missing or invalid input, never throws", () => {
    assert.equal(formatShortDate(null), "—");
    assert.equal(formatShortDate(undefined), "—");
    assert.equal(formatShortDate("not-a-date"), "—");
  });
});

describe("formatShortDateWithWeekday", () => {
  test("prefixes the short weekday abbreviation", () => {
    // 2026-07-16 is a Thursday
    assert.equal(formatShortDateWithWeekday("2026-07-16"), "Thu 7-16-26");
  });
});

describe("formatLongDateWithWeekday", () => {
  test("uses the full weekday name", () => {
    assert.equal(formatLongDateWithWeekday("2026-07-16"), "Thursday, 7-16-26");
  });
});
