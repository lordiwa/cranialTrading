import { test, expect } from '../../fixtures/test';
import { waitForLoginResult } from '../../helpers/auth';

test.describe('Internationalization', () => {
  test('default language is Spanish on login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Spanish text should appear (INICIAR SESIÓN or similar)
    const spanishText = page.locator('text=/INICIAR|Iniciar sesión|Entrar/i');
    await expect(spanishText.first()).toBeVisible({ timeout: 5_000 });
  });

  test('switch language to English → UI updates immediately', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Click the EN button on the login page language selector
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.waitForTimeout(500);

    const englishText = page.locator('text=/SIGN IN|Sign in|LOG IN/i');
    await expect(englishText.first()).toBeVisible();
  });

  test('switch language to Portuguese → UI updates immediately', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'PT', exact: true }).click();
    await page.waitForTimeout(500);

    const portugueseText = page.locator('text=/ENTRAR|Iniciar sessão|ACESSAR/i');
    await expect(portugueseText.first()).toBeVisible();
  });

  test('language persists after page reload', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const englishText = page.locator('text=/SIGN IN|Sign in|LOG IN/i');
    await expect(englishText.first()).toBeVisible();
  });

  test('language persists after login into authenticated pages', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.waitForTimeout(500);

    // Login with fail-fast race pattern
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_A_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_A_PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await waitForLoginResult(page);

    // Dismiss any tour overlay that may appear after login
    const overlay = page.locator('.fixed.inset-0.z-\\[9999\\]');
    const skipButton = page.locator('button').filter({ hasText: /skip|saltar|omitir/i });
    if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (await skipButton.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipButton.first().click({ force: true });
      }
    }

    // Verify English is still active
    const locale = await page.evaluate(() => localStorage.getItem('cranial_locale'));
    expect(locale).toBe('en');
  });
});
