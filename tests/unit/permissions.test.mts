// Run: node --experimental-strip-types --test tests/unit
// (see tests/unit/README.md for full instructions)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hasPermission, numericPermission } from "../../lib/permissions.ts";

describe("hasPermission", () => {
  test("manager always has every permission, regardless of their permissions object", () => {
    assert.equal(hasPermission({ role: "manager", permissions: {} }, "roster_add_player"), true);
    assert.equal(hasPermission({ role: "manager" }, "matrix_cancel_match"), true);
  });

  test("captain only has a permission when it's explicitly true", () => {
    const captain = { role: "captain", permissions: { roster_add_player: true, roster_change_ranking: false } };
    assert.equal(hasPermission(captain, "roster_add_player"), true);
    assert.equal(hasPermission(captain, "roster_change_ranking"), false);
    assert.equal(hasPermission(captain, "roster_send_link"), false); // not present at all
  });

  test("plain player has no permissions at all", () => {
    assert.equal(hasPermission({ role: "player", permissions: { roster_add_player: true } }, "roster_add_player"), false);
  });

  test("null/undefined caller is always denied -- this is the safe-by-default case that matters most", () => {
    assert.equal(hasPermission(null, "matrix_cancel_match"), false);
    assert.equal(hasPermission(undefined, "matrix_cancel_match"), false);
  });
});

describe("numericPermission", () => {
  test("manager is unlimited", () => {
    assert.equal(numericPermission({ role: "manager" }, "matrix_display_days_ahead"), Infinity);
  });

  test("captain without the cap explicitly set gets 0, not unlimited -- this exact bug hid the whole Match Matrix from captains earlier this session", () => {
    assert.equal(numericPermission({ role: "captain", permissions: {} }, "matrix_display_days_ahead"), 0);
  });

  test("captain with the cap set gets that exact number", () => {
    const captain = { role: "captain", permissions: { matrix_display_days_ahead: 14 } };
    assert.equal(numericPermission(captain, "matrix_display_days_ahead"), 14);
  });

  test("null caller gets 0", () => {
    assert.equal(numericPermission(null, "matrix_display_days_ahead"), 0);
  });
});
