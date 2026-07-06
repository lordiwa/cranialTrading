import { type Page, type Locator } from '@playwright/test';

export class NavigationPage {
  readonly page: Page;
  readonly collectionLink: Locator;
  readonly matchesLink: Locator;
  readonly wishlistLink: Locator;
  readonly globalSearch: Locator;
  readonly helpMenu: Locator;
  readonly languageButtons: {
    es: Locator;
    en: Locator;
    pt: Locator;
  };
  readonly notificationBell: Locator;
  readonly notificationDropdown: Locator;
  readonly logoLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.collectionLink = page.locator('[data-testid="nav-collection"], [data-tour="nav-collection"]').first();
    this.matchesLink = page.locator('[data-testid="nav-matches"]');
    this.wishlistLink = page.locator('[data-testid="nav-star"]');
    this.globalSearch = page.locator('[data-tour="nav-search"]');
    this.helpMenu = page.locator('button:has-text("?")');
    this.languageButtons = {
      es: page.getByRole('button', { name: 'ES' }),
      en: page.getByRole('button', { name: 'EN' }),
      pt: page.getByRole('button', { name: 'PT' }),
    };
    this.notificationBell = page.locator('[class*="bell"], [class*="notification"]').first();
    this.notificationDropdown = page.locator('[class*="dropdown"]');
    this.logoLink = page.locator('a[href="/"]').first();
  }

  async navigateTo(section: string) {
    const links: Record<string, Locator> = {
      collection: this.collectionLink,
      matches: this.matchesLink,
      wishlist: this.wishlistLink,
    };
    const link = links[section];
    if (link) await link.click();
  }

  async switchLanguage(lang: 'es' | 'en' | 'pt') {
    await this.helpMenu.click();
    await this.languageButtons[lang].click();
  }
}
