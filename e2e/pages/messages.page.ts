import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

// TASK-091 — Messages split-pane v2. No modal: the thread renders inline
// (desktop right pane / mobile full-screen overlay), targeted via stable testids.
export class MessagesPage {
  readonly page: Page;
  readonly conversationList: Locator;
  readonly searchInput: Locator;
  // Zero-conversations state (account has no conversations at all) — distinct from the
  // "no results match this filter" text inside the list, which only exists once the
  // split-pane itself renders (i.e. conversations.length > 0).
  readonly emptyState: Locator;
  readonly emptyStateCta: Locator;
  readonly errorRetryButton: Locator;

  readonly thread: {
    messageInput: Locator;
    sendButton: Locator;
    backButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    this.conversationList = page.locator('[data-testid="messages-conv-item"]');
    this.searchInput = page.locator('[data-testid="messages-search-input"]');
    this.emptyState = page.locator('[data-testid="messages-empty-state"]');
    this.emptyStateCta = page.locator('[data-testid="messages-empty-cta"]');
    this.errorRetryButton = page.locator('[data-testid="messages-error-retry"]');

    this.thread = {
      messageInput: page.locator('[data-testid="messages-thread-input"]'),
      sendButton: page.locator('[data-testid="messages-thread-send"]'),
      backButton: page.locator('[data-testid="messages-thread-back"]'),
    };
  }

  async goto() {
    await this.page.goto('/messages');
    await ensureLoggedIn(this.page, '/messages');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async openConversation(index = 0) {
    await this.conversationList.nth(index).click();
  }

  async sendMessage(text: string) {
    await this.thread.messageInput.fill(text);
    await this.thread.sendButton.click();
  }

  async filterByUsername(username: string) {
    await this.searchInput.fill(username);
  }

  async getConversationCount(): Promise<number> {
    return this.conversationList.count();
  }

  /**
   * Waits for Firestore data to settle into one of two mutually exclusive states:
   * the search input (split-pane rendered, at least 1 conversation) or the
   * zero-conversations empty state (account has none — search UI isn't rendered).
   * Returns whether conversations are present, so callers can skip filter-dependent
   * assertions on accounts with no conversations (e.g. a fresh CI test account).
   */
  async hasConversations(): Promise<boolean> {
    await Promise.race([
      this.searchInput.waitFor({ state: 'visible', timeout: 10_000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10_000 }),
    ]).catch(() => {});
    return !(await this.emptyState.isVisible());
  }
}
