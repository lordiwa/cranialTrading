import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class ContactsPage {
  readonly page: Page;
  readonly contactCards: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.contactCards = page.locator('[class*="border-silver-30"][class*="rounded"]');
    this.emptyState = page.locator('text=/no.*contact|sin contacto/i');
  }

  async goto() {
    await this.page.goto('/contacts');
    await ensureLoggedIn(this.page, '/contacts');
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for Firebase data to load — either contacts or empty state
    await Promise.race([
      this.contactCards.first().waitFor({ state: 'visible', timeout: 10_000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10_000 }),
    ]).catch(() => {});
  }

  chatButton(contactIndex = 0): Locator {
    return this.contactCards.nth(contactIndex).getByRole('button', { name: /chat|mensaje/i });
  }

  profileLink(contactIndex = 0): Locator {
    return this.contactCards.nth(contactIndex).locator('a[href*="/@"]');
  }

  deleteButton(contactIndex = 0): Locator {
    // Delete button uses 🗑️ emoji
    return this.contactCards.nth(contactIndex).locator('button').filter({ hasText: /🗑|delete|eliminar/i });
  }

  async getContactCount(): Promise<number> {
    return this.contactCards.count();
  }
}
