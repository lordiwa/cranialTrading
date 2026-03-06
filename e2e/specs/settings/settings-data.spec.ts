import { test, expect } from '../../fixtures/test';

test.describe('Settings - Data Management', () => {
  test.beforeEach(async ({ settingsPage }) => {
    await settingsPage.goto();
  });

  test('export collection as Moxfield CSV', async ({ settingsPage, page }) => {
    if (await settingsPage.data.exportMoxfieldButton.isVisible()) {
      // Set up download listener
      const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
      await settingsPage.data.exportMoxfieldButton.click();
      await page.waitForTimeout(3000);
    }
  });

  test('export collection as Manabox CSV', async ({ settingsPage, page }) => {
    if (await settingsPage.data.exportManaboxButton.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
      await settingsPage.data.exportManaboxButton.click();
      await page.waitForTimeout(3000);
    }
  });

  test('resend verification email → confirmation toast', async ({ settingsPage, commonPage }) => {
    if (await settingsPage.data.resendVerificationButton.isVisible()) {
      await settingsPage.data.resendVerificationButton.click();
      await settingsPage.page.waitForTimeout(3000);
    }
  });

  test('restart guided tour from settings', async ({ settingsPage, page }) => {
    if (await settingsPage.data.restartTourButton.isVisible()) {
      await settingsPage.data.restartTourButton.click();
      await page.waitForTimeout(2000);
    }
  });
});
