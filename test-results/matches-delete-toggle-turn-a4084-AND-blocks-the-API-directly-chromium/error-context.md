# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: matches-delete-toggle.spec.ts >> turning off 'allow match delete' in Settings hides the Delete button AND blocks the API directly
- Location: specs\matches-delete-toggle.spec.ts:13:5

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { roleContextAndPage } from "../setup/roles";
  3  | import { adminDb, isoDaysFromNow, setAvailable, clearTestMatchesOn } from "../setup/db";
  4  | 
  5  | const DATE = isoDaysFromNow(3);
  6  | 
  7  | test.afterEach(async () => {
  8  |   // Always leave the setting ON afterward so other tests in the
  9  |   // suite aren't affected by ordering.
  10 |   await adminDb().from("club_settings").update({ allow_match_delete: true }).eq("id", true);
  11 | });
  12 | 
  13 | test("turning off 'allow match delete' in Settings hides the Delete button AND blocks the API directly", async ({ browser }) => {
  14 |   await setAvailable(["playerA", "playerB", "playerC", "playerD"], DATE);
  15 |   const { context, page } = await roleContextAndPage(browser, "manager");
  16 | 
  17 |   // Create a real draft match to attempt to delete.
  18 |   const genRes = await page.request.post("/api/generate-matches", { data: { startDate: DATE, endDate: DATE } });
> 19 |   expect(genRes.ok()).toBeTruthy();
     |                       ^ Error: expect(received).toBeTruthy()
  20 |   const db = adminDb();
  21 |   const { data: draft } = await db.from("matches").select("id").eq("match_date", DATE).eq("status", "draft").limit(1).single();
  22 | 
  23 |   // Turn the setting off directly via the DB (equivalent to a manager unchecking it in Settings).
  24 |   await db.from("club_settings").update({ allow_match_delete: false }).eq("id", true);
  25 | 
  26 |   // The API itself must reject the delete now, not just hide the button.
  27 |   const deleteRes = await page.request.post("/api/admin/delete-match", { data: { match_id: draft!.id } });
  28 |   expect(deleteRes.status()).toBe(403);
  29 | 
  30 |   // And the button shouldn't even render on the Matches page.
  31 |   await page.goto("/admin/matches");
  32 |   await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  33 | 
  34 |   await context.close();
  35 |   await clearTestMatchesOn(DATE);
  36 | });
  37 | 
  38 | test("turning it back on restores the Delete button and allows deletion again", async ({ browser }) => {
  39 |   await setAvailable(["playerA", "playerB", "playerC", "playerD"], DATE);
  40 |   const { context, page } = await roleContextAndPage(browser, "manager");
  41 | 
  42 |   const genRes = await page.request.post("/api/generate-matches", { data: { startDate: DATE, endDate: DATE } });
  43 |   expect(genRes.ok()).toBeTruthy();
  44 |   const db = adminDb();
  45 |   const { data: draft } = await db.from("matches").select("id").eq("match_date", DATE).eq("status", "draft").limit(1).single();
  46 | 
  47 |   await db.from("club_settings").update({ allow_match_delete: true }).eq("id", true);
  48 | 
  49 |   const deleteRes = await page.request.post("/api/admin/delete-match", { data: { match_id: draft!.id } });
  50 |   expect(deleteRes.ok()).toBeTruthy();
  51 | 
  52 |   const { data: stillThere } = await db.from("matches").select("id").eq("id", draft!.id).maybeSingle();
  53 |   expect(stillThere).toBeNull();
  54 | 
  55 |   await context.close();
  56 | });
  57 | 
```