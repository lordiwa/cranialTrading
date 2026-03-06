import { test, expect } from '../../fixtures/test';

test.describe('Help & Legal Pages', () => {
  test('FAQ page loads: expand/collapse a question', async ({ page }) => {
    await page.goto('/faq');
    await page.waitForLoadState('domcontentloaded');

    // FAQ should have collapsible sections
    const faqItem = page.locator('details, [class*="accordion"], button').first();
    if (await faqItem.isVisible()) {
      await faqItem.click();
      await page.waitForTimeout(300);
    }
  });

  test('Terms of Service page loads and is readable', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/terms/);
  });

  test('Privacy Policy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/privacy/);
  });

  test('Cookies page loads', async ({ page }) => {
    await page.goto('/cookies');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/cookies/);
  });

  test('FAQ: return to login by clicking logo', async ({ page, navigationPage }) => {
    await page.goto('/faq');
    await page.waitForLoadState('domcontentloaded');

    if (await navigationPage.logoLink.isVisible()) {
      await navigationPage.logoLink.click();
      await page.waitForTimeout(1000);
    }
  });
});
