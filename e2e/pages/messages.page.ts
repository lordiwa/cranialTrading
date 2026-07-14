import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

// TASK-091 — Messages split-pane v2. No modal: the thread renders inline
// (desktop right pane / mobile full-screen overlay), targeted via stable testids.
export class MessagesPage {
  readonly page: Page;
  readonly conversationList: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
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
    this.emptyState = page.locator('text=/no.*conversation|no.*mensaje/i');
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
}
