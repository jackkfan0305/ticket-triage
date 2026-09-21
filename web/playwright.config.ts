import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"]],
  // 0.02 was too loose to be a regression test: at 1440 it is 25,900 pixels,
  // enough that the old table baseline still "matched" the canvas that
  // replaced it, and eight baselines were never rewritten. This absorbs
  // font-rendering jitter and nothing larger.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    // the production build, so the assertions see what ships
    command: `bun run build && bun run start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse. A server left running from an earlier build serves HTML
    // referencing chunk names the current build no longer has; the page 500s
    // on its scripts, never hydrates, and every click silently does nothing.
    // That reads as an application bug and cost two debugging detours before
    // the cause was found. The rebuild takes about two seconds.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
