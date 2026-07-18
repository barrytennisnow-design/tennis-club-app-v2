// Opens a new browser context already logged in as the given test
// role, using the storageState saved by global-setup.ts. Use this
// whenever a test needs to act as a specific player/captain/manager
// -- including tests that need TWO roles open simultaneously (e.g.
// one player proposes a match, another accepts it).
//
// Always close what you open: `const ctx = await roleContext(browser, "playerA");`
// then `await ctx.close();` in the test (or afterEach) when done.

import { Browser, BrowserContext, Page } from "@playwright/test";
import path from "path";
import { TEST_USERS } from "./global-setup";

export { TEST_USERS };

export type Role = keyof typeof TEST_USERS;

export async function roleContext(browser: Browser, role: Role): Promise<BrowserContext> {
  const storageStatePath = path.join(__dirname, ".auth", `${role}.json`);
  return browser.newContext({ storageState: storageStatePath });
}

export async function roleContextAndPage(browser: Browser, role: Role): Promise<{ context: BrowserContext; page: Page }> {
  const context = await roleContext(browser, role);
  const page = await context.newPage();
  return { context, page };
}
