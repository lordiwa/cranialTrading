import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class MarketPage {
  readonly page: Page;
  readonly tabs: {
    movers: Locator;
    staples: Locator;
    portfolio: Locator;
  };

  // Price Movers
  readonly movers: {
    winnersButton: Locator;
    losersButton: Locator;
    formatSelect: Locator;
    priceTypeSelect: Locator;
    table: Locator;
    searchInput: Locator;
    nextPageButton: Locator;
    prevPageButton: Locator;
  };

  // Format Staples
  readonly staples: {
    formatSelect: Locator;
    categoryButtons: Locator;
    table: Locator;
  };

  // Portfolio Impact (tab label: "MY CARDS")
  readonly portfolio: {
    totalDelta: Locator;
    table: Locator;
    sortButtons: Locator;
  };

  constructor(page: Page) {
    this.page = page;

    this.tabs = {
      movers: page.getByRole('button', { name: /movers|movimientos/i }),
      staples: page.getByRole('button', { name: /staples|básicas/i }),
      portfolio: page.getByRole('button', { name: /my cards|mis cartas|cartera/i }),
    };

    this.movers = {
      winnersButton: page.getByRole('button', { name: /winner|ganad/i }),
      losersButton: page.getByRole('button', { name: /loser|perdedor/i }),
      formatSelect: page.locator('select').first(),
      priceTypeSelect: page.locator('select').nth(1),
      table: page.locator('table, [class*="grid"]').first(),
      searchInput: page.locator('input[type="text"]').first(),
      nextPageButton: page.getByRole('button', { name: /next|siguiente|→/i }),
      prevPageButton: page.getByRole('button', { name: /prev|anterior|←/i }),
    };

    this.staples = {
      formatSelect: page.locator('select').first(),
      categoryButtons: page.locator('button').filter({ hasText: /creature|spell|land|overall|criatura|hechizo|tierra/i }),
      table: page.locator('table, [class*="grid"]').first(),
    };

    this.portfolio = {
      totalDelta: page.locator('[class*="text-h"]').first(),
      table: page.locator('table, [class*="grid"]').first(),
      sortButtons: page.getByRole('button', { name: /sort|impact|percent|ordenar/i }),
    };
  }

  async goto() {
    await this.page.goto('/market');
    await ensureLoggedIn(this.page, '/market');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async switchTab(tab: 'movers' | 'staples' | 'portfolio') {
    await this.tabs[tab].click();
    await this.page.waitForTimeout(500);
  }
}
