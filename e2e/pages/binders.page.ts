import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class BindersPage {
  readonly page: Page;
  readonly binderTab: Locator;
  readonly newBinderButton: Locator;
  readonly binderList: Locator;

  readonly createModal: {
    nameInput: Locator;
    descriptionInput: Locator;
    createButton: Locator;
    cancelButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    this.binderTab = page.getByRole('button', { name: /binder/i });
    // "+ NEW" button in the binder sub-tabs row (BaseButton variant="filled" with bg-neon)
    this.newBinderButton = page.getByRole('button', { name: /\+ NEW|\+ NUEV/i }).first();
    this.binderList = page.locator('button').filter({ hasText: /binder|carpeta/i });

    this.createModal = {
      nameInput: page.locator('#create-binder-name'),
      descriptionInput: page.locator('#create-binder-description'),
      // The modal CREATE button is inside a BaseModal Teleported to body.
      // Use nth(0) to get the first (modal) CREATE button, not the page one.
      createButton: page.getByRole('button', { name: 'CREATE', exact: true }).first(),
      cancelButton: page.getByRole('button', { name: /cancel|cancelar/i }).first(),
    };
  }

  async goto() {
    await this.page.goto('/collection');
    await ensureLoggedIn(this.page, '/collection');
    await this.page.waitForLoadState('domcontentloaded');
    await this.binderTab.click();
    await this.page.waitForTimeout(500);
  }

  async createBinder(name: string, description?: string) {
    await this.newBinderButton.click();
    await this.createModal.nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.createModal.nameInput.fill(name);
    if (description) {
      await this.createModal.descriptionInput.fill(description);
    }
    await this.createModal.createButton.click();
  }
}
