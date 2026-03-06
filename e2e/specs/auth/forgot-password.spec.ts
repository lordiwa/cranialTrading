import { test, expect } from '../../fixtures/test';
import { ROUTES } from '../../helpers/test-data';

test.describe('Forgot Password', () => {
  test.beforeEach(async ({ forgotPasswordPage }) => {
    await forgotPasswordPage.goto();
  });

  test('submit email shows confirmation message', async ({ forgotPasswordPage }) => {
    await forgotPasswordPage.submitEmail(process.env.TEST_USER_A_EMAIL!);

    await expect(forgotPasswordPage.successMessage).toBeVisible({ timeout: 10_000 });
  });

  test('empty email shows validation error', async ({ forgotPasswordPage, page }) => {
    await forgotPasswordPage.submitButton.click();

    // Should stay on the same page (browser validation prevents submission)
    await expect(page).toHaveURL(new RegExp(ROUTES.forgotPassword));
  });

  test('back to login link from forgot-password', async ({ forgotPasswordPage, page }) => {
    await forgotPasswordPage.backToLoginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Reset Password', () => {
  test('reset password page rejects mismatched passwords', async ({ resetPasswordPage }) => {
    await resetPasswordPage.goto('fake-oob-code');
    await resetPasswordPage.fillPasswords('NewPassword1!', 'DifferentPassword!');

    await expect(resetPasswordPage.mismatchError).toBeVisible();
    await expect(resetPasswordPage.submitButton).toBeDisabled();
  });

  test('reset password with invalid/expired oobCode shows error', async ({ resetPasswordPage }) => {
    await resetPasswordPage.goto(); // No oobCode provided

    await expect(resetPasswordPage.invalidCodeMessage).toBeVisible();
  });
});
