import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const projects: PlaywrightTestConfig["projects"] = process.env.CI
  ? [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
      { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
    ]
  : [
      { name: "msedge", use: { ...devices["Desktop Chrome"], channel: "msedge" } },
      { name: "mobile-msedge", use: { ...devices["Pixel 5"], channel: "msedge" } },
    ];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects,
});
