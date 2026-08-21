import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// E2E_BASE_URL override (nightly cron target: a deployed environment like
// cranial-trading-dev.web.app). When set, Playwright hits that URL directly
// and does NOT spin up a local webServer. Unset = default local-preview
// behavior, unchanged for local runs and the push/deploy CI.
const remoteBaseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e/specs',
  // TASK-254 AC2/AC6. Runs once, after webServer is up (or skipped for
  // E2E_BASE_URL), before the first spec — verifies dist/ was built for the
  // Firebase project this run expects, and aborts the whole run if not.
  globalSetup: './e2e/verify-dist-env.global-setup.ts',
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
    baseURL: remoteBaseURL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    // Setup project — logs in ONCE, saves storageState (localStorage has Firebase auth tokens)
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
      testIgnore: [/auth\/.+\.spec\.ts/, /i18n\/.+\.spec\.ts/, /notifications\/.+\.spec\.ts/],
    },
    // Tests that need clean state (no storageState) — they test login/register/locale/toast flows
    {
      name: 'no-auth-tests',
      testMatch: [/auth\/.+\.spec\.ts/, /i18n\/.+\.spec\.ts/, /notifications\/.+\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: remoteBaseURL
    ? undefined
    : {
        // Local runs default to the DEV project, not production. The previous
        // default ('production') meant every local `npm run e2e` authenticated
        // as the test user against the PRODUCTION Firebase project and ran the
        // mutating specs there — adding and deleting real cards, decks and
        // binders, and changing that account's password. Local and dev are
        // meant to be the same environment; only prod is different. Override
        // with VITE_MODE=production to deliberately exercise the prod bundle.
        command: process.env.CI
          ? 'npx vite preview --port 4173'
          : `npx vite build --mode ${process.env.VITE_MODE || 'development'} && npx vite preview --port 4173`,
        port: 4173,
        // TASK-254 AC1. Explicit, never Playwright's own default. Previously
        // this was `!process.env.CI`: in CI that already evaluated to
        // false (CI always starts on a clean runner with nothing on 4173 —
        // that half was correct and is unchanged here). Locally it evaluated
        // to TRUE, Playwright's own out-of-CI default, which is the root
        // cause of this ticket: a leftover `vite preview` process (measured
        // 2026-08-20: PID 19008, alive for 3 days) let Playwright skip
        // `command` entirely and reuse it, serving whatever dist/ happened
        // to hold on disk — production, in the incident this ticket fixes.
        // Local runs must always rebuild, so this is unconditionally false;
        // if the port is already occupied (an orphan preview, AC5),
        // Playwright's own webServer setup refuses to start rather than
        // silently reusing it — see TASK-254 hand-off for the verified
        // error text and for what someone deliberately running a preview
        // to debug should do instead (kill it, or pass E2E_BASE_URL).
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
