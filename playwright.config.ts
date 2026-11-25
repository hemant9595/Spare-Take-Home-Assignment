import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // Production is a live third-party site: one retry on CI absorbs network blips,
  // and the retried test is reported as "flaky" so it is never hidden.
  retries: isCI ? 1 : 0,
  // Be a polite client to production.
  workers: isCI ? 2 : 3,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [["github"], ["html", { open: "never" }], ["junit", { outputFile: "reports/e2e-junit.xml" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PH_WEB_URL ?? "https://www.producthunt.com",
    headless: true,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
