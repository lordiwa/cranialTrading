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

    // Scope modal buttons to the z-50 overlay to avoid clicking page buttons behind the backdrop
    const modal = page.locator('.fixed.inset-0.z-50');
    this.createModal = {
      nameInput: page.locator('#create-binder-name'),
      descriptionInput: page.locator('#create-binder-description'),
      createButton: modal.getByRole('button', { name: /^CREATE$|^CREAR$/i }),
      cancelButton: modal.getByRole('button', { name: /cancel|cancelar/i }),
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
