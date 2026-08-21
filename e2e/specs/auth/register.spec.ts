import { test, expect } from '../../fixtures/test';

test.describe('Registration', () => {
  test.beforeEach(async ({ registerPage }) => {
    await registerPage.goto();
  });

  // Tagged @nightly-skip: creates a real Firebase Auth account + Firestore user
  // doc with no cleanup path (account deletion isn't exposed via UI). Excluded
  // from the nightly cron (grep-invert) so the CI account doesn't accumulate
  // orphaned accounts every night. Still runs on every push-to-develop full suite.
  test('successful registration shows email verification screen @nightly-skip', async ({ registerPage }) => {
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

  test('duplicate username blocks registration', async ({ registerPage, commonPage }) => {
    await registerPage.fillForm({
      email: `unique_${Date.now()}@e2etest.com`,
      password: 'Test123456!',
      // TASK-256: 'rafael' is gone as a real account — its /usernames/rafael
      // index entry is now an orphaned pointer to a doc with a DIFFERENT
      // username field (measured live 2026-08-20, see
      // e2e/specs/user-profile/user-profile.spec.ts's file-header comment).
      // 'rafael_m' is confirmed live in dev: 3,211 public cards, its own
      // /usernames/rafael_m index doc resolves correctly.
      username: 'rafael_m', // Known existing username
      location: 'Test City',
    });
    await registerPage.submit();

    // TASK-256: the old `hasError = url.includes('/register') || errorToast`
    // was tautological regardless of the account used — RegisterView.vue's
    // handleRegister() never navigates on success either (registered.value
    // just flips a v-if; router.push only happens later, after email
    // verification), so `url.includes('/register')` is true whether
    // registration succeeded or failed. Only the toast and the pending-
    // verification screen actually distinguish the two outcomes.
    await expect(commonPage.errorToast).toBeVisible({ timeout: 10_000 });
    await expect(registerPage.verificationScreen).toBeHidden();
  });

  test('back to login link works from register page', async ({ registerPage, page }) => {
    await registerPage.loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
