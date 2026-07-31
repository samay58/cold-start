import { defineConfig, devices } from "@playwright/test";

// Computed once, when the CLI loads this config, and inherited by every worker process it forks
// (Playwright workers inherit process.env from the CLI process). The desktop and mobile projects
// each re-evaluate tests/e2e/web-gallery.spec.ts in their own worker, so a timestamp computed
// inline in that module would differ per project; anchoring it here keeps one run's screenshots
// under one shared timestamped directory.
process.env.COLD_START_GALLERY_RUN_TIMESTAMP ??= new Date().toISOString().replace(/[:.]/g, "-");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 1200 } }
    },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 } }
    }
  ],
  webServer: {
    command: "npm run dev",
    cwd: "../..",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
