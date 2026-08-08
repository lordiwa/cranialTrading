import { test, expect } from '../../fixtures/test';
import { ROUTES } from '../../helpers/test-data';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  // The authenticated landing moved off the matches hub (2026-08-07): login no longer
  // pays the match recalculation up front — that now happens when /saved-matches is
  // actually opened.
  // CORRECTION (TASK-148, 2026-08-08): this used to also claim "/inicio reads nothing
  // from Firestore" — false, measured (AppHeader's MatchNotificationsDropdown fired
  // loadAllMatches() unconditionally on mount, landing included). Fixed by deferring
  // that load to the bell click instead of onMount; see src/views/HomeView.vue.
  test('successful login redirects to the /inicio landing @smoke', async ({ loginPage, page }) => {
    const email = process.env.TEST_USER_A_EMAIL!;
    const password = process.env.TEST_USER_A_PASSWORD!;

    await loginPage.login(email, password);
    await loginPage.waitForRedirect();

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/inicio/);
  });

  test('invalid credentials show error toast', async ({ loginPage, commonPage }) => {
    await loginPage.login('wrong@email.com', 'wrongpassword');

    const toast = await commonPage.waitForToast('error');
    await expect(toast).toBeVisible();
  });

  test('empty fields — submit button is disabled', async ({ loginPage }) => {
    await expect(loginPage.submitButton).toBeDisabled();

    await loginPage.emailInput.fill('test@test.com');
    await expect(loginPage.submitButton).toBeDisabled();

    await loginPage.emailInput.clear();
    await loginPage.passwordInput.fill('password');
    await expect(loginPage.submitButton).toBeDisabled();

    await loginPage.emailInput.fill('test@test.com');
    await expect(loginPage.submitButton).toBeEnabled();
  });

  test('"Forgot Password" and "Register" links navigate correctly', async ({ loginPage, page }) => {
    await loginPage.forgotPasswordLink.click();
    await expect(page).toHaveURL(ROUTES.forgotPassword);

    await page.goto(ROUTES.login);
    await loginPage.registerLink.click();
    await expect(page).toHaveURL(ROUTES.register);
  });
});
