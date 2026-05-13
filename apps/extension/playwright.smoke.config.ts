import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    viewport: { width: 420, height: 900 }
  },
  projects: [
    {
      name: "extension-smoke",
      testMatch: /extension-smoke\.spec\.ts/
    }
  ]
});
