import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

/**
 * Preferences in Cranial Trading are wishlist cards (status='wishlist').
 * They are managed through the collection view's WANTED filter.
 * Adding a "preference" means adding a card with status=wishlist via AddCardModal.
 */
export class PreferencesPage {
  readonly page: Page;
  readonly wantedFilter: Locator;
  readonly addCardButton: Locator;
  readonly fabButton: Locator;
  readonly importButton: Locator;
  readonly statusFilters: Locator;

  // Add Card Modal (same as collection)
  readonly addModal: {
    searchInput: Locator;
    resultCards: Locator;
    quantityInput: Locator;
    // v2 redesign (design→app v2 F5a) replaced the native status <select> with a
    // dot-badge chip group (role="group", each option an aria-pressed button) —
    // see AddCardModal.vue. Target the WISHLIST chip by its accessible name; the
    // word "Wishlist" appears in all 3 locale labels (en/es/pt).
    statusChipWishlist: Locator;
    saveButton: Locator;
    cancelButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    this.statusFilters = page.locator('[data-tour="status-filters"]');
    this.wantedFilter = this.statusFilters.locator('button').filter({ hasText: /wanted|wishlist|deseado/i });
    this.addCardButton = page.locator('[data-tour="add-card-btn"]');
    this.fabButton = page.locator('[data-tour="fab-add-card"]');
    this.importButton = page.getByRole('button', { name: /^import$/i }).first();

    this.addModal = {
      searchInput: page.locator('input[placeholder*="earch"]').last(),
      resultCards: page.locator('.max-h-\\[300px\\] img'),
      quantityInput: page.locator('input[type="number"]').first(),
      // Scoped to the modal overlay — an unscoped "wishlist" name match could also hit
      // the WANTED status-filter button on the page behind the modal.
      statusChipWishlist: page.locator('.fixed.inset-0.z-50').first().getByRole('button', { name: /wishlist/i }),
      saveButton: page.getByRole('button', { name: /^add$|agregar/i }),
      cancelButton: page.getByRole('button', { name: /cancel|close|cerrar/i }),
    };
  }

  async goto() {
    await this.page.goto('/collection');
    await ensureLoggedIn(this.page, '/collection');
    await this.page.waitForLoadState('domcontentloaded');
    // Click the WANTED filter to show wishlist cards
    await this.wantedFilter.click();
    await this.page.waitForTimeout(500);
  }

  async openAddCardModal() {
    if (await this.addCardButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.addCardButton.click();
    } else {
      await this.fabButton.click();
    }
  }

  async addWishlistCard(searchTerm: string) {
    await this.openAddCardModal();
    await this.addModal.searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.addModal.searchInput.fill(searchTerm);
    await this.addModal.searchInput.press('Enter');
    await this.page.waitForTimeout(3000);
    await this.addModal.resultCards.first().click({ force: true });
    // Select "wishlist" status
    await this.page.waitForTimeout(500);
    await this.addModal.statusChipWishlist.click();
    await this.addModal.saveButton.click();
  }
}
