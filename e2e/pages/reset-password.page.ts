import { type Page, type Locator } from '@playwright/test';

export class ResetPasswordPage {
  readonly page: Page;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly mismatchError: Locator;
  readonly invalidCodeMessage: Locator;
  readonly backToLoginLink: Locator;
  readonly requestNewLink: Locator;

  constructor(page: Page) {
    this.page = page;
    const passwordInputs = page.locator('input[type="password"]');
    this.passwordInput = passwordInputs.nth(0);
    this.confirmPasswordInput = passwordInputs.nth(1);
    this.submitButton = page.getByRole('button', { name: /reset|restablecer/i });
    this.mismatchError = page.locator('.text-rust', { hasText: /match|coinciden/i });
    this.invalidCodeMessage = page.locator('text=✗');
    this.backToLoginLink = page.locator('a[href="/login"]');
    this.requestNewLink = page.locator('a[href="/forgot-password"]');
  }

  async goto(oobCode?: string) {
    const params = oobCode ? `?oobCode=${oobCode}` : '';
    await this.page.goto(`/reset-password${params}`);
  }

  async fillPasswords(password: string, confirm: string) {
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirm);
  }
}
