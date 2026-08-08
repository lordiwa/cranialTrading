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
  // Anchored to data-testid="collection-card" (CollectionGridCardCompact.vue /
  // CollectionGridCardFull.vue) — not `.grid img[loading="lazy"]`. The grid is
  // window-virtualized (useVirtualGrid): on a large collection (40k+ cards) the
  // real card rows can take well past 8s to mount after navigation, so
  // waitForGridReady() waits for the first card to actually appear before
  // clickCardInGrid/getCardCount read it, instead of assuming a fixed settle
  // time (TASK-145).
  readonly gridCards: Locator;

  // Add Card Modal elements
  readonly addModal: {
    searchInput: Locator;
    searchButton: Locator;
    resultCards: Locator;
    quantityInput: Locator;
    saveButton: Locator;
    cancelButton: Locator;
  };

  // Edit/Detail Modal elements. No quantityInput/deleteButton here (TASK-146):
  // CardDetailModal.vue's v2 redesign has neither. Quantity is a per-status
  // +/-  stepper (statusRow()/statusQuantity() below), and delete was moved
  // OUT of the modal entirely onto the grid card itself (deleteButtonInGrid()) —
  // a locator here for either would silently match nothing, which is exactly
  // why the pre-TASK-146 edit/delete/cancel tests never executed their real
  // assertions despite passing green.
  readonly editModal: {
    conditionSelect: Locator;
    saveButton: Locator;
    cancelButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    // Desktop "ADD CARD" button — use text match as data-tour may not be present
    this.addCardButton = page.getByRole('button', { name: /add card|agregar carta/i }).first();
    // Mobile FAB
    this.fabButton = page.locator('[data-tour="fab-add-card"]');
    this.statusFilters = page.locator('[data-tour="status-filters"]');
    // The in-collection filter input (CardFilterBar.vue,
    // collection.filters.searchPlaceholder = "Search by name…"). NOT .first()
    // on a generic `[placeholder*="earch"]` (TASK-146): the header's global
    // GlobalSearch box ("Search cards…") renders before this one in the DOM,
    // so `.first()` silently grabbed THAT input instead — typing into it never
    // touched this page's filterQuery/grid at all. Matched by placeholder text
    // to stay unambiguous regardless of DOM order.
    this.searchInput = page.getByPlaceholder(/search by name/i);
    // View type is a <select> dropdown, not buttons
    this.viewTypeSelect = page.locator('select').filter({ has: page.locator('option[value="visual"]') });
    this.cardGrid = page.locator('.grid').first();
    this.selectModeButton = page.locator('button').filter({ hasText: /select|seleccionar/i });
    this.bulkActions = page.locator('[class*="bulk"]');
    this.gridCards = page.locator('[data-testid="collection-card"]');

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
      conditionSelect: editModalContainer.locator('select').first(),
      // Foil is a hidden native checkbox styled as a switch (CardDetailModal.vue, design→app
      // v2 F5b) — `input[type="checkbox"]` also matches the "publish to profile" checkbox in
      // the same modal, and no spec exercises foil directly, so no locator is kept here.
      saveButton: editModalContainer.getByRole('button', { name: /save|guardar/i }),
      cancelButton: editModalContainer.getByRole('button', { name: /cancel|cancelar/i }),
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

  // No .catch() here on purpose (TASK-145 rebote 1 / HIGH-1a): a grid that
  // never mounts must fail the test, not silently resolve into a 0 count
  // that then reads as a legitimate "empty collection" skip downstream.
  //
  // Also waits for the "filtering" anti-flicker overlay (TASK-117,
  // showFilterLoader/`collection-filter-loader`, z-10 above the grid) to
  // clear. On this collection's slow initial queryPage() the first real card
  // can mount a beat before paginationMeta.loading actually flips off, so a
  // click right after the card becomes visible can retry against the
  // decorative overlay intercepting pointer events until actionTimeout
  // (10s) — not the real locator, but a real blocker (TASK-146). Both waits
  // share one timeout budget (Promise.all), not stacked sequentially.
  async waitForGridReady(timeout = 60_000) {
    await Promise.all([
      this.gridCards.first().waitFor({ state: 'visible', timeout }),
      this.page.locator('[data-testid="collection-filter-loader"]').waitFor({ state: 'hidden', timeout }),
    ]);
  }

  async clickCardInGrid(index = 0) {
    await this.waitForGridReady();
    await this.gridCards.nth(index).click();
  }

  async getCardCount(): Promise<number> {
    await this.waitForGridReady();
    return this.gridCards.count();
  }

  async switchView(mode: 'visual' | 'texto') {
    await this.viewTypeSelect.selectOption(mode);
  }

  // Identity helpers (TASK-146) — a grid COUNT is not a reliable delete/cancel
  // signal on a 41k-card window-virtualized collection: the virtualizer
  // refills the visible window right behind a removed row, so a poll on
  // getCardCount() can pass by catching a transient mid-remount state rather
  // than by observing a real, durable change. What IS durable is which card
  // occupies a given slot — so these compare identity (name + edition/
  // condition text) at an index before vs. after the operation, per the
  // reviewer's guidance on TASK-145's rebote.
  //
  // gridCardRoot(index) is the parent of the data-testid="collection-card"
  // element: that testid sits on the card's image container only
  // (CollectionGridCardFull.vue), not the whole card block, so the name/
  // edition paragraphs that render as its siblings (below the image) are
  // reached through the parent, not the testid element itself.
  private gridCardRoot(index = 0): Locator {
    return this.gridCards.nth(index).locator('xpath=..');
  }

  /**
   * Trimmed card name text at a grid index (first <p> under the card root).
   * Short internal timeout + catch: this is read inside `expect.poll(() =>
   * collectionPage.cardName(0))` callers (e.g. waiting for a just-added
   * fixture card to reach the server card_index) where the grid can be
   * legitimately empty for several poll cycles — the default 10s
   * actionTimeout per attempt would starve the poll of retries within its
   * own budget. Returning '' is an honest "nothing there yet" signal, not a
   * masked failure: the poll's own assertion (and its timeout) is what
   * decides pass/fail, same as TASK-145's rebote principle — nothing here
   * downgrades a real failure into a false pass.
   */
  async cardName(index = 0): Promise<string> {
    const text = await this.gridCardRoot(index).locator('p').first()
      .textContent({ timeout: 2_000 }).catch(() => null);
    return (text ?? '').trim();
  }

  /**
   * "name :: edition - condition" at a grid index — distinguishes different
   * printings of the same card name (the CI collection has 25+ "Lightning
   * Bolt" entries across different editions), so it's a safer before/after
   * fingerprint than the name alone for the same slot.
   */
  async cardIdentity(index = 0): Promise<string> {
    const paragraphs = this.gridCardRoot(index).locator('p');
    const name = (await paragraphs.nth(0).textContent({ timeout: 2_000 }).catch(() => null))?.trim() ?? '';
    const edition = (await paragraphs.nth(1).textContent({ timeout: 2_000 }).catch(() => null))?.trim() ?? '';
    return `${name} :: ${edition}`;
  }

  /**
   * The "ELIMINAR"/"DELETE" button rendered directly on a grid card
   * (CollectionGridCardFull.vue "Row 8") — NOT inside the detail modal.
   * CardDetailModal.vue's v2 redesign has no delete affordance of its own;
   * the grid button, swipe-left, and the card's context menu are the only
   * paths to collectionStore.deleteCard(). Confirm/cancel go through the
   * separate z-[60] ConfirmModal (commonPage.confirmAction/cancelAction),
   * not the z-50 detail modal.
   */
  deleteButtonInGrid(index = 0): Locator {
    return this.gridCardRoot(index).getByRole('button', { name: /delete|eliminar/i });
  }

  // Per-status quantity stepper inside CardDetailModal.vue's "Distribution"
  // card (collection/sale/trade/wishlist), each row tagged data-testid=
  // "qty-row-<status>". Layout per row: [dot span, label span] then
  // [minus button, quantity span, plus button] — so `span` last() is the
  // quantity, `button` first()/last() are minus/plus.
  private statusRow(status: 'collection' | 'sale' | 'trade' | 'wishlist'): Locator {
    return this.page.locator(`[data-testid="qty-row-${status}"]`);
  }

  /**
   * Waits for the Distribution card to actually be populated. The detail
   * modal container becomes visible before its content does — prints/price
   * data load asynchronously — so reading a status row right after
   * `modal.waitFor({state:'visible'})` can race a still-empty modal. The
   * "collection" row always renders (unlike sale/trade/wishlist, which are
   * only meaningfully populated, not conditionally rendered) so it's a safe
   * readiness signal.
   */
  async waitForDetailModalReady(timeout = 15_000) {
    await this.statusRow('collection').waitFor({ state: 'visible', timeout });
  }

  async statusQuantity(status: 'collection' | 'sale' | 'trade' | 'wishlist'): Promise<number> {
    const text = await this.statusRow(status).locator('span').last().textContent();
    return Number((text ?? '0').trim());
  }

  async incrementStatus(status: 'collection' | 'sale' | 'trade' | 'wishlist') {
    await this.statusRow(status).getByRole('button').last().click();
  }

  /** Get the toggle button for a dual-faced card (↔️) */
  faceToggleButton(index = 0): Locator {
    return this.page.locator('button:has-text("↔")').nth(index);
  }
}
