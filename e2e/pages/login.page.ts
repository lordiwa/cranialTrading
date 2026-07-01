import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly loginTrigger: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;
  readonly googleButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // TASK-086: the login form now lives in a header dropdown/sheet behind
    // the "Iniciar sesión" trigger (data-testid="login-trigger") instead of
    // being visible by default — goto() opens it for every test.
    // No .first(): LandingHeader mounts exactly ONE layout subtree at a
    // time (reactive isDesktop guard, not CSS-only hidden/lg:hidden), so
    // exactly one trigger — and one login form — exists in the DOM. If
    // this locator ever resolves to >1 element again, that's a real
    // duplicate-DOM regression and the test should fail loudly.
    this.loginTrigger = page.locator('[data-testid="login-trigger"]');
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.forgotPasswordLink = page.locator('a[href="/forgot-password"]');
    this.registerLink = page.locator('a[href="/register"]').first();
    this.googleButton = page.locator('button', { hasText: /Google/i });
  }

  async goto() {
    await this.page.goto('/login');
    await this.loginTrigger.click();
    await this.emailInput.waitFor({ state: 'visible' });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async waitForRedirect() {
    const errorToast = this.page.locator('.border-rust').first();
    const result = await Promise.race([
      this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
        .then(() => 'redirected' as const),
      errorToast.waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'error' as const),
    ]);
    if (result === 'error') {
      const msg = await errorToast.textContent().catch(() => 'unknown error');
      throw new Error(`Login failed: ${msg}`);
    }
  }
}
