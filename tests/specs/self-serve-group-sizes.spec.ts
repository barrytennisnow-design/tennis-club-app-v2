import { test, expect } from "@playwright/test";
import { roleContextAndPage, TEST_USERS, Role } from "../setup/roles";
import { setAvailable, clearTestMatchesOn, isoDaysFromNow } from "../setup/db";

// One fixed date for this whole file, tomorrow relative to whenever
// the suite runs (always within the default 3-day self-serve
// window).
const DATE = isoDaysFromNow(1);
const ALL_ROLES: Role[] = ["playerA", "playerB", "playerC", "playerD", "playerE", "playerF"];

test.beforeAll(async () => {
  await setAvailable(ALL_ROLES, DATE);
});

test.afterAll(async () => {
  await clearTestMatchesOn(DATE);
});

// Builds a match as `proposerRole` needing `targetSize` total players
// (2 or 4), inviting `inviteeRoles` -- which can be fewer, exactly
// enough, or MORE than the match needs (the overflow/first-come pool
// this feature is about) -- and asserts the propose button produces
// a real match instead of doing nothing.
async function buildMatch(
  browser: import("@playwright/test").Browser,
  proposerRole: Role,
  targetSize: 2 | 4,
  inviteeRoles: Role[],
) {
  const { context, page } = await roleContextAndPage(browser, proposerRole);
  await page.goto("/matches/build");

  await expect(page.getByRole("heading", { name: "Build Your Own Match" })).toBeVisible();

  // The date button renders via formatShortDateWithWeekday, e.g.
  // "Fri 7-17-26" -- NOT zero-padded like the ISO date string, so we
  // compute the actual expected format here rather than deriving it
  // from the ISO string directly.
  const [y, m, d] = DATE.split("-").map(Number);
  const expectedLabel = `${m}-${d}-${String(y).slice(-2)}`;
  const dateButton = page.getByRole("button", { name: new RegExp(expectedLabel) });
  await dateButton.click();

  await page.getByRole("button", { name: `${targetSize} total`, exact: true }).click();

  for (const invitee of inviteeRoles) {
    // Fixture names are "E2E PlayerB" / "E2E PlayerC" etc.
    const lastName = invitee.replace("player", "Player").replace(/^\w/, (c) => c.toUpperCase());
    await page.getByRole("button", { name: new RegExp(`E2E.*${lastName}`, "i") }).click();
  }

  await page.locator("select").first().selectOption({ index: 1 }); // first real court option
  await page.getByRole("button", { name: /Propose This Match/ }).click();

  // Success renders a "Match M<number> proposed!" banner. If the
  // submit silently no-ops or gets stuck disabled, neither this NOR
  // any error message appears -- so asserting the success text
  // appears is exactly the right regression check.
  await expect(page.getByText(/Match M\d+ proposed!/)).toBeVisible({ timeout: 10_000 });

  await context.close();
}

test.describe("self-serve match building -- exact and overflow invite pools", () => {
  test("2-player match, invite exactly enough (1)", async ({ browser }) => {
    await buildMatch(browser, "playerA", 2, ["playerB"]);
  });

  test("2-player match, overflow invite pool (2 invited for 1 spot)", async ({ browser }) => {
    await buildMatch(browser, "playerA", 2, ["playerB", "playerC"]);
  });

  test("4-player match, invite exactly enough (3) -- doubles, the one size that always worked", async ({ browser }) => {
    await buildMatch(browser, "playerA", 4, ["playerB", "playerC", "playerD"]);
  });

  test("4-player match, overflow invite pool (4 invited for 3 spots)", async ({ browser }) => {
    await buildMatch(browser, "playerA", 4, ["playerB", "playerC", "playerD", "playerE"]);
  });

  test("4-player match, big overflow pool -- includes a non-opted-in invitee", async ({ browser }) => {
    // playerF is deliberately NOT opted into self-serve in the
    // fixtures -- proving that only the PROPOSER needs the opt-in,
    // not every invitee, which was the point of an earlier fix.
    await buildMatch(browser, "playerA", 4, ["playerB", "playerC", "playerD", "playerE", "playerF"]);
  });
});

test("a player not opted into self-serve cannot see Build a Match at all", async ({ browser }) => {
  const { context, page } = await roleContextAndPage(browser, "playerF");
  await page.goto("/matches");
  await expect(page.getByRole("link", { name: "Build a Match" })).toHaveCount(0);
  await context.close();
});
