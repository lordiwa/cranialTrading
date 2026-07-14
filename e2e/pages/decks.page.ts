import { ensureLoggedIn } from '../helpers/auth';
import { type Locator, type Page } from '@playwright/test';

export class DecksPage {
  readonly page: Page;
  readonly deckTab: Locator;
  readonly newDeckButton: Locator;
  readonly importButton: Locator;
  readonly deckList: Locator;

  // Create deck modal
  readonly createModal: {
    nameInput: Locator;
    // v2 redesign — format is now a chip group, not a <select> (design→app v2 F4b,
    // cranial-design/prototype/62-new-deck-*.html). formatChip(label) replaces formatSelect.
    formatChip: (label: string) => Locator;
    createButton: Locator;
    cancelButton: Locator;
  };

  // Import deck modal
  readonly importModal: {
    urlInput: Locator;
    importButton: Locator;
    cancelButton: Locator;
    errorMessage: Locator;
  };

  // Deck editor elements
  readonly editor: {
    mainboard: Locator;
    sideboard: Locator;
    statsPanel: Locator;
    addCardButton: Locator;
    saveButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    this.deckTab = page.locator('[data-tour="deck-tab"]');
    // Button text is "+ NEW DECK" or the dashed "+" sub-tab — .first() avoids strict mode
    this.newDeckButton = page.locator('button').filter({ hasText: /\+ NEW|\+ CREATE DECK|nuevo mazo/i }).first();
    this.importButton = page.getByRole('button', { name: /^import$/i }).first();
    this.deckList = page.locator('button[class*="border"]').filter({ hasText: /\d/ });

    // Create modal - uses id selectors; exact match avoids "+ CREATE DECK" page button
    this.createModal = {
      nameInput: page.locator('#create-deck-name'),
      formatChip: (label: string) => page.locator('.fixed.inset-0.z-50').getByRole('button', { name: label, exact: true }),
      createButton: page.getByRole('button', { name: 'CREATE DECK', exact: true }),
      cancelButton: page.locator('.fixed.inset-0.z-50').getByRole('button', { name: /cancel|cancelar/i }),
    };

    // Import modal — uses textarea#import-deck-input, ANALYZE button
    this.importModal = {
      urlInput: page.locator('#import-deck-input'),
      importButton: page.getByRole('button', { name: /analyze|analizar/i }).first(),
      cancelButton: page.getByRole('button', { name: /cancel|cancelar/i }).first(),
      errorMessage: page.locator('.text-rust, .border-rust'),
    };

    // Editor
    this.editor = {
      mainboard: page.locator('text=/mainboard/i').locator('..'),
      sideboard: page.locator('text=/sideboard/i').locator('..'),
      statsPanel: page.locator('[class*="stat"], [class*="chart"]').first(),
      addCardButton: page.getByRole('button', { name: /add|agregar/i }),
      saveButton: page.getByRole('button', { name: /save|guardar/i }),
    };
  }

  async goto() {
    // Phase 03: DeckView is now a standalone /decks route (previously internal view mode)
    await this.page.goto('/decks');
    await ensureLoggedIn(this.page, '/decks');
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(500);
  }

  async createDeck(name: string, format?: string) {
    await this.newDeckButton.click();
    await this.createModal.nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.createModal.nameInput.fill(name);
    if (format) {
      // Chip labels are capitalized (Vintage, Modern, Commander, Standard, Custom)
      const label = format.charAt(0).toUpperCase() + format.slice(1);
      await this.createModal.formatChip(label).click();
    }
    await this.createModal.createButton.click();
  }

  async deleteDeck(deckName: string) {
    // Click the deck to select it, then find the DELETE button in the details
    const deckBtn = this.page.locator(`text=${deckName}`).first();
    await deckBtn.click();
    await this.page.waitForTimeout(500);
    // The DELETE/ELIMINAR button in the deck details section
    const deleteBtn = this.page.getByRole('button', { name: /^delete$|^eliminar$/i }).first();
    await deleteBtn.click();
  }

  async importFromMoxfield(url: string) {
    await this.importButton.click();
    await this.importModal.urlInput.fill(url);
    await this.importModal.importButton.click();
  }

  async getDeckCount(): Promise<number> {
    const decks = this.page.locator('[class*="deck-card"], [class*="border-silver-30"]');
    return decks.count();
  }
}
