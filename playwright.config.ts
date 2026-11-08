import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./tests/e2e/support/env";

/**
 * End-to-end tests (tests/e2e). `pnpm test:e2e` builds the app into .next-e2e,
 * starts it on port 3019 against a fresh `docsku_test` database and runs:
 * 1. "app": independent specs, in parallel;
 * 2. "site": specs that change site-wide settings (languages, widget, security), after "app";
 * 3. "layouts": every docs layout, last.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    launchOptions: { chromiumSandbox: false },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "app", testMatch: /app\/.*\.spec\.ts/, fullyParallel: true, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "site", testMatch: /site\/.*\.spec\.ts/, dependencies: ["app"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "layouts", testMatch: /layouts\.spec\.ts/, dependencies: ["site"], use: { ...devices["Desktop Chrome"] } },
  ],
});
