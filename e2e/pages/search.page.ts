import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class SearchPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly autocompleteDropdown: Locator;
  readonly resultsGrid: Locator;
  readonly resultCards: Locator;
  readonly noResultsMessage: Locator;
  readonly advancedFiltersButton: Locator;
  readonly filterPanel: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Target the search page's own input, not the GlobalSearch header input
    this.searchInput = page.locator('main input[type="text"]').first();
    // Exact match to avoid matching "Advanced search →" in header
    this.searchButton = page.locator('main').getByRole('button', { name: /^search$|^buscar$/i });
    this.autocompleteDropdown = page.locator('.absolute.z-20, [class*="autocomplete"], [class*="suggestion"]');
    this.resultsGrid = page.locator('.grid').first();
    // design→app v2 F6 (TASK-101): SearchResultCard root carries data-testid instead of a
    // styling-coupled class selector (cursor-pointer/group class names changed in the reskin)
    this.resultCards = page.locator('[data-testid="search-result-card"]');
    this.noResultsMessage = page.locator('text=/no.*cards.*found|no.*result|no se encontraron|no.*filters/i');
    // "MORE" button on the search page opens the advanced filters modal
    this.advancedFiltersButton = page.locator('main').getByRole('button', { name: /more|advanced|avanzad|más/i }).first();
    this.filterPanel = page.locator('[role="dialog"], .fixed.inset-0').last();
    this.backButton = page.getByRole('button', { name: /back|volver/i });
  }

  async goto(query?: string) {
    // TASK-111: optional query simulates the header search deep-link (/search?q=...)
    const dest = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
    await this.page.goto(dest);
    await ensureLoggedIn(this.page, dest);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    // Dismiss autocomplete dropdown, then click SEARCH
    await this.searchInput.press('Escape');
    await this.page.waitForTimeout(300);
    await this.searchButton.click();
    // Wait for results to render OR no-results message.
    // Scryfall is ~3s locally but 10-15s on GitHub CI runners; 25s tolerates the slower path.
    await Promise.race([
      this.resultCards.first().waitFor({ state: 'visible', timeout: 25_000 }),
      this.noResultsMessage.waitFor({ state: 'visible', timeout: 25_000 }),
    ]).catch(() => {});
  }

  async typeForAutocomplete(query: string) {
    await this.searchInput.fill('');
    for (const char of query) {
      await this.searchInput.press(char);
      await this.page.waitForTimeout(100);
    }
  }

  async selectAutocomplete(index = 0) {
    // design→app v2 F6 (TASK-101): FilterPanel's suggestion items are now <button>
    // elements (a11y fix) instead of <div>; keep div/li too for other autocomplete surfaces.
    await this.autocompleteDropdown.locator('button, div, li').nth(index).click();
  }

  async clickResultCard(index = 0) {
    // Click the ADD button on the result card to open add-to-collection modal
    const addBtn = this.resultCards.nth(index).getByRole('button', { name: /add|agregar/i });
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.click();
    } else {
      await this.resultCards.nth(index).click();
    }
  }

  async getResultCount(): Promise<number> {
    return this.resultCards.count();
  }

  ownedBadge(cardIndex = 0): Locator {
    return this.resultCards.nth(cardIndex).locator('[data-testid="owned-badge"]');
  }
}
