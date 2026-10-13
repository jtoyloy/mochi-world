import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never fall back to DATABASE_URL or read .env for this destructive test fixture.
const database = process.env.TEST_DATABASE_URL;
if (!database) throw new Error("Browser smoke requires a dedicated TEST_DATABASE_URL");
const url = new URL(database);
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/(^|[_-])test($|[_-])/i.test(databaseName)) {
  throw new Error("Browser smoke requires a loopback PostgreSQL database with an explicit test name segment");
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  globalTimeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/browser",
  reporter: [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:8789",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "node server/index.mjs",
    url: "http://127.0.0.1:8789/api/auth/config",
    reuseExistingServer: false,
    timeout: 45_000,
    env: {
      DATABASE_URL: database,
      HOST: "127.0.0.1",
      PORT: "8789",
      DEV_MODE: "true",
      AUTH_REQUIRED: "true",
      MOCK_TOKEN_MODE: "true",
      MOCK_MARKET_DATA: "true",
      MARKET_MODE: "mock",
      BATTLE_WORKERS: "1",
      CHECKPOINT_DIRECTORY: join(tmpdir(), `mochi-browser-${process.pid}`),
    },
  },
});
