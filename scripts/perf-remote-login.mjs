// TASK-166 helper — logs in against a REMOTE deployed URL (e.g. the dev
// site) and saves a Playwright storageState to an explicit output path.
//
// Mirrors e2e/auth.setup.ts's login flow exactly, but targets an arbitrary
// base URL instead of the local webServer, and writes to a caller-chosen
// file instead of the shared e2e/.auth/user.json — so it never clobbers the
// storageState the E2E suite (and other agents) rely on.
//
// Usage:
//   node scripts/perf-remote-login.mjs <baseUrl> <outFile>
//
// Example:
//   node scripts/perf-remote-login.mjs https://cranial-trading-dev.web.app /tmp/dev-deployed-storage.json
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const { chromium } = require('playwright-core');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const baseUrl = process.argv[2];
const outFile = process.argv[3];
if (!baseUrl || !outFile) {
  console.error('Usage: node scripts/perf-remote-login.mjs <baseUrl> <outFile>');
  process.exit(1);
}

const email = process.env.TEST_USER_A_EMAIL;
const password = process.env.TEST_USER_A_PASSWORD;
if (!email || !password) {
  console.error('Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD in .env.local');
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('[data-testid="login-trigger"]').click();
await page.locator('input[type="email"]').fill(email);
await page.locator('input[type="password"]').fill(password);
await page.locator('button[type="submit"]').click();
await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
await page.waitForTimeout(2000);

await ctx.storageState({ path: outFile });
console.log(`Saved storageState to ${outFile}`);
await browser.close();
