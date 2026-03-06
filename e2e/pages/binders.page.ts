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
    // Button text is "+ NEW FOLDER" (header) or "+ NEW" (dashed sub-tab)
    // Use the dashed sub-tab which appears after clicking the BINDERS tab
    this.newBinderButton = page.locator('button.border-dashed').filter({ hasText: /\+ NEW|nueva/i });
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
