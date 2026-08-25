import { defineConfig, devices } from "@playwright/test";

// 15001-49151: outside the Windows dynamic (ephemeral) port range in both the
// default configuration (49152+) and commonly lowered ones (1024-15000), so
// outbound connections cannot steal these ports mid-run (EADDRINUSE flakes).
const webPort = 23100;
const realtimePort = 24100;
const webUrl = `http://localhost:${webPort}`;
const realtimeUrl = `http://localhost:${realtimePort}`;
const videoMode = process.env.PLAYWRIGHT_VIDEO === "retain-on-failure"
  ? "retain-on-failure"
  : "off";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  expect: {
    timeout: 15_000,
  },
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  timeout: 180_000,
  workers: 2,
  use: {
    baseURL: webUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: videoMode,
  },
  webServer: [
    {
      command:
        "pnpm --filter @ai-arcade/shared build && pnpm --filter realtime-server exec tsx src/index.ts",
      env: {
        CORS_ORIGIN: `http://localhost:${webPort}`,
        DISCONNECT_GRACE_MS: "10000",
        DRAW_DUEL_AI_PROVIDER: "mock",
        REALTIME_PORT: String(realtimePort),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: `${realtimeUrl}/health`,
    },
    {
      command:
        `pnpm --filter @ai-arcade/shared build && pnpm --filter @ai-arcade/qr-code build && pnpm --filter web exec next dev -p ${webPort}`,
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
