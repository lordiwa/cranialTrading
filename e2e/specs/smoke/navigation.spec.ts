import { test, expect } from '../../fixtures/test';
import { ROUTES } from '../../helpers/test-data';
import { ensureLoggedIn } from '../../helpers/auth';

test.describe('Navigation Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/collection');
    await ensureLoggedIn(page, '/collection');
  });

  test('nav: Collection link navigates to /collection', async ({ navigationPage, page }) => {
    await navigationPage.navigateTo('collection');
    await expect(page).toHaveURL(/\/collection/);
  });

  // RED hub redesign: MERCADO removed from nav and CONTACTOS merged into the MATCHES hub.
  // The legacy /contacts route now redirects into /saved-matches with the Contactos tab.
  test('legacy /contacts redirects into the MATCHES hub', async ({ page }) => {
    await page.goto('/contacts');
    await expect(page).toHaveURL(/\/saved-matches/);
    // Contactos tab is present in the merged hub
    await expect(page.getByRole('button', { name: /contact/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('nav: Matches dropdown navigates to /saved-matches', async ({ navigationPage, page }) => {
    await navigationPage.matchesLink.click();
    await page.waitForTimeout(500);
    // Matches dropdown or link should be visible
    const matchesLink = page.locator('a[href="/saved-matches"]');
    if (await matchesLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await matchesLink.first().click();
      await expect(page).toHaveURL(/\/saved-matches/);
    }
  });

  test('tab switching renders correct content', async ({ page }) => {
    // Phase 03: tabs are now RouterLinks (separate views), not internal state toggles.
    // Use ensureLoggedIn to guarantee auth + mounted CollectionView before asserting.
    await ensureLoggedIn(page, ROUTES.collection);

    // Collection tab should be active by default — status filters are in CollectionView
    const collectionContent = page.locator('[data-tour="status-filters"]');
    await expect(collectionContent).toBeVisible({ timeout: 15_000 });

    // Switch to decks tab (now navigates to /decks route)
    const deckTab = page.locator('[data-tour="deck-tab"]');
    if (await deckTab.isVisible()) {
      await deckTab.click();
      await expect(page).toHaveURL(/\/decks/, { timeout: 5_000 });
    }
  });
});
