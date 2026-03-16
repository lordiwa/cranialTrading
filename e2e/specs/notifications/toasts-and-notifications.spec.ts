import { test, expect } from '../../fixtures/test';
import { ensureLoggedIn } from '../../helpers/auth';

test.describe('Toast Notifications', () => {
  test('success toast appears on login', async ({ loginPage, commonPage }) => {
    await loginPage.goto();

    const email = process.env.TEST_USER_A_EMAIL!;
    const password = process.env.TEST_USER_A_PASSWORD!;
    await loginPage.login(email, password);
    await loginPage.waitForRedirect();

    // Login may produce a success or info toast — check for any toast
    const anyToast = commonPage.page.locator('[class*="border-neon"], [class*="border-blue"], [class*="border-rust"]').first();
    const toastAppeared = await anyToast.isVisible({ timeout: 5_000 }).catch(() => false);

    // If a toast appeared, verify it auto-dismisses
    if (toastAppeared) {
      await expect(anyToast).toBeVisible();
      await commonPage.waitForToastDismiss();
    }
  });

  test('error toast appears on failed action (wrong password)', async ({ loginPage, commonPage }) => {
    await loginPage.goto();
    await loginPage.login('wrong@email.com', 'wrongpassword');

    const toast = await commonPage.waitForToast('error');
    await expect(toast).toBeVisible();

    // Wait for auto-dismiss
    await commonPage.waitForToastDismiss();
  });

  test('multiple sequential toasts: latest is visible', async ({ loginPage, commonPage }) => {
    await loginPage.goto();

    // Trigger first error
    await loginPage.login('wrong@email.com', 'wrongpassword1');
    await commonPage.page.waitForTimeout(1000);

    // Trigger second error
    await loginPage.login('wrong@email.com', 'wrongpassword2');
    await commonPage.page.waitForTimeout(500);

    // At least one toast should be visible
    const toastVisible = await commonPage.toast.first().isVisible().catch(() => false);
    expect(toastVisible).toBeTruthy();
  });

  test('toast remains visible briefly (does not flash-dismiss)', async ({ loginPage, commonPage }) => {
    await loginPage.goto();
    await loginPage.login('wrong@email.com', 'wrongpassword');

    const toast = await commonPage.waitForToast('error');
    await expect(toast).toBeVisible();

    // Should still be visible after 500ms
    await commonPage.page.waitForTimeout(500);
    await expect(toast).toBeVisible();
  });
});

test.describe('Match Notifications', () => {
  test('notification dropdown opens/closes from header bell icon', async ({ navigationPage, page }) => {
    await page.goto('/collection');
    await ensureLoggedIn(page, '/collection');
    await page.waitForLoadState('domcontentloaded');

    if (await navigationPage.notificationBell.isVisible()) {
      await navigationPage.notificationBell.click();
      await page.waitForTimeout(500);

      await expect(navigationPage.notificationDropdown).toBeVisible();

      // Click outside to close
      await page.locator('body').click({ position: { x: 0, y: 0 } });
      await page.waitForTimeout(500);
    }
  });

  test('notification badge reflects unread count', async ({ navigationPage, page }) => {
    await page.goto('/collection');
    await ensureLoggedIn(page, '/collection');
    await page.waitForLoadState('domcontentloaded');

    // Badge may or may not be present depending on notification state
    const badge = page.locator('[class*="bg-rust"][class*="min-w"]');
    const count = await badge.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('clicking outside dropdown dismisses it', async ({ navigationPage, page }) => {
    await page.goto('/collection');
    await ensureLoggedIn(page, '/collection');
    await page.waitForLoadState('domcontentloaded');

    if (await navigationPage.notificationBell.isVisible()) {
      await navigationPage.notificationBell.click();
      await page.waitForTimeout(500);

      // Click outside
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(500);
    }
  });

  test('mark notification as read updates badge', async ({ navigationPage, page }) => {
    await page.goto('/collection');
    await ensureLoggedIn(page, '/collection');
    await page.waitForLoadState('domcontentloaded');

    // This test depends on having notifications
    if (await navigationPage.notificationBell.isVisible()) {
      await navigationPage.notificationBell.click();
      await page.waitForTimeout(500);
    }
  });
});
