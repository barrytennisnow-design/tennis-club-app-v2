# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: match-numbering.spec.ts >> a cancelled match's number is never reused by a later Generate run
- Location: specs\match-numbering.spec.ts:17:5

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
  5  | // Regression test for a real bug this session: Generate Match Matrix
  6  | // computed the "next match number" by looking only at proposed/
  7  | // confirmed matches, treating cancelled ones as if they'd never
  8  | // happened. Since cancelled matches stay permanently visible on the
  9  | // Matches page under their original number, a later Generate run
  10 | // could hand that same number to a brand new match -- putting two
  11 | // different matches on screen both labeled e.g. "M3". Fixed by
  12 | // including cancelled (not just proposed/confirmed) when computing
  13 | // the next number; only drafts are excluded.
  14 | 
  15 | const DATE = isoDaysFromNow(2);
  16 | 
  17 | test("a cancelled match's number is never reused by a later Generate run", async ({ browser }) => {
  18 |   await setAvailable(["playerA", "playerB", "playerC", "playerD"], DATE);
  19 | 
  20 |   const { context, page } = await roleContextAndPage(browser, "manager");
  21 | 
  22 |   // First generate/propose/cancel cycle -- establishes a cancelled
  23 |   // match with a known, "used" number.
  24 |   let res = await page.request.post("/api/generate-matches", {
  25 |     data: { startDate: DATE, endDate: DATE },
  26 |   });
> 27 |   expect(res.ok()).toBeTruthy();
     |                    ^ Error: expect(received).toBeTruthy()
  28 | 
  29 |   const db = adminDb();
  30 |   const { data: draftMatches } = await db
  31 |     .from("matches")
  32 |     .select("id, match_number")
  33 |     .eq("match_date", DATE)
  34 |     .eq("status", "draft");
  35 |   expect(draftMatches?.length).toBeGreaterThan(0);
  36 |   const firstMatchId = draftMatches![0].id;
  37 |   const firstMatchNumber = draftMatches![0].match_number;
  38 | 
  39 |   // Propose it, then immediately cancel it -- this is the exact
  40 |   // sequence that triggered the bug (a cancelled match's number
  41 |   // needs to stay permanently "spent").
  42 |   let proposeRes = await page.request.post("/api/admin/propose-match", {
  43 |     data: { match_id: firstMatchId },
  44 |   });
  45 |   expect(proposeRes.ok()).toBeTruthy();
  46 | 
  47 |   let cancelRes = await page.request.post("/api/admin/cancel-match", {
  48 |     data: { match_id: firstMatchId },
  49 |   });
  50 |   expect(cancelRes.ok()).toBeTruthy();
  51 | 
  52 |   // Generate again -- the new draft(s) must never reuse firstMatchNumber.
  53 |   res = await page.request.post("/api/generate-matches", {
  54 |     data: { startDate: DATE, endDate: DATE },
  55 |   });
  56 |   expect(res.ok()).toBeTruthy();
  57 | 
  58 |   const { data: allMatchesAfter } = await db
  59 |     .from("matches")
  60 |     .select("id, match_number, status")
  61 |     .eq("match_date", DATE);
  62 | 
  63 |   const numbers = (allMatchesAfter ?? []).map((m: any) => m.match_number);
  64 |   const duplicates = numbers.filter((n: number, i: number) => numbers.indexOf(n) !== i);
  65 |   expect(duplicates, `duplicate match numbers found: ${duplicates.join(", ")}`).toHaveLength(0);
  66 | 
  67 |   const cancelledStillHasItsNumber = (allMatchesAfter ?? []).some(
  68 |     (m: any) => m.id === firstMatchId && m.match_number === firstMatchNumber && m.status === "cancelled"
  69 |   );
  70 |   expect(cancelledStillHasItsNumber).toBeTruthy();
  71 | 
  72 |   await context.close();
  73 |   await clearTestMatchesOn(DATE);
  74 | });
  75 | 
```