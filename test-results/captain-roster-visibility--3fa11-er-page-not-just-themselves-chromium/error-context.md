# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: captain-roster-visibility.spec.ts >> a captain can see other players on the Roster page, not just themselves
- Location: specs\captain-roster-visibility.spec.ts:15:5

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
  - heading "Roster" [level=1]
  - button "Arrange columns"
  - button "all"
  - button "active"
  - button "paused"
  - button "pending"
  - button "declined"
  - table:
    - rowgroup:
      - row "First Last Matches Played Matches Declined Self-Serve Status Rating Email Phone Address City State Zip Days/wk Days in a row Usually available Role Notes Signed up Approved Actions":
        - columnheader "First"
        - columnheader "Last"
        - columnheader "Matches Played"
        - columnheader "Matches Declined"
        - columnheader "Self-Serve"
        - columnheader "Status"
        - columnheader "Rating"
        - columnheader "Email"
        - columnheader "Phone"
        - columnheader "Address"
        - columnheader "City"
        - columnheader "State"
        - columnheader "Zip"
        - columnheader "Days/wk"
        - columnheader "Days in a row"
        - columnheader "Usually available"
        - columnheader "Role"
        - columnheader "Notes"
        - columnheader "Signed up"
        - columnheader "Approved"
        - columnheader "Actions"
    - rowgroup:
      - row "No players match this filter.":
        - cell "No players match this filter."
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
> 22 |   await expect(page.getByText("PlayerA")).toBeVisible({ timeout: 10_000 });
     |                                           ^ Error: expect(locator).toBeVisible() failed
  23 |   await expect(page.getByText("PlayerB")).toBeVisible();
  24 | 
  25 |   await context.close();
  26 | });
  27 | 
  28 | test("a captain can see the full Match Matrix roster, not just themselves", async ({ browser }) => {
  29 |   const { context, page } = await roleContextAndPage(browser, "captain");
  30 |   await page.goto("/admin/grid");
  31 | 
  32 |   await expect(page.getByText("PlayerA")).toBeVisible({ timeout: 10_000 });
  33 |   await expect(page.getByText("PlayerC")).toBeVisible();
  34 | 
  35 |   await context.close();
  36 | });
  37 | 
```