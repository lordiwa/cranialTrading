import { type Page, type Locator } from '@playwright/test';

export class CommonPage {
  readonly page: Page;
  readonly toast: Locator;
  readonly successToast: Locator;
  readonly errorToast: Locator;
  readonly infoToast: Locator;

  // Confirm dialog (ConfirmModal uses z-[60])
  readonly confirmDialog: {
    container: Locator;
    confirmButton: Locator;
    cancelButton: Locator;
    message: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    this.toast = page.locator('[class*="fixed"][class*="bottom-4"][class*="right-4"] > div');
    this.successToast = page.locator('.border-neon.text-neon').last();
    this.errorToast = page.locator('.border-rust.text-rust').last();
    this.infoToast = page.locator('.border-silver-50.text-silver').last();

    // ConfirmModal: z-[60], with CANCEL (btn-secondary) and CONFIRM (btn-primary/btn-danger) buttons
    const dialog = page.locator('.fixed.inset-0.z-\\[60\\]');
    this.confirmDialog = {
      container: dialog,
      // Confirm = last button (right side), Cancel = first button (left side)
      confirmButton: dialog.locator('button').last(),
      cancelButton: dialog.locator('button').first(),
      message: dialog.locator('p').first(),
    };
  }

  async waitForToast(type: 'success' | 'error' | 'info' = 'success', timeout = 5000) {
    const toast = type === 'success' ? this.successToast
      : type === 'error' ? this.errorToast
      : this.infoToast;
    await toast.waitFor({ state: 'visible', timeout });
    return toast;
  }

  async waitForToastDismiss(timeout = 6000) {
    await this.toast.first().waitFor({ state: 'detached', timeout });
  }

  async confirmAction() {
    await this.confirmDialog.container.waitFor({ state: 'visible', timeout: 5000 });
    await this.confirmDialog.confirmButton.click();
  }

  async cancelAction() {
    await this.confirmDialog.container.waitFor({ state: 'visible', timeout: 5000 });
    await this.confirmDialog.cancelButton.click();
  }

  async getToastText(): Promise<string> {
    return (await this.toast.first().textContent()) ?? '';
  }
}
