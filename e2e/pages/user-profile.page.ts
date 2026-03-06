import { type Page, type Locator } from '@playwright/test';

export class UserProfilePage {
  readonly page: Page;
  readonly avatar: Locator;
  readonly username: Locator;
  readonly location: Locator;
  readonly contactButton: Locator;
  readonly wishlistLink: Locator;
  readonly searchInput: Locator;
  readonly cardGrid: Locator;
  readonly notFoundMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.avatar = page.locator('img[class*="rounded-full"]');
    this.username = page.locator('h1').first();
    this.location = page.locator('text=📍').first();
    this.contactButton = page.getByRole('button', { name: /contact|contactar/i });
    this.wishlistLink = page.locator('a', { hasText: /wishlist|deseado/i });
    this.searchInput = page.locator('input[type="text"]').first();
    this.cardGrid = page.locator('.grid').first();
    this.notFoundMessage = page.locator('text=/not found|no encontrad/i');
  }

  async goto(username: string) {
    await this.page.goto(`/@${username}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async filterCards(searchTerm: string) {
    await this.searchInput.fill(searchTerm);
  }
}
