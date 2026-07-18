import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isWithinSelfServeWindow } from "../../lib/selfServe.ts";

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("isWithinSelfServeWindow", () => {
  test("today is always within the window, even with a window of 0", () => {
    assert.equal(isWithinSelfServeWindow(isoDaysFromNow(0), 0), true);
  });

  test("a date exactly at the edge of the window is included (inclusive boundary)", () => {
    assert.equal(isWithinSelfServeWindow(isoDaysFromNow(3), 3), true);
  });

  test("one day past the window is excluded", () => {
    assert.equal(isWithinSelfServeWindow(isoDaysFromNow(4), 3), false);
  });

  test("yesterday is always excluded, regardless of window size", () => {
    assert.equal(isWithinSelfServeWindow(isoDaysFromNow(-1), 30), false);
  });

  test("a larger window correctly admits further-out dates", () => {
    assert.equal(isWithinSelfServeWindow(isoDaysFromNow(10), 14), true);
    assert.equal(isWithinSelfServeWindow(isoDaysFromNow(15), 14), false);
  });
});
