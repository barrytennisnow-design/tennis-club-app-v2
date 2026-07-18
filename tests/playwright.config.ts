import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  fullyParallel: false, // tests share live test data (dates/players) -- safer run serially
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: require.resolve("./setup/global-setup.ts"),
  use: {
    baseURL: process.env.TEST_SITE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  // No per-role "projects" here on purpose: several tests need TWO
  // different logged-in roles open at once (e.g. player A proposes,
  // player B accepts) -- see tests/setup/roles.ts for how each spec
  // opens whichever role(s) it needs as an explicit browser context,
  // rather than relying on one baked-in storageState per Playwright
  // project (which only supports one identity per project).
  projects: [{ name: "chromium" }],
});
