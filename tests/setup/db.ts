// Direct database access for test setup/teardown, using the service
// role key (bypasses RLS, same as the app's own admin client). Used
// to seed availability for "today + N days" (so tests never go stale
// against a hardcoded date) and to clean up matches/availability
// created during a test run.

import { createClient } from "@supabase/supabase-js";
import { TEST_USERS } from "./global-setup";

export function adminDb() {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// "Today" from the test runner's perspective, N days out, as
// YYYY-MM-DD -- matches the app's own date format everywhere.
export function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function playerIdFor(email: string): Promise<string> {
  const db = adminDb();
  const { data, error } = await db.from("players").select("id").eq("email", email).single();
  if (error || !data) throw new Error(`Test player not found: ${email} -- did you run tests/fixtures/seed_test_players.sql on your TEST project?`);
  return data.id;
}

// Marks the given test-user roles as available on `date`, and clears
// any leftover match/match_players rows for those players on that
// date first, so each test starts from a clean slate regardless of
// what a previous run left behind.
export async function setAvailable(roles: (keyof typeof TEST_USERS)[], date: string) {
  const db = adminDb();
  const emails = roles.map((r) => TEST_USERS[r]);
  const { data: players } = await db.from("players").select("id, email").in("email", emails);
  const ids = (players ?? []).map((p) => p.id);

  // Clear any matches these players are already in on this date, so
  // a previous test run's leftovers can't make this one flaky.
  const { data: existingMatchPlayers } = await db
    .from("match_players")
    .select("match_id, matches!inner(match_date)")
    .in("player_id", ids)
    .eq("matches.match_date", date);
  const matchIds = [...new Set((existingMatchPlayers ?? []).map((r: any) => r.match_id))];
  if (matchIds.length > 0) {
    await db.from("matches").delete().in("id", matchIds); // cascades to match_players
  }

  await db.from("availability").delete().in("player_id", ids).eq("date", date);
  await db.from("availability").insert(
    ids.map((player_id) => ({ player_id, date, time_slot: "morning" }))
  );
}

// Removes all matches involving any test player on `date`. Call this
// in an afterEach/afterAll so repeated runs don't accumulate junk
// matches on your test project.
export async function clearTestMatchesOn(date: string) {
  const db = adminDb();
  const { data: players } = await db.from("players").select("id").ilike("email", "e2e-%@example-test.invalid");
  const ids = (players ?? []).map((p) => p.id);
  const { data: rows } = await db
    .from("match_players")
    .select("match_id, matches!inner(match_date)")
    .in("player_id", ids)
    .eq("matches.match_date", date);
  const matchIds = [...new Set((rows ?? []).map((r: any) => r.match_id))];
  if (matchIds.length > 0) {
    await db.from("matches").delete().in("id", matchIds);
  }
}
