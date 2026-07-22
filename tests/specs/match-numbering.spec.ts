import { test, expect } from "@playwright/test";
import { roleContextAndPage, TEST_USERS } from "../setup/roles";
import { adminDb, isoDaysFromNow, setAvailable, clearTestMatchesOn } from "../setup/db";

// Regression tests for two real match-numbering bugs.
//
// Bug 1: Generate Match Matrix computed the "next match number" by
// looking only at proposed/confirmed matches, treating cancelled
// ones as if they'd never happened. Since a cancelled match stays
// permanently visible on the Matches page under its original number,
// a later Generate run could hand that same number to a brand new
// match -- two different matches both labeled e.g. "M3". Fixed by
// including cancelled matches when computing the next number.
//
// Bug 2 (found later): the fix for bug 1 excluded DRAFT matches from
// that same lookup, on the theory that drafts are just a scratch pad
// that gets wiped and renumbered every regeneration. But a draft
// sitting on the Match Matrix right now already occupies a real,
// visible number -- so a self-serve proposal (or another Generate
// run) built while that draft was still there could be handed the
// SAME number. The collision stayed invisible until someone clicked
// "Propose" on that draft, at which point the Match Matrix and
// Manage Matches page both showed two different matches labeled the
// same. Fixed by including ALL matches, draft included, in the
// lookup -- match numbers only need to be unique, not gapless.

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

const DATE2 = isoDaysFromNow(2 + 7); // a different, unused date so it can't collide with the test above

test("a draft match's number is not reused by a self-serve match built while the draft still exists", async ({ browser }) => {
  await setAvailable(["playerA", "playerB"], DATE2);

  const { context: managerContext, page: managerPage } = await roleContextAndPage(browser, "manager");

  // Generate a draft on DATE2 and note its number -- this draft is
  // deliberately left un-proposed, sitting on the Match Matrix, for
  // the rest of the test.
  const genRes = await managerPage.request.post("/api/generate-matches", {
    data: { startDate: DATE2, endDate: DATE2 },
  });
  expect(genRes.ok()).toBeTruthy();

  const db = adminDb();
  const { data: draftMatches } = await db
    .from("matches")
    .select("id, match_number")
    .eq("match_date", DATE2)
    .eq("status", "draft");
  expect(draftMatches?.length).toBeGreaterThan(0);
  const draftId = draftMatches![0].id;
  const draftNumber = draftMatches![0].match_number;

  await managerContext.close();

  // Now, with that draft still sitting there un-proposed, playerA
  // builds an unrelated self-serve match on the SAME date -- this is
  // exactly the sequence that triggered the bug: the self-serve
  // proposal's "next number" lookup used to ignore drafts entirely,
  // so it could compute the same number the draft above already has.
  const { context: playerContext, page: playerPage } = await roleContextAndPage(browser, "playerA");
  const { data: courts } = await db.from("courts").select("id").eq("is_active", true).limit(1);
  expect(courts?.length).toBeGreaterThan(0);
  const { data: playerRows } = await db.from("players").select("id, email");
  const playerBId = playerRows!.find((p: any) => p.email === TEST_USERS.playerB)?.id;

  const proposeRes = await playerPage.request.post("/api/self-serve/propose", {
    data: {
      date: DATE2,
      court_id: courts![0].id,
      target_size: 2,
      available_player_ids: playerBId ? [playerBId] : [],
      other_player_ids: [],
      include_self: true,
    },
  });
  expect(proposeRes.ok()).toBeTruthy();
  const proposeBody = await proposeRes.json();
  const selfServeMatchNumber = proposeBody.matchNumber;

  // The core assertion: the self-serve match must NOT have been
  // handed the draft's number.
  expect(selfServeMatchNumber).not.toEqual(draftNumber);

  await playerContext.close();

  // Now propose the original draft too -- before the fix, THIS is
  // the moment the collision became visible (two different matches,
  // same number, both live on the Match Matrix at once).
  const { context: managerContext2, page: managerPage2 } = await roleContextAndPage(browser, "manager");
  const proposeDraftRes = await managerPage2.request.post("/api/admin/propose-match", {
    data: { match_id: draftId },
  });
  expect(proposeDraftRes.ok()).toBeTruthy();

  const { data: allOnDate } = await db
    .from("matches")
    .select("match_number")
    .eq("match_date", DATE2);
  const numbers = (allOnDate ?? []).map((m: any) => m.match_number);
  const duplicates = numbers.filter((n: number, i: number) => numbers.indexOf(n) !== i);
  expect(duplicates, `duplicate match numbers found: ${duplicates.join(", ")}`).toHaveLength(0);

  await managerContext2.close();
  await clearTestMatchesOn(DATE2);
});
