import { defineConfig, devices } from "@playwright/test";

// Bounded real-browser oracle for OWNER Dashboard CSS/UI regression proof.
// Supplements (does NOT replace) the jsdom css:verify oracle. Assumes the
// local runtime is already up: frontend dev server on :5173 (which proxies
// /api → backend :8000). It does not start or modify the backend.
export default defineConfig({
  testDir: "tools/browser",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
