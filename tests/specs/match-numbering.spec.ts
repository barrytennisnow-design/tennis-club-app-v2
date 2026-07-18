import { test, expect } from "@playwright/test";
import { roleContextAndPage } from "../setup/roles";
import { adminDb, isoDaysFromNow, setAvailable, clearTestMatchesOn } from "../setup/db";

// Regression test for a real bug this session: Generate Match Matrix
// computed the "next match number" by looking only at proposed/
// confirmed matches, treating cancelled ones as if they'd never
// happened. Since cancelled matches stay permanently visible on the
// Matches page under their original number, a later Generate run
// could hand that same number to a brand new match -- putting two
// different matches on screen both labeled e.g. "M3". Fixed by
// including cancelled (not just proposed/confirmed) when computing
// the next number; only drafts are excluded.

const DATE = isoDaysFromNow(2);

test("a cancelled match's number is never reused by a later Generate run", async ({ browser }) => {
  await setAvailable(["playerA", "playerB", "playerC", "playerD"], DATE);

  const { context, page } = await roleContextAndPage(browser, "manager");

  // First generate/propose/cancel cycle -- establishes a cancelled
  // match with a known, "used" number.
  let res = await page.request.post("/api/generate-matches", {
    data: { startDate: DATE, endDate: DATE },
  });
  expect(res.ok()).toBeTruthy();

  const db = adminDb();
  const { data: draftMatches } = await db
    .from("matches")
    .select("id, match_number")
    .eq("match_date", DATE)
    .eq("status", "draft");
  expect(draftMatches?.length).toBeGreaterThan(0);
  const firstMatchId = draftMatches![0].id;
  const firstMatchNumber = draftMatches![0].match_number;

  // Propose it, then immediately cancel it -- this is the exact
  // sequence that triggered the bug (a cancelled match's number
  // needs to stay permanently "spent").
  let proposeRes = await page.request.post("/api/admin/propose-match", {
    data: { match_id: firstMatchId },
  });
  expect(proposeRes.ok()).toBeTruthy();

  let cancelRes = await page.request.post("/api/admin/cancel-match", {
    data: { match_id: firstMatchId },
  });
  expect(cancelRes.ok()).toBeTruthy();

  // Generate again -- the new draft(s) must never reuse firstMatchNumber.
  res = await page.request.post("/api/generate-matches", {
    data: { startDate: DATE, endDate: DATE },
  });
  expect(res.ok()).toBeTruthy();

  const { data: allMatchesAfter } = await db
    .from("matches")
    .select("id, match_number, status")
    .eq("match_date", DATE);

  const numbers = (allMatchesAfter ?? []).map((m: any) => m.match_number);
  const duplicates = numbers.filter((n: number, i: number) => numbers.indexOf(n) !== i);
  expect(duplicates, `duplicate match numbers found: ${duplicates.join(", ")}`).toHaveLength(0);

  const cancelledStillHasItsNumber = (allMatchesAfter ?? []).some(
    (m: any) => m.id === firstMatchId && m.match_number === firstMatchNumber && m.status === "cancelled"
  );
  expect(cancelledStillHasItsNumber).toBeTruthy();

  await context.close();
  await clearTestMatchesOn(DATE);
});
