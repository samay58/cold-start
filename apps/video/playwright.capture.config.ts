import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: false,
  projects: [{ name: "product-capture" }],
  reporter: [["list"]],
  testDir: "./tests",
  testMatch: /extension-states\.capture\.spec\.ts/,
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    colorScheme: "light",
    deviceScaleFactor: 2,
    viewport: { height: 900, width: 420 }
  },
  webServer: {
    command: "vite --config vite.sidepanel.config.ts --host 127.0.0.1",
    cwd: fileURLToPath(new URL("../extension", import.meta.url)),
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: "http://127.0.0.1:5173/sidepanel.html"
  },
  workers: 1
});
