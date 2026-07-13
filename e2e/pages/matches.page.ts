import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class MatchesPage {
  readonly page: Page;
  // v2 redesign (TASK-094 F2): Recalcular + Sincronizar fused into one "Actualizar"/
  // "Update" button — the old calculateButton/syncButton locators no longer match anything.
  readonly refreshButton: Locator;
  readonly overflowMenuButton: Locator;
  // Progress bar shown while calculateMatches() runs (SavedMatchesView.vue,
  // `v-if="loading && progressTotal > 0"`) — text is dashboard.calculatingMatches.title.
  readonly progressIndicator: Locator;
  readonly tabs: {
    new: Locator;
    sent: Locator;
    saved: Locator;
    deleted: Locator;
  };
  readonly matchCards: Locator;
  readonly noMatchesMessage: Locator;
  readonly blockedUsersButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Covers both the idle label (ACTUALIZAR/UPDATE) and the in-progress label
    // (ACTUALIZANDO…/UPDATING…) — "actualizando" is NOT a substring match of
    // "actualizar" (nor is "updating" of "update"), so both forms must be listed
    // explicitly. On accounts with a large collection (e.g. CI's 59k-card fixture),
    // /saved-matches can mount mid-refresh, so the button may already show the
    // in-progress label on first paint. "sincronizando"/"syncing" are included
    // defensively even though SavedMatchesView currently only ever renders the
    // refresh/refreshing pair (verified via grep) — cheap insurance against a
    // future intermediate sync-only label.
    this.refreshButton = page.locator('button').filter({
      hasText: /actualizar|actualizando|update|updating|sincronizando|syncing/i,
    }).first();
    this.overflowMenuButton = page.getByRole('button', { name: /more options|más opciones|mais opções/i });
    this.progressIndicator = page.getByText(/calculating matches|calculando matches/i);

    this.tabs = {
      new: page.locator('button').filter({ hasText: /new|nuev/i }).first(),
      sent: page.locator('button').filter({ hasText: /sent|enviad/i }).first(),
      saved: page.locator('button').filter({ hasText: /saved|guardad/i }).first(),
      deleted: page.locator('button').filter({ hasText: /deleted|eliminad/i }).first(),
    };

    this.matchCards = page.locator('[data-match-id]');
    this.noMatchesMessage = page.locator('text=/no.*match|no.*coincidencia/i');
    // Bloqueados lives inside the overflow ⋯ menu and has role="menuitem" (not "button")
    // once the menu is open — call openOverflowMenu() first.
    this.blockedUsersButton = page.getByRole('menuitem', { name: /block|bloque/i });
  }

  async goto() {
    await this.page.goto('/saved-matches');
    await ensureLoggedIn(this.page, '/saved-matches');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async switchTab(tab: 'new' | 'sent' | 'saved' | 'deleted') {
    await this.tabs[tab].click();
  }

  async openOverflowMenu() {
    await this.overflowMenuButton.click();
  }

  // True when the refresh flow (sync + recalculate) is already in progress — either the
  // button shows its in-progress label, or the calculate-phase progress bar is visible.
  // Large accounts (CI's 59k-card fixture) can be mid-refresh before the test even starts.
  async isRefreshBusy(): Promise<boolean> {
    const label = (await this.refreshButton.textContent().catch(() => '')) ?? '';
    const busyLabel = /actualizando|updating|sincronizando|syncing/i.test(label);
    const progressShown = await this.progressIndicator.isVisible().catch(() => false);
    return busyLabel || progressShown;
  }

  async openMatchDetail(index = 0) {
    await this.matchCards.nth(index).click();
  }

  matchAction(matchIndex: number, action: string): Locator {
    return this.matchCards.nth(matchIndex).getByRole('button', { name: new RegExp(action, 'i') });
  }

  async saveMatch(index = 0) {
    await this.matchAction(index, 'interest|interesa|save|guardar').click();
  }

  async discardMatch(index = 0) {
    await this.matchAction(index, 'ignore|discard|ignorar|descartar').click();
  }

  async getMatchCount(): Promise<number> {
    return this.matchCards.count();
  }
}
