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
    // Use .first() to avoid strict mode violation when multiple z-[60] modals exist
    const dialog = page.locator('.fixed.inset-0.z-\\[60\\]').first();
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
    // Wait for any z-[60] confirm dialog to be visible
    await this.confirmDialog.container.waitFor({ state: 'visible', timeout: 5000 });
    // Find ALL visible z-[60] dialogs and click the confirm button on the LAST one
    // (the most recently opened). ConfirmModal defaults to ACEPTAR/CANCELAR buttons.
    const visibleDialogs = this.page.locator('.fixed.inset-0.z-\\[60\\]:visible');
    const lastDialog = visibleDialogs.last();
    const confirmBtn = lastDialog.locator('button').last();
    await confirmBtn.click();
  }

  async cancelAction() {
    await this.confirmDialog.container.waitFor({ state: 'visible', timeout: 5000 });
    const visibleDialogs = this.page.locator('.fixed.inset-0.z-\\[60\\]:visible');
    const lastDialog = visibleDialogs.last();
    const cancelBtn = lastDialog.locator('button').first();
    await cancelBtn.click();
  }

  async getToastText(): Promise<string> {
    return (await this.toast.first().textContent()) ?? '';
  }
}
