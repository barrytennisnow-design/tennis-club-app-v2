# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: captain-roster-visibility.spec.ts >> a captain can see the full Match Matrix roster, not just themselves
- Location: specs\captain-roster-visibility.spec.ts:28:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('PlayerA')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('PlayerA')

```

```yaml
- banner:
  - link "🎾 Club Tennis":
    - /url: /
  - text: Zoom
  - combobox "Zoom":
    - option "50%"
    - option "60%"
    - option "70%"
    - option "80%"
    - option "90%"
    - option "100%" [selected]
    - option "110%"
    - option "125%"
    - option "150%"
  - navigation:
    - link "Log in":
      - /url: /login
- main:
  - heading "Match Matrix" [level=1]
  - text: "Generate:"
  - textbox: 2026-07-20
  - text: to
  - textbox: 2026-08-18
  - button "Generate Match Matrix" [disabled]
  - text: "Show:"
  - textbox: 2026-07-20
  - text: to
  - textbox: 2026-08-18
  - button "Swap two players" [disabled]
  - table:
    - rowgroup:
      - row "First Last Rank Mon 7-20-26 Tue 7-21-26 Wed 7-22-26 Thu 7-23-26 Fri 7-24-26 Sat 7-25-26 Sun 7-26-26 Mon 7-27-26 Tue 7-28-26 Wed 7-29-26 Thu 7-30-26 Fri 7-31-26 Sat 8-1-26 Sun 8-2-26 Mon 8-3-26 Tue 8-4-26 Wed 8-5-26 Thu 8-6-26 Fri 8-7-26 Sat 8-8-26 Sun 8-9-26 Mon 8-10-26 Tue 8-11-26 Wed 8-12-26 Thu 8-13-26 Fri 8-14-26 Sat 8-15-26 Sun 8-16-26 Mon 8-17-26 Tue 8-18-26 Days/wk Days in row Zip Phone Email Notes":
        - columnheader "First"
        - columnheader "Last"
        - columnheader "Rank"
        - columnheader "Mon 7-20-26"
        - columnheader "Tue 7-21-26"
        - columnheader "Wed 7-22-26"
        - columnheader "Thu 7-23-26"
        - columnheader "Fri 7-24-26"
        - columnheader "Sat 7-25-26"
        - columnheader "Sun 7-26-26"
        - columnheader "Mon 7-27-26"
        - columnheader "Tue 7-28-26"
        - columnheader "Wed 7-29-26"
        - columnheader "Thu 7-30-26"
        - columnheader "Fri 7-31-26"
        - columnheader "Sat 8-1-26"
        - columnheader "Sun 8-2-26"
        - columnheader "Mon 8-3-26"
        - columnheader "Tue 8-4-26"
        - columnheader "Wed 8-5-26"
        - columnheader "Thu 8-6-26"
        - columnheader "Fri 8-7-26"
        - columnheader "Sat 8-8-26"
        - columnheader "Sun 8-9-26"
        - columnheader "Mon 8-10-26"
        - columnheader "Tue 8-11-26"
        - columnheader "Wed 8-12-26"
        - columnheader "Thu 8-13-26"
        - columnheader "Fri 8-14-26"
        - columnheader "Sat 8-15-26"
        - columnheader "Sun 8-16-26"
        - columnheader "Mon 8-17-26"
        - columnheader "Tue 8-18-26"
        - columnheader "Days/wk"
        - columnheader "Days in row"
        - columnheader "Zip"
        - columnheader "Phone"
        - columnheader "Email"
        - columnheader "Notes"
    - rowgroup:
      - row "Edit court/time for draft matches, or cancel proposed/confirmed matches":
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell
        - cell "Edit court/time for draft matches, or cancel proposed/confirmed matches"
- alert
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { roleContextAndPage } from "../setup/roles";
  3  | 
  4  | // Regression test for a real bug this session: the base schema only
  5  | // ever gave players table SELECT access to managers and to each
  6  | // player's own row. When captains were added, their UPDATE
  7  | // permissions were correctly extended -- but nobody added a matching
  8  | // SELECT policy, so a captain granted full roster permissions could
  9  | // still only ever see themselves, on the Roster page, the Match
  10 | // Matrix, and the pending-approvals list. Fixed via an is_captain()
  11 | // security-definer function + a broad "captains view all players"
  12 | // SELECT policy (not gated per-permission -- read access is
  13 | // universal for captains, write access stays permission-gated).
  14 | 
  15 | test("a captain can see other players on the Roster page, not just themselves", async ({ browser }) => {
  16 |   const { context, page } = await roleContextAndPage(browser, "captain");
  17 |   await page.goto("/admin/roster");
  18 | 
  19 |   // The fixtures include multiple players named "E2E PlayerX" --
  20 |   // if the RLS bug were back, only the captain's own row ("E2E
  21 |   // Captain") would ever render here.
  22 |   await expect(page.getByText("PlayerA")).toBeVisible({ timeout: 10_000 });
  23 |   await expect(page.getByText("PlayerB")).toBeVisible();
  24 | 
  25 |   await context.close();
  26 | });
  27 | 
  28 | test("a captain can see the full Match Matrix roster, not just themselves", async ({ browser }) => {
  29 |   const { context, page } = await roleContextAndPage(browser, "captain");
  30 |   await page.goto("/admin/grid");
  31 | 
> 32 |   await expect(page.getByText("PlayerA")).toBeVisible({ timeout: 10_000 });
     |                                           ^ Error: expect(locator).toBeVisible() failed
  33 |   await expect(page.getByText("PlayerC")).toBeVisible();
  34 | 
  35 |   await context.close();
  36 | });
  37 | 
```