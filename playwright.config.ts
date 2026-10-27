import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: { baseURL: "http://localhost:8788", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "npm run build:client && wrangler dev --config wrangler.fixture.jsonc --port 8788 --persist-to .wrangler/browser-tests",
    url: "http://localhost:8788",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
