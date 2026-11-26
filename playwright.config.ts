import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/integration',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3417',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run build:memory && node scripts/serve-out.mjs',
    url: 'http://127.0.0.1:3417',
    // Always rebuild: a leftover server would serve a stale build.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
