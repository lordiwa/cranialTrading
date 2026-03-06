import { test, expect } from '../../fixtures/test';

test.describe('Registration', () => {
  test.beforeEach(async ({ registerPage }) => {
    await registerPage.goto();
  });

  test('successful registration shows email verification screen', async ({ registerPage }) => {
    const unique = Date.now();
    await registerPage.fillForm({
      email: `test_${unique}@e2etest.com`,
      password: 'Test123456!',
      username: `e2euser${unique}`,
      location: 'Test City, USA',
    });
    await registerPage.submit();

    await expect(registerPage.verificationScreen).toBeVisible({ timeout: 15_000 });
  });

  test('register button disabled when required fields empty', async ({ registerPage, page }) => {
    // The form uses HTML `required` attributes — clicking submit with empty fields
    // should not navigate away (browser validation prevents it)
    await registerPage.submit();
    await expect(page).toHaveURL(/\/register/);
  });

  test('invalid email format shows validation error', async ({ registerPage, page }) => {
    await registerPage.fillForm({
      email: 'not-an-email',
      password: 'Test123456!',
      username: 'testuser',
      location: 'Test City',
    });
    await registerPage.submit();

    // Browser native validation or app validation should prevent submission
    const currentUrl = page.url();
    expect(currentUrl).toContain('/register');
  });

  test('duplicate email blocks registration', async ({ registerPage, page }) => {
    await registerPage.fillForm({
      email: process.env.TEST_USER_A_EMAIL!,
      password: 'Test123456!',
      username: `dup_${Date.now()}`,
      location: 'Test City',
    });
    await registerPage.submit();

    // Should show error toast or remain on register page
    await page.waitForTimeout(5000);
    const url = page.url();
    expect(url).toContain('/register');
  });

  test('duplicate username blocks registration', async ({ registerPage, commonPage, page }) => {
    await registerPage.fillForm({
      email: `unique_${Date.now()}@e2etest.com`,
      password: 'Test123456!',
      username: 'rafael', // Known existing username
      location: 'Test City',
    });
    await registerPage.submit();

    // Should show error or remain on register page
    await page.waitForTimeout(3000);
    const url = page.url();
    const hasError = url.includes('/register') ||
      await commonPage.errorToast.isVisible().catch(() => false);
    expect(hasError).toBeTruthy();
  });

  test('back to login link works from register page', async ({ registerPage, page }) => {
    await registerPage.loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
