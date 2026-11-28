import { defineConfig } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: "./tests",
  testMatch: "playwright-*.spec.mjs",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765",
    viewport: { width: 1366, height: 768 },
  },
  webServer: {
    command: "python3 -m http.server 8765 --bind 127.0.0.1",
    cwd: repoRoot,
    port: 8765,
    reuseExistingServer: true,
  },
});