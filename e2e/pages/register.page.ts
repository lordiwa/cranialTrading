import { type Page, type Locator } from '@playwright/test';

export class RegisterPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly usernameInput: Locator;
  readonly locationInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;
  readonly verificationScreen: Locator;
  readonly checkVerificationButton: Locator;
  readonly resendEmailButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    // Username and location are text inputs; username is first, location second
    const textInputs = page.locator('input[type="text"]');
    this.usernameInput = textInputs.nth(0);
    this.locationInput = textInputs.nth(1);
    this.submitButton = page.locator('[data-testid="register-submit"]');
    this.loginLink = page.locator('a[href="/login"]');
    this.verificationScreen = page.getByRole('heading', { name: /VERIFY YOUR EMAIL|VERIFICA TU EMAIL/i });
    this.checkVerificationButton = page.getByRole('button', { name: /verif/i });
    this.resendEmailButton = page.getByRole('button', { name: /resend|reenviar/i });
  }

  async goto() {
    await this.page.goto('/register');
  }

  async fillForm(data: { email: string; password: string; username: string; location: string }) {
    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    await this.usernameInput.fill(data.username);
    await this.locationInput.fill(data.location);
  }

  async submit() {
    await this.submitButton.click();
  }
}
