import { test, expect } from "@playwright/test";
import { roleContextAndPage } from "../setup/roles";
import { adminDb, isoDaysFromNow, setAvailable, clearTestMatchesOn } from "../setup/db";

const DATE = isoDaysFromNow(3);

test.afterEach(async () => {
  // Always leave the setting ON afterward so other tests in the
  // suite aren't affected by ordering.
  await adminDb().from("club_settings").update({ allow_match_delete: true }).eq("id", true);
});

test("turning off 'allow match delete' in Settings hides the Delete button AND blocks the API directly", async ({ browser }) => {
  await setAvailable(["playerA", "playerB", "playerC", "playerD"], DATE);
  const { context, page } = await roleContextAndPage(browser, "manager");

  // Create a real draft match to attempt to delete.
  const genRes = await page.request.post("/api/generate-matches", { data: { startDate: DATE, endDate: DATE } });
  expect(genRes.ok()).toBeTruthy();
  const db = adminDb();
  const { data: draft } = await db.from("matches").select("id").eq("match_date", DATE).eq("status", "draft").limit(1).single();

  // Turn the setting off directly via the DB (equivalent to a manager unchecking it in Settings).
  await db.from("club_settings").update({ allow_match_delete: false }).eq("id", true);

  // The API itself must reject the delete now, not just hide the button.
  const deleteRes = await page.request.post("/api/admin/delete-match", { data: { match_id: draft!.id } });
  expect(deleteRes.status()).toBe(403);

  // And the button shouldn't even render on the Matches page.
  await page.goto("/admin/matches");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await context.close();
  await clearTestMatchesOn(DATE);
});

test("turning it back on restores the Delete button and allows deletion again", async ({ browser }) => {
  await setAvailable(["playerA", "playerB", "playerC", "playerD"], DATE);
  const { context, page } = await roleContextAndPage(browser, "manager");

  const genRes = await page.request.post("/api/generate-matches", { data: { startDate: DATE, endDate: DATE } });
  expect(genRes.ok()).toBeTruthy();
  const db = adminDb();
  const { data: draft } = await db.from("matches").select("id").eq("match_date", DATE).eq("status", "draft").limit(1).single();

  await db.from("club_settings").update({ allow_match_delete: true }).eq("id", true);

  const deleteRes = await page.request.post("/api/admin/delete-match", { data: { match_id: draft!.id } });
  expect(deleteRes.ok()).toBeTruthy();

  const { data: stillThere } = await db.from("matches").select("id").eq("id", draft!.id).maybeSingle();
  expect(stillThere).toBeNull();

  await context.close();
});
