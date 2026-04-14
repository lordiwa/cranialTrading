import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class MatchesPage {
  readonly page: Page;
  readonly calculateButton: Locator;
  readonly syncButton: Locator;
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
    this.calculateButton = page.locator('button').filter({ hasText: /calculate|calcular|recalcul/i }).first();
    this.syncButton = page.locator('button').filter({ hasText: /sync|sincronizar/i }).first();

    this.tabs = {
      new: page.locator('button').filter({ hasText: /new|nuev/i }).first(),
      sent: page.locator('button').filter({ hasText: /sent|enviad/i }).first(),
      saved: page.locator('button').filter({ hasText: /saved|guardad/i }).first(),
      deleted: page.locator('button').filter({ hasText: /deleted|eliminad/i }).first(),
    };

    this.matchCards = page.locator('[data-match-id]');
    this.noMatchesMessage = page.locator('text=/no.*match|no.*coincidencia/i');
    this.blockedUsersButton = page.getByRole('button', { name: /block|bloque/i });
  }

  async goto() {
    await this.page.goto('/saved-matches');
    await ensureLoggedIn(this.page, '/saved-matches');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async switchTab(tab: 'new' | 'sent' | 'saved' | 'deleted') {
    await this.tabs[tab].click();
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
