import { test, expect } from "@playwright/test";
import { roleContextAndPage } from "../setup/roles";

// Regression test for a real bug this session: the base schema only
// ever gave players table SELECT access to managers and to each
// player's own row. When captains were added, their UPDATE
// permissions were correctly extended -- but nobody added a matching
// SELECT policy, so a captain granted full roster permissions could
// still only ever see themselves, on the Roster page, the Match
// Matrix, and the pending-approvals list. Fixed via an is_captain()
// security-definer function + a broad "captains view all players"
// SELECT policy (not gated per-permission -- read access is
// universal for captains, write access stays permission-gated).

test("a captain can see other players on the Roster page, not just themselves", async ({ browser }) => {
  const { context, page } = await roleContextAndPage(browser, "captain");
  await page.goto("/admin/roster");

  // The fixtures include multiple players named "E2E PlayerX" --
  // if the RLS bug were back, only the captain's own row ("E2E
  // Captain") would ever render here.
  await expect(page.getByText("PlayerA")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("PlayerB")).toBeVisible();

  await context.close();
});

test("a captain can see the full Match Matrix roster, not just themselves", async ({ browser }) => {
  const { context, page } = await roleContextAndPage(browser, "captain");
  await page.goto("/admin/grid");

  await expect(page.getByText("PlayerA")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("PlayerC")).toBeVisible();

  await context.close();
});
