import { test, expect } from '../../fixtures/test';

test.describe('Settings - Data Management', () => {
  test.beforeEach(async ({ settingsPage }) => {
    await settingsPage.goto();
  });

  // TASK-303: TASK-302 confirmed (by reading SettingsView.vue) that the app has no CSV export
  // feature at all — no Moxfield or Manabox export control exists anywhere in the app today.
  // These two tests used to wrap their only action in `if (await ...isVisible())`, so with the
  // button absent the body never ran and the test still passed GREEN, asserting nothing
  // (WG4-O2-02). `test.fixme()` reports these as pending — not passing, not failing — instead of
  // lying that the flow is covered, and it does not turn the CI `e2e` job (a deploy-dev gate)
  // red for a feature gap that is TASK-302's to resolve. Un-fixme these when TASK-302 ships the
  // export controls, and keep the assertions below unconditional when that happens — they must
  // fail if the button goes missing again.
  test.fixme('export collection as Moxfield CSV', async ({ settingsPage, page }) => {
    // Placeholder body for whoever un-fixmes this — src/views/BinderView.vue's
    // handleExportBinderCsv (downloadAsFile) names the file after the binder, not the format,
    // so this only asserts the download fires and produces a CSV, not a filename convention
    // that TASK-302's implementation hasn't decided yet.
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await settingsPage.data.exportMoxfieldButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test.fixme('export collection as Manabox CSV', async ({ settingsPage, page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await settingsPage.data.exportManaboxButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  // TASK-303: this control genuinely exists today (the app's copy is "SEND EMAIL"/"ENVIAR
  // EMAIL" — see the fixed locator in settings.page.ts) — asserted unconditionally. If the
  // button disappears or is renamed beyond the locator's alternation, this goes RED.
  test('resend verification email → confirmation toast', async ({ settingsPage, commonPage }) => {
    await settingsPage.data.resendVerificationButton.click();
    const toast = await commonPage.waitForToast('success');
    await expect(toast).toBeVisible();
  });

  // TASK-303: asserted unconditionally — the control exists today. Restarting the tour
  // navigates to /collection and (re)opens the driver.js overlay (see useTour.ts,
  // popoverClass: 'cranial-tour-popover'). If the button disappears, this goes RED.
  test('restart guided tour from settings', async ({ settingsPage, page }) => {
    await settingsPage.data.restartTourButton.click();
    await expect(page).toHaveURL(/\/collection/, { timeout: 5000 });
    await expect(page.locator('.cranial-tour-popover')).toBeVisible({ timeout: 5000 });
  });
});
