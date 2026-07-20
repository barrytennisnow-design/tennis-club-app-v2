# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\specs\self-serve-group-sizes.spec.ts >> self-serve match building -- exact and overflow invite pools >> 2-player match, invite exactly enough (1)
- Location: tests\specs\self-serve-group-sizes.spec.ts:65:7

# Error details

```
Error: Missing TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY
```

```
Error: Missing TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY
```

# Test source

```ts
  1  | // Direct database access for test setup/teardown, using the service
  2  | // role key (bypasses RLS, same as the app's own admin client). Used
  3  | // to seed availability for "today + N days" (so tests never go stale
  4  | // against a hardcoded date) and to clean up matches/availability
  5  | // created during a test run.
  6  | 
  7  | import { createClient } from "@supabase/supabase-js";
  8  | import { TEST_USERS } from "./global-setup";
  9  | 
  10 | export function adminDb() {
  11 |   const url = process.env.TEST_SUPABASE_URL;
  12 |   const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
> 13 |   if (!url || !key) throw new Error("Missing TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY");
     |                           ^ Error: Missing TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY
  14 |   return createClient(url, key);
  15 | }
  16 | 
  17 | // "Today" from the test runner's perspective, N days out, as
  18 | // YYYY-MM-DD -- matches the app's own date format everywhere.
  19 | export function isoDaysFromNow(days: number): string {
  20 |   const d = new Date();
  21 |   d.setDate(d.getDate() + days);
  22 |   return d.toISOString().slice(0, 10);
  23 | }
  24 | 
  25 | export async function playerIdFor(email: string): Promise<string> {
  26 |   const db = adminDb();
  27 |   const { data, error } = await db.from("players").select("id").eq("email", email).single();
  28 |   if (error || !data) throw new Error(`Test player not found: ${email} -- did you run tests/fixtures/seed_test_players.sql on your TEST project?`);
  29 |   return data.id;
  30 | }
  31 | 
  32 | // Marks the given test-user roles as available on `date`, and clears
  33 | // any leftover match/match_players rows for those players on that
  34 | // date first, so each test starts from a clean slate regardless of
  35 | // what a previous run left behind.
  36 | export async function setAvailable(roles: (keyof typeof TEST_USERS)[], date: string) {
  37 |   const db = adminDb();
  38 |   const emails = roles.map((r) => TEST_USERS[r]);
  39 |   const { data: players } = await db.from("players").select("id, email").in("email", emails);
  40 |   const ids = (players ?? []).map((p) => p.id);
  41 | 
  42 |   // Clear any matches these players are already in on this date, so
  43 |   // a previous test run's leftovers can't make this one flaky.
  44 |   const { data: existingMatchPlayers } = await db
  45 |     .from("match_players")
  46 |     .select("match_id, matches!inner(match_date)")
  47 |     .in("player_id", ids)
  48 |     .eq("matches.match_date", date);
  49 |   const matchIds = [...new Set((existingMatchPlayers ?? []).map((r: any) => r.match_id))];
  50 |   if (matchIds.length > 0) {
  51 |     await db.from("matches").delete().in("id", matchIds); // cascades to match_players
  52 |   }
  53 | 
  54 |   await db.from("availability").delete().in("player_id", ids).eq("date", date);
  55 |   await db.from("availability").insert(
  56 |     ids.map((player_id) => ({ player_id, date, time_slot: "morning" }))
  57 |   );
  58 | }
  59 | 
  60 | // Removes all matches involving any test player on `date`. Call this
  61 | // in an afterEach/afterAll so repeated runs don't accumulate junk
  62 | // matches on your test project.
  63 | export async function clearTestMatchesOn(date: string) {
  64 |   const db = adminDb();
  65 |   const { data: players } = await db.from("players").select("id").ilike("email", "e2e-%@example-test.invalid");
  66 |   const ids = (players ?? []).map((p) => p.id);
  67 |   const { data: rows } = await db
  68 |     .from("match_players")
  69 |     .select("match_id, matches!inner(match_date)")
  70 |     .in("player_id", ids)
  71 |     .eq("matches.match_date", date);
  72 |   const matchIds = [...new Set((rows ?? []).map((r: any) => r.match_id))];
  73 |   if (matchIds.length > 0) {
  74 |     await db.from("matches").delete().in("id", matchIds);
  75 |   }
  76 | }
  77 | 
```