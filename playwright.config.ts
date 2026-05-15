import { defineConfig, devices } from "@playwright/test";

const webPort = 3100;
const realtimePort = 4100;
const webUrl = `http://localhost:${webPort}`;
const realtimeUrl = `http://localhost:${realtimePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: webUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @ai-arcade/shared build && pnpm --filter realtime-server exec tsx src/index.ts",
      env: {
        CORS_ORIGIN: `http://localhost:${webPort}`,
        DISCONNECT_GRACE_MS: "2000",
        REALTIME_PORT: String(realtimePort),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: `${realtimeUrl}/health`,
    },
    {
      command:
        "pnpm --filter @ai-arcade/shared build && pnpm --filter @ai-arcade/qr-code build && pnpm --filter web exec next dev -p 3100",
      env: {
        NEXT_PUBLIC_REALTIME_URL: `http://localhost:${realtimePort}`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 45_000,
      url: webUrl,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
      },
    },
  ],
});
