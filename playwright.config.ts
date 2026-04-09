import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
    ['list'],
  ],
  outputDir: 'e2e/test-results',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    // Setup project — logs in ONCE, saves storageState + IndexedDB dump
    {
      name: 'setup',
      testDir: './e2e',
      testMatch: /auth\.setup\.ts/,
    },
    // Feature tests — reuse saved auth state, no redundant logins
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: [/auth\/.+\.spec\.ts/, /i18n\/.+\.spec\.ts/],
    },
    // Auth tests — NO storageState (they test login/register flows)
    {
      name: 'auth-tests',
      testMatch: /auth\/.+\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    // i18n tests — NO storageState (they test default locale behavior)
    {
      name: 'i18n-tests',
      testMatch: /i18n\/.+\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'npx vite preview --port 4173'
      : `npx vite build --mode ${process.env.VITE_MODE || 'production'} && npx vite preview --port 4173`,
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
