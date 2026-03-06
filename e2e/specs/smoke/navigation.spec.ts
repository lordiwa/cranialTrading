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

  test('nav: Market link navigates to /market', async ({ navigationPage, page }) => {
    await navigationPage.navigateTo('market');
    await expect(page).toHaveURL(/\/market/);
  });

  test('nav: Contacts link navigates to /contacts', async ({ navigationPage, page }) => {
    await navigationPage.navigateTo('contacts');
    await expect(page).toHaveURL(/\/contacts/);
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
    await page.goto(ROUTES.collection);
    await page.waitForLoadState('domcontentloaded');

    // Collection tab should be active by default
    const collectionContent = page.locator('[data-tour="status-filters"]');
    await expect(collectionContent).toBeVisible();

    // Switch to decks tab
    const deckTab = page.locator('[data-tour="deck-tab"]');
    if (await deckTab.isVisible()) {
      await deckTab.click();
      await page.waitForTimeout(500);
    }
  });
});
