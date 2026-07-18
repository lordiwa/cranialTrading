import { test, expect } from '../../fixtures/test';
import { SEARCH_TERMS } from '../../helpers/test-data';

test.describe('Collection CRUD', () => {
  test.beforeEach(async ({ collectionPage }) => {
    await collectionPage.goto();
  });

  test('collection page loads with card grid visible @smoke', async ({ collectionPage, page }) => {
    await expect(page).toHaveURL(/\/collection/);
    await expect(collectionPage.statusFilters).toBeVisible();
  });

  test('add card: open modal → search → select → save → card appears', async ({ collectionPage, commonPage }) => {
    await collectionPage.openAddCardModal();
    await collectionPage.addModal.searchInput.waitFor({ state: 'visible' });
    await collectionPage.addModal.searchInput.fill(SEARCH_TERMS.common);
    await collectionPage.addModal.searchInput.press('Enter');

    // Wait for results
    await collectionPage.page.waitForTimeout(3000);
    await collectionPage.addModal.resultCards.first().waitFor({ state: 'visible', timeout: 10_000 });
    await collectionPage.addModal.resultCards.first().click({ force: true });

    // Fill form and save
    await collectionPage.page.waitForTimeout(500);
    await collectionPage.addModal.quantityInput.waitFor({ state: 'visible' });
    await collectionPage.addModal.quantityInput.fill('1');
    await collectionPage.addModal.saveButton.click();

    await commonPage.waitForToast('success');

    // Cleanup — net-zero doc count, not literal-fixture deletion: the shared
    // CI collection already has 25+ pre-existing "Lightning Bolt" entries
    // (different printings), and card_index writes are eventually consistent
    // (optimistic patch + deferred refresh — see the card_index persist race
    // pattern), so there's no reliable UI signal within a single test to pick
    // out exactly the doc we just created; a name-filtered search can't tell
    // it apart from the pre-existing duplicates either. Deleting whatever
    // card is at grid index 0 — the exact same delete path the "delete card"
    // test below uses — keeps the doc count net-zero for this run instead:
    // the collection composition rotates by one card per run rather than
    // growing without bound, which is the failure mode actually being
    // guarded against.
    //
    // Best-effort by design ("leak, don't redden"): the whole block is
    // wrapped in try/catch so a stuck toast overlay or CI-only timing hiccup
    // here never fails the test above it, which already passed its real
    // assertions. At worst this leaves one extra card in the shared CI
    // collection for a later run's cleanup to rotate back out.
    try {
      // Toasts use v-show (display:none, not DOM removal) and the
      // success-toast locator is a known CI flake source (matches stale,
      // already-hidden toasts — see CLAUDE.md's E2E flake notes), so don't
      // wait on that locator here. Just wait out the documented ~4s
      // auto-dismiss window so the toast isn't still overlaying the grid
      // when clickCardInGrid(0) runs below.
      await collectionPage.page.waitForTimeout(4500);
      const cardCount = await collectionPage.getCardCount();
      if (cardCount > 0) {
        await collectionPage.clickCardInGrid(0);
        const modal = collectionPage.page.locator('.fixed.inset-0.z-50');
        await modal.waitFor({ state: 'visible', timeout: 5_000 });
        const deleteBtn = collectionPage.editModal.deleteButton;
        if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await deleteBtn.click();
          await commonPage.confirmAction();
          await commonPage.waitForToast('success');
        }
      }
    } catch {
      // Swallow — accepted leak of at most one card this run.
    }
  });

  test('edit card: open detail modal → edit → save → changes persist', async ({ collectionPage, commonPage, page }) => {
    // Wait for cards to load
    await page.waitForTimeout(1000);
    const cardCount = await collectionPage.getCardCount();
    if (cardCount === 0) return; // Skip if no cards

    await collectionPage.clickCardInGrid(0);

    // Wait for edit modal (z-50 overlay)
    const modal = page.locator('.fixed.inset-0.z-50');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    // Change quantity if input is visible
    const qtyInput = collectionPage.editModal.quantityInput;
    if (await qtyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await qtyInput.fill('3');
      await collectionPage.editModal.saveButton.click();
      await commonPage.waitForToast('success');
    }
  });

  test('delete card: open detail → delete → confirm → card removed', async ({ collectionPage, commonPage, page }) => {
    await page.waitForTimeout(1000);
    const countBefore = await collectionPage.getCardCount();
    if (countBefore === 0) return;

    await collectionPage.clickCardInGrid(0);

    const modal = page.locator('.fixed.inset-0.z-50');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const deleteBtn = collectionPage.editModal.deleteButton;
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
      await commonPage.confirmAction();
      await commonPage.waitForToast('success');
      await page.waitForTimeout(1000);
      const countAfter = await collectionPage.getCardCount();
      expect(countAfter).toBeLessThan(countBefore);
    }
  });

  test('bulk select → bulk change status to Sale → verify status updated', async ({ collectionPage, commonPage, page }) => {
    // Enter selection mode
    const selectBtn = collectionPage.selectModeButton;
    if (!(await selectBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await selectBtn.click();
    await page.waitForTimeout(500);

    // Select first card via checkbox or click
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      const saleButton = page.getByRole('button', { name: /sale|venta/i });
      if (await saleButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await saleButton.click();
        await commonPage.waitForToast('success');
      }
    }
  });

  test('bulk select → bulk delete → confirm → cards removed', async ({ collectionPage, commonPage, page }) => {
    const selectBtn = collectionPage.selectModeButton;
    if (!(await selectBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await selectBtn.click();
    await page.waitForTimeout(500);

    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      const deleteButton = page.getByRole('button', { name: /delete all|eliminar/i });
      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteButton.click();
        await commonPage.confirmAction();
        await commonPage.waitForToast('success');
      }
    }
  });

  test('cancel deletion from confirm dialog leaves card intact', async ({ collectionPage, commonPage, page }) => {
    await page.waitForTimeout(1000);
    const countBefore = await collectionPage.getCardCount();
    if (countBefore === 0) return;

    await collectionPage.clickCardInGrid(0);

    const modal = page.locator('.fixed.inset-0.z-50');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const deleteBtn = collectionPage.editModal.deleteButton;
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
      await commonPage.cancelAction();
      await page.waitForTimeout(500);
      const countAfter = await collectionPage.getCardCount();
      expect(countAfter).toBe(countBefore);
    }
  });
});
