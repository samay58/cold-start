import { defineConfig, devices } from "@playwright/test";
import sidepanelViteConfig from "./vite.sidepanel.config";

void sidepanelViteConfig;

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
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    viewport: { width: 420, height: 900 }
  },
  projects: [
    {
      name: "sidepanel-ui",
      testMatch: /(sidepanel-(ui|dark)|lens-gallery)\.spec\.ts/
    }
  ],
  webServer: {
    command: "vite --config vite.sidepanel.config.ts --host 127.0.0.1",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: "http://127.0.0.1:5173/sidepanel.html"
  }
});
