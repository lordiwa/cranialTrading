import { test, expect } from '../../fixtures/test';
import { ROUTES } from '../../helpers/test-data';
import { adminUnavailableReason, getTestAdmin } from '../../helpers/admin';

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
  // TASK-301: this used to navigate with `?oobCode=fake-oob-code` and expect
  // the password form to be usable there. That was true of the PRE-TASK-301
  // behavior only — the fix validates the oobCode against Firebase Auth
  // before trusting the form, so a garbage code now renders the persistent
  // error card instead (see the garbage-oobCode test below, which asserts
  // exactly that). This test now uses a REAL oobCode from
  // admin.generatePasswordResetLink() to reach the form at all, which is the
  // only way left in this app to exercise the mismatch validation (use case
  // 2) end to end. Skips (rather than fails) when Application Default
  // Credentials are unavailable — the TASK-240/TASK-271 pattern already
  // established in this repo — because without them there is no way to mint
  // a valid oobCode.
  test('reset password page renders the form for a valid oobCode and rejects mismatched passwords', async ({ resetPasswordPage }) => {
    const admin = await getTestAdmin();
    test.skip(admin === null, `TASK-301: no admin teardown available — ${adminUnavailableReason()}`);

    const link = await admin!.generatePasswordResetLink(process.env.TEST_USER_A_EMAIL!);
    await resetPasswordPage.gotoWithLink(link);

    // Use case 1 (happy path): a valid oobCode renders the real form —
    // both password inputs and the submit button.
    await expect(resetPasswordPage.passwordInput).toBeVisible({ timeout: 10_000 });
    await expect(resetPasswordPage.confirmPasswordInput).toBeVisible();
    await expect(resetPasswordPage.submitButton).toBeVisible();

    // Use case 2 (alternative path): passwords that don't match show the
    // mismatch error and never enable the submit button.
    await resetPasswordPage.fillPasswords('NewPassword1!', 'DifferentPassword!');
    await expect(resetPasswordPage.mismatchError).toBeVisible();
    // Use case 6 (no data regression): the button staying disabled is what
    // guarantees handleReset() — and therefore confirmPasswordReset — is
    // never invoked here, so TEST_USER_A's real password is untouched by
    // this test.
    await expect(resetPasswordPage.submitButton).toBeDisabled();
  });

  // TASK-301, use case 3: garbage/malformed oobCode (as opposed to no
  // oobCode at all, which the next test covers) must land on the same
  // persistent error card, with an escape hatch, and with the password form
  // entirely absent — not just hidden behind a disabled state. Regla 2: this
  // is the one gap the ticket named explicitly ("hoy no lo afirma nadie
  // explícitamente con código basura") — without it, a regression that made
  // ONLY the malformed-code path fall through to the old exposed-form
  // behavior (while the no-code path stayed fixed) would go undetected.
  test('reset password rejects a garbage oobCode with the persistent error card and no password inputs', async ({ resetPasswordPage }) => {
    await resetPasswordPage.goto('fake-oob-code');

    await expect(resetPasswordPage.invalidCodeMessage).toBeVisible({ timeout: 10_000 });
    await expect(resetPasswordPage.requestNewLink).toBeVisible();
    await expect(resetPasswordPage.passwordInputs).toHaveCount(0);
  });

  test('reset password with invalid/expired oobCode shows error', async ({ resetPasswordPage }) => {
    await resetPasswordPage.goto(); // No oobCode provided

    await expect(resetPasswordPage.invalidCodeMessage).toBeVisible();
  });
});
