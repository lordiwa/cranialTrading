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

  /**
   * CardFilterBar's local search input opens an autocomplete dropdown
   * ("In my collection" section — one of the 5 independent search surfaces,
   * see project memory) that only closes on a genuine `document` click
   * outside its wrapper (`handleClickOutside` in CardFilterBar.vue). A
   * Playwright click on an element the still-open dropdown happens to
   * overlap never reaches the target — actionability checks retry instead
   * of firing the event that would dismiss it — so any test that types into
   * `searchInput` and then clicks elsewhere on the toolbar must dismiss the
   * dropdown first.
   *
   * Target is the page's `<h1>` ("My Collection"), NOT a coordinate on
   * `body`: a positional click at the viewport's top-left corner lands on
   * whatever happens to be topmost there — the skip-to-content link and the
   * header logo both live in that region, and the logo is a `<a href=
   * "/inicio">` that would silently navigate the test off /collection. The
   * h1 is inert, language-agnostic (matched by tag, not text), and
   * unambiguously outside CardFilterBar's `wrapperRef`, so it fires the real
   * `document` click-outside listener with nothing else attached to it.
   */
  async dismissSearchDropdown() {
    await this.page.locator('h1').first().click();
  }

  async filterByStatus(status: string) {
    await this.statusFilters.locator('button').filter({ hasText: new RegExp(status, 'i') }).click();
  }

  /**
   * Reads the count badge off a status filter chip ("Collection 3",
   * "AVAILABLE 41089") — driven by `statusCounts` (CollectionView.vue),
   * itself derived from the full `collectionStore.cards` array. Same
   * position-independence rationale as `totalCardCount()`: no grid index
   * involved, so a bulk status change is provable without depending on
   * which card a virtualizer happens to render at position 0 (TASK-147 —
   * an index-0 status-badge check for this exact scenario turned out
   * flaky for the identical reason the identity-based delete check was).
   * `status` matches `filterByStatus`'s regex convention.
   */
  async statusChipCount(status: string): Promise<number> {
    const chip = this.statusFilters.locator('button').filter({ hasText: new RegExp(status, 'i') }).first();
    const text = await chip.textContent();
    const match = (text ?? '').match(/(\d+)/);
    return match ? Number(match[1]) : 0;
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
   * Scans the currently rendered grid (top to bottom, capped at
   * `maxCandidates`) for a card whose `cardIdentity()` matches `identity`
   * exactly, returning its index or `null` if not found. Exists so a test
   * can relocate "the same card" after an operation that moves it out of
   * the active filter (e.g. status change) instead of trusting a fixed grid
   * position — same rationale as `cardIdentity`/`totalCardCount` above:
   * position 0 on this virtualized grid is not a stable pointer, only
   * identity is. Callers still narrow the candidate set first (status
   * filter + name search) since this itself is just a linear scan.
   */
  async findGridIndexByIdentity(identity: string, maxCandidates = 50): Promise<number | null> {
    await this.waitForGridReady();
    const count = Math.min(await this.gridCards.count(), maxCandidates);
    for (let i = 0; i < count; i++) {
      if ((await this.cardIdentity(i)) === identity) return i;
    }
    return null;
  }

  /**
   * Locates a card by identity and clicks it, re-resolving the index on
   * each attempt instead of computing it once and trusting it stays put.
   * Found necessary under `--repeat-each` stress after a filter/search
   * change: the grid can still be settling right after
   * `findGridIndexByIdentity` returns, so a click against a pre-computed
   * index occasionally hit "element is not stable" / "detached from the
   * DOM, retrying" — the row shifted between locate and click. Same
   * virtualized-grid instability this file documents elsewhere, just
   * triggered by search/filter narrowing here instead of background
   * pagination settling.
   */
  async clickCardByIdentity(identity: string, maxAttempts = 3): Promise<number> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const index = await this.findGridIndexByIdentity(identity);
      if (index === null) {
        throw new Error(`clickCardByIdentity: no card matching identity "${identity}" found in the current grid`);
      }
      try {
        await this.gridCards.nth(index).click({ timeout: 5_000 });
        return index;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
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

  // ========== BULK SELECTION (TASK-147) ==========
  // data-testid added to BulkSelectionActionBar.vue's status/delete buttons —
  // their old text-based locators (`/delete all|eliminar/i`) never matched the
  // real "DELETE {count}"/"ELIMINAR {count}" button label, which is exactly
  // why the bulk-delete test's guard silently no-op'd (TASK-147 finding).
  bulkStatusButton(status: 'collection' | 'sale' | 'trade' | 'wishlist'): Locator {
    return this.page.locator(`[data-testid="bulk-status-${status}"]`);
  }

  get bulkDeleteButton(): Locator {
    return this.page.locator('[data-testid="bulk-delete-button"]');
  }

  /**
   * Waits for `data-testid="bulk-selection-bar"` (BulkSelectionActionBar.vue)
   * to fully disappear after a bulk action — it's `v-if="selectionMode"` in
   * CollectionView.vue, and `selectionMode` only flips back to `false` once
   * `batchUpdateCards`/`batchDeleteCards` has actually resolved. A success
   * toast alone isn't sufficient proof the store update has landed: the
   * toast can still be visible (its own 4s auto-dismiss window) from a
   * PRIOR bulk action when a second one fires shortly after, so
   * `waitForToast` immediately resolves against that stale element instead
   * of the new one — this waits on the bar's own loading/selection state
   * instead, which can't be satisfied by a leftover element from an earlier
   * action.
   *
   * The 45s default is measured, not padded: on a `--repeat-each=3` run of
   * the bulk-status test this timed out at 15s on the RESTORE step while the
   * page simultaneously showed the "1 cards changed to Collection" success
   * toast and the already-updated chip count — i.e. the write had landed and
   * only the bar's own teardown was still pending. On a 41k-card collection
   * `batchUpdateCards`'s post-write refresh is slow enough that 15s fails
   * the test for a mutation that demonstrably succeeded. A generous timeout
   * costs nothing on the happy path (the wait resolves as soon as the bar
   * goes) and this is the wrong place to be strict: the falsifiable
   * assertions are the statusChipCount polls, not this teardown wait.
   */
  async waitForBulkActionComplete(timeout = 45_000) {
    await this.page.locator('[data-testid="bulk-selection-bar"]').waitFor({ state: 'hidden', timeout });
  }

  /**
   * The "Collection" nav-link badge (AppHeader.vue) — `collectionStore.cards.length`,
   * the full client-side array (every card doc, not the paginated/windowed
   * grid). Immune to the virtualizer's index-0 instability (TASK-147
   * finding: entering selection mode / any layout shift can change which
   * card the DOM renders at grid index 0, so position-based before/after
   * comparisons for a NO-OP like "cancel" are unreliable). A cancelled bulk
   * delete must leave this total exactly unchanged; a real delete decrements
   * it — that's the falsifiable signal this method exists for.
   */
  async totalCardCount(): Promise<number> {
    const badge = this.page.locator('[data-testid="nav-collection"], [data-tour="nav-collection"]').first().locator('span').last();
    const text = await badge.textContent();
    return Number((text ?? '0').replace(/[^\d]/g, ''));
  }

  /** Get the toggle button for a dual-faced card (↔️) */
  faceToggleButton(index = 0): Locator {
    return this.page.locator('button:has-text("↔")').nth(index);
  }
}
