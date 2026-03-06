import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.resolve(__dirname, '../.auth/user-a.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_A_EMAIL;
  const password = process.env.TEST_USER_A_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD in .env.local'
    );
  }

  await page.goto('/login');

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect away from /login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  // Wait for authenticated app to fully load
  await page.waitForTimeout(5000);

  // Force English locale for consistent selectors
  await page.evaluate(() => {
    localStorage.setItem('cranial_locale', 'en');
  });

  await page.context().storageState({ path: authFile });
});
