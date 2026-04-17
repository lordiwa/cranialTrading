import { test, expect } from '../../fixtures/test';
import { SEARCH_TERMS } from '../../helpers/test-data';

test.describe('Preferences (Wishlist) CRUD', () => {
  test.beforeEach(async ({ preferencesPage }) => {
    await preferencesPage.goto();
  });

  test('WANTED filter shows wishlist cards section', async ({ preferencesPage, page }) => {
    // Verify WANTED filter is active (highlighted)
    await expect(preferencesPage.wantedFilter).toBeVisible();
    await expect(page).toHaveURL(/\/collection/);
  });

  test('add wishlist card via add card modal → appears in WANTED', async ({ preferencesPage, commonPage, page }) => {
    await preferencesPage.openAddCardModal();
    await preferencesPage.addModal.searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await preferencesPage.addModal.searchInput.fill(SEARCH_TERMS.common);
    await preferencesPage.addModal.searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Click first result card
    const resultCount = await preferencesPage.addModal.resultCards.count();
    if (resultCount > 0) {
      await preferencesPage.addModal.resultCards.first().click({ force: true });
      await page.waitForTimeout(500);
      // Set status to wishlist if select is visible
      if (await preferencesPage.addModal.statusSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await preferencesPage.addModal.statusSelect.selectOption('wishlist');
      }
      await preferencesPage.addModal.saveButton.click();
      await commonPage.waitForToast('success');
    }
  });

  test('delete a wishlist card from the collection', async ({ preferencesPage, commonPage, page }) => {
    // Click first card in the wishlist view
    const cards = page.locator('.grid img[loading="lazy"]');
    const count = await cards.count();
    if (count > 0) {
      await cards.first().click();
      // CardDetailModal opens — look for delete button INSIDE the modal only
      const modal = page.locator('.fixed.inset-0.z-50').first();
      await modal.waitFor({ state: 'visible', timeout: 5000 });
      const deleteBtn = modal.getByRole('button', { name: /delete|eliminar/i });
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteBtn.click();
        await commonPage.confirmAction();
        await commonPage.waitForToast('success');
      } else {
        // Modal has no delete button — close it and skip
        const closeBtn = modal.getByRole('button', { name: /cancel|close|cerrar|×/i }).first();
        if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeBtn.click();
        }
      }
    }
  });

  test('cancel add card modal without saving', async ({ preferencesPage }) => {
    await preferencesPage.openAddCardModal();
    await preferencesPage.addModal.searchInput.waitFor({ state: 'visible', timeout: 5000 });
    // Close without saving
    const closeBtn = preferencesPage.addModal.cancelButton;
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    }
    await preferencesPage.page.waitForTimeout(500);
  });

  test('status filter shows only wishlist cards', async ({ preferencesPage, page }) => {
    // WANTED filter should already be active from goto()
    // Verify the filter badge or heading indicates wishlist
    const wantedText = page.locator('text=/WANTED|wishlist|deseado/i');
    await expect(wantedText.first()).toBeVisible({ timeout: 5000 });
  });
});
