import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class CollectionPage {
  readonly page: Page;
  readonly addCardButton: Locator;
  readonly fabButton: Locator;
  readonly statusFilters: Locator;
  readonly searchInput: Locator;
  readonly viewTypeSelect: Locator;
  readonly cardGrid: Locator;
  readonly selectModeButton: Locator;
  readonly bulkActions: Locator;

  // Add Card Modal elements
  readonly addModal: {
    searchInput: Locator;
    searchButton: Locator;
    resultCards: Locator;
    quantityInput: Locator;
    saveButton: Locator;
    cancelButton: Locator;
  };

  // Edit/Detail Modal elements
  readonly editModal: {
    quantityInput: Locator;
    conditionSelect: Locator;
    saveButton: Locator;
    cancelButton: Locator;
    deleteButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    // Desktop "ADD CARD" button — use text match as data-tour may not be present
    this.addCardButton = page.getByRole('button', { name: /add card|agregar carta/i }).first();
    // Mobile FAB
    this.fabButton = page.locator('[data-tour="fab-add-card"]');
    this.statusFilters = page.locator('[data-tour="status-filters"]');
    // Search input with placeholder "Search by name..."
    this.searchInput = page.locator('input[placeholder*="earch"]').first();
    // View type is a <select> dropdown, not buttons
    this.viewTypeSelect = page.locator('select').filter({ has: page.locator('option[value="visual"]') });
    this.cardGrid = page.locator('.grid').first();
    this.selectModeButton = page.locator('button').filter({ hasText: /select|seleccionar/i });
    this.bulkActions = page.locator('[class*="bulk"]');

    // Add Card Modal — scoped to the z-50 modal overlay
    const addModalContainer = page.locator('.fixed.inset-0.z-50').first();
    this.addModal = {
      searchInput: addModalContainer.locator('input[placeholder*="earch"]').first(),
      searchButton: addModalContainer.getByRole('button', { name: /^search$|^buscar$/i }).first(),
      resultCards: addModalContainer.locator('.max-h-\\[300px\\] img'),
      quantityInput: addModalContainer.locator('input[type="number"]').first(),
      // Condition/status pickers moved to chip/badge button groups in v2 (AddCardModal.vue,
      // design→app v2 F5a) — no spec currently exercises them, so no locator is kept here.
      // Foil checkbox → toggle switch; also unexercised by any spec.
      saveButton: addModalContainer.getByRole('button', { name: /^add$|agregar/i }),
      cancelButton: addModalContainer.getByRole('button', { name: /cancel|close|cerrar/i }),
    };

    // Edit Card Modal — scoped inside z-50 modal overlay to avoid matching grid elements
    const editModalContainer = page.locator('.fixed.inset-0.z-50').last();
    this.editModal = {
      quantityInput: editModalContainer.locator('input[type="number"]').first(),
      conditionSelect: editModalContainer.locator('select').first(),
      // Foil is a hidden native checkbox styled as a switch (CardDetailModal.vue, design→app
      // v2 F5b) — `input[type="checkbox"]` also matches the "publish to profile" checkbox in
      // the same modal, and no spec exercises foil directly, so no locator is kept here.
      saveButton: editModalContainer.getByRole('button', { name: /save|guardar/i }),
      cancelButton: editModalContainer.getByRole('button', { name: /cancel|cancelar/i }),
      deleteButton: editModalContainer.getByRole('button', { name: /delete|eliminar/i }),
    };
  }

  async goto() {
    await this.page.goto('/collection');
    await ensureLoggedIn(this.page, '/collection');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async filterByStatus(status: string) {
    await this.statusFilters.locator('button').filter({ hasText: new RegExp(status, 'i') }).click();
  }

  async openAddCardModal() {
    // Try desktop button first, fall back to FAB
    try {
      await this.addCardButton.waitFor({ state: 'visible', timeout: 8000 });
      await this.addCardButton.click();
    } catch {
      await this.fabButton.click();
    }
  }

  async searchAndSelectCard(name: string) {
    await this.addModal.searchInput.fill(name);
    await this.addModal.searchInput.press('Enter');
    await this.page.waitForTimeout(3000);
    await this.addModal.resultCards.first().click({ force: true });
  }

  async clickCardInGrid(index = 0) {
    // Cards are displayed as images in a grid — click on the card image
    const cards = this.page.locator('.grid img[loading="lazy"]');
    await cards.nth(index).click({ force: true });
  }

  async getCardCount(): Promise<number> {
    const cards = this.page.locator('.grid img[loading="lazy"]');
    return cards.count();
  }

  async switchView(mode: 'visual' | 'texto') {
    await this.viewTypeSelect.selectOption(mode);
  }

  /** Get the toggle button for a dual-faced card (↔️) */
  faceToggleButton(index = 0): Locator {
    return this.page.locator('button:has-text("↔")').nth(index);
  }
}
