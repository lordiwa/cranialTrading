import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class MessagesPage {
  readonly page: Page;
  readonly conversationList: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;

  // Chat modal
  readonly chat: {
    container: Locator;
    messageInput: Locator;
    sendButton: Locator;
    messages: Locator;
    closeButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    this.conversationList = page.locator('[class*="border-silver-30"][class*="cursor-pointer"]');
    this.searchInput = page.locator('input[type="text"]').first();
    this.emptyState = page.locator('text=/no.*conversation|no.*mensaje/i');

    this.chat = {
      container: page.locator('[class*="chat"], [class*="modal"]').last(),
      messageInput: page.locator('input[type="text"], textarea').last(),
      sendButton: page.getByRole('button', { name: /send|enviar|✓/ }).last(),
      messages: page.locator('[class*="rounded"][class*="px-4"][class*="py-2"]'),
      closeButton: page.locator('button:has(svg)').first(),
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
    await this.chat.messageInput.fill(text);
    await this.chat.sendButton.click();
  }

  async filterByUsername(username: string) {
    await this.searchInput.fill(username);
  }

  async getConversationCount(): Promise<number> {
    return this.conversationList.count();
  }
}
