// Playwright global setup.
//
// This app has NO password login -- only magic-link email auth. To
// avoid needing a real inbox for every test run, we use the Supabase
// service role key to generate a valid magic link server-side (the
// same API the app itself already uses for its own "impersonate" and
// "send access link" features), then have a real browser visit our
// own /auth/callback with that link's token_hash -- exactly what
// clicking the email would do, just without waiting on an actual
// email.
//
// Note: admin-generated links can't use the PKCE (?code=) flow, since
// PKCE requires a code verifier that only exists for a browser-
// initiated login. Supabase instead gives us a token_hash, which we
// verify directly against /auth/callback?token_hash=...&type=... --
// see app/auth/callback/route.ts for the matching server-side half of
// this.
//
// Each resulting logged-in session is saved to disk (Playwright's
// "storageState") so every test file can start already logged in as
// the right role, instead of repeating this login dance per test.
//
// Requires these env vars (see tests/README.md):
//   TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY, TEST_SITE_URL

import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";

export const TEST_USERS = {
  manager: "e2e-manager@example-test.invalid",
  captain: "e2e-captain@example-test.invalid",
  playerA: "e2e-player-a@example-test.invalid",
  playerB: "e2e-player-b@example-test.invalid",
  playerC: "e2e-player-c@example-test.invalid",
  playerD: "e2e-player-d@example-test.invalid",
  playerE: "e2e-player-e@example-test.invalid",
  playerF: "e2e-player-f@example-test.invalid", // not self-serve opted-in
} as const;

export const STORAGE_DIR = path.join(__dirname, ".auth");

async function loginAndSaveState(
  admin: any,
  siteUrl: string,
  email: string,
  outFile: string,
) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/matches` },
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`Could not generate a login link for ${email}: ${error?.message ?? "no hashed_token returned"}`);
  }

  // Hit our own callback route directly with the token_hash, rather
  // than visiting Supabase's action_link -- action_link resolves to
  // the implicit (#access_token=...) flow for admin-generated links,
  // which our app has no reason to handle since real users never hit
  // it. This is the server-verifiable equivalent of clicking the
  // email link.
  const confirmUrl =
    `${siteUrl}/auth/callback?token_hash=${data.properties.hashed_token}` +
    `&type=magiclink&next=/matches`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(confirmUrl);
  await page.waitForURL(`${siteUrl}/matches`, { timeout: 20_000 });

  await context.storageState({ path: outFile });
  await browser.close();
}

export default async function globalSetup(_config: FullConfig) {
  const siteUrl = process.env.TEST_SITE_URL;
  const supabaseUrl = process.env.TEST_SUPABASE_URL;
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!siteUrl || !supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing TEST_SITE_URL, TEST_SUPABASE_URL, or TEST_SUPABASE_SERVICE_ROLE_KEY. " +
      "See tests/README.md -- these must point at your TEST project, never production."
    );
  }
  if (/supabase\.co/.test(supabaseUrl) && process.env.ALLOW_PROD_TEST_RUN !== "yes-i-am-sure") {
    // Not a foolproof check (test projects are also *.supabase.co),
    // but this is a deliberate speed bump: if you ever accidentally
    // point TEST_SUPABASE_URL at your real project's URL, this
    // forces you to explicitly acknowledge it before anything runs.
    console.warn(
      "\n⚠️  TEST_SUPABASE_URL looks like a real Supabase project. " +
      "Double-check this is your dedicated TEST project, not production.\n" +
      "If you're sure, set ALLOW_PROD_TEST_RUN=yes-i-am-sure and re-run.\n"
    );
    if (process.env.ALLOW_PROD_TEST_RUN !== "yes-i-am-sure") process.exit(1);
  }

  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  const admin = createClient(supabaseUrl, serviceRoleKey);

  for (const [role, email] of Object.entries(TEST_USERS)) {
    const outFile = path.join(STORAGE_DIR, `${role}.json`);
    await loginAndSaveState(admin, siteUrl, email, outFile);
    console.log(`✓ logged in as ${role} (${email})`);
  }
}
