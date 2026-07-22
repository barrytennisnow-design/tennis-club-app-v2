import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getNextMatchNumber } from "../../lib/matching.ts";

// Minimal fake of the chainable Supabase query builder shape
// getNextMatchNumber actually calls:
//   supabaseAdmin.from("matches").select("match_number")
//     .order("match_number", { ascending: false }).limit(1).maybeSingle()
// `rows` is the full fake "matches" table (every row needs at least
// match_number and status so tests can express "add a draft row" etc.
// naturally, even though the real query only selects match_number).
function fakeAdmin(rows: { match_number: number; status: string }[]) {
  return {
    from(table: string) {
      assert.equal(table, "matches");
      let filtered = rows;
      const builder = {
        select() {
          return builder;
        },
        // Real Postgrest semantics: .neq(column, value) excludes rows
        // where that column equals value. Faithfully filtering here
        // (rather than a no-op passthrough) matters: it's what lets
        // this suite actually fail against the old buggy
        // implementation (which called .neq("status", "draft")),
        // instead of silently passing regardless of what the
        // implementation does.
        neq(column: string, value: string) {
          filtered = filtered.filter((r) => (r as any)[column] !== value);
          return builder;
        },
        order(column: string, opts: { ascending: boolean }) {
          assert.equal(column, "match_number");
          assert.equal(opts.ascending, false);
          return builder;
        },
        limit(_n: number) {
          return builder;
        },
        async maybeSingle() {
          if (filtered.length === 0) return { data: null };
          const top = [...filtered].sort((a, b) => b.match_number - a.match_number)[0];
          return { data: { match_number: top.match_number } };
        },
      };
      return builder;
    },
  };
}

describe("getNextMatchNumber", () => {
  test("with no matches at all, starts at 1", async () => {
    const next = await getNextMatchNumber(fakeAdmin([]));
    assert.equal(next, 1);
  });

  test("returns one past the highest proposed/confirmed/cancelled number", async () => {
    const next = await getNextMatchNumber(
      fakeAdmin([
        { match_number: 1, status: "cancelled" },
        { match_number: 2, status: "confirmed" },
        { match_number: 3, status: "proposed" },
      ])
    );
    assert.equal(next, 4);
  });

  // This is the exact regression this fix addresses: a DRAFT match
  // sitting on the Match Matrix already occupies a real, visible
  // number. If getNextMatchNumber ignored draft rows (as an earlier
  // version did, via .neq("status", "draft")), a new self-serve
  // proposal built while that draft was still sitting there would be
  // handed the SAME number -- invisible until someone later clicked
  // "Propose" on the draft, at which point the Match Matrix and
  // Manage Matches page both showed two different matches labeled
  // e.g. "M5".
  test("a draft match's number is NOT reused by the next match created (the reported bug)", async () => {
    const rows = [
      { match_number: 3, status: "proposed" },
      { match_number: 4, status: "confirmed" },
      { match_number: 5, status: "draft" }, // sitting on the Match Matrix right now
    ];
    const next = await getNextMatchNumber(fakeAdmin(rows));
    // Must be 6, not 5 -- 5 is already taken by the visible draft.
    assert.equal(next, 6);
    assert.notEqual(next, 5, "must never hand out a number a draft is already using");
  });

  test("a cancelled match's number is never reused either (must never regress this pre-existing guarantee)", async () => {
    const next = await getNextMatchNumber(
      fakeAdmin([
        { match_number: 1, status: "proposed" },
        { match_number: 2, status: "cancelled" }, // highest number, but cancelled
      ])
    );
    assert.equal(next, 3);
  });

  test("draft is the highest-numbered row -- next number still skips past it", async () => {
    const next = await getNextMatchNumber(
      fakeAdmin([
        { match_number: 1, status: "confirmed" },
        { match_number: 7, status: "draft" },
      ])
    );
    assert.equal(next, 8);
  });
});
