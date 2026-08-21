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

  // TASK-259: `expect(page).toHaveURL(/\/register/)` was tautological —
  // RegisterView.vue's <form @submit.prevent="handleRegister"> never
  // navigates away from /register on its own (see the duplicate-username
  // test's comment below), so this assertion was true whether or not the
  // browser actually blocked the empty submit. What the test claims to
  // measure — native HTML5 `required` validation stopping the click — is
  // checked directly instead: the first required input (email) must report
  // itself invalid, and the verification screen (only reachable through a
  // real handleRegister() success) must never appear.
  //
  // TASK-259 review (MEDIUM-2): `validity.valid` alone is a property of the
  // input, independent of whether the SUBMIT was actually blocked — a
  // `novalidate` on the form (or any other bypass of the native barrier)
  // would leave the input reporting invalid while handleRegister() runs
  // anyway. Added a toast-absence check as a second signal.
  //
  // HONEST CAVEAT, measured by mutation (see commit message): for THIS test
  // specifically, `novalidate` ALONE does not turn the toast-absence check
  // red — handleRegister()'s own `if (!email.value || ...) return;` guard
  // (all 4 fields ARE empty here) is a second, independent, JS-level barrier
  // that stops it before it ever reaches authStore.register(), regardless of
  // whether the native `required` barrier was bypassed. The toast check only
  // reds when BOTH the native barrier AND that JS guard are bypassed
  // together (verified: mutated both, got red; reverted, got green) — it is
  // real defense-in-depth against that compound regression, not a
  // stand-alone detector for `novalidate` on its own. The sibling
  // `invalid email format...` test below does NOT have this caveat: its
  // fields are non-empty, so the JS guard does not apply there and the
  // toast check is independently load-bearing.
  //
  // Timing note shared with the sibling test: the toast, when one appears,
  // is visible from ~400ms and auto-dismisses at ~4s (matches CLAUDE.md's
  // documented 4s toast lifetime). `expect(locator).toBeHidden()` AUTO-
  // RETRIES for its own default ~5s window — so checked after any wait ≥0,
  // it would still pass once the toast's own auto-dismiss made it hidden,
  // REGARDLESS of whether it ever appeared, defeating the check entirely.
  // Takes a single point-in-time `isVisible()` snapshot instead, at a delay
  // long enough for the toast to have appeared (~400ms observed) but short
  // enough that it hasn't auto-dismissed yet (~4s observed) if it did.
  test('register button disabled when required fields empty', async ({ registerPage, commonPage }) => {
    await registerPage.submit();

    const emailIsInvalid = await registerPage.emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid,
    );
    expect(emailIsInvalid).toBe(true);
    await registerPage.page.waitForTimeout(1_500);
    const toastAppeared = await commonPage.errorToast.isVisible();
    expect(toastAppeared).toBe(false);
    await expect(registerPage.verificationScreen).toBeHidden();
  });

  // TASK-259: same tautology as above — `currentUrl.toContain('/register')`
  // can't distinguish "native validation blocked the click" from "it didn't".
  // RegisterView does no app-side email format check (handleRegister only
  // checks truthiness); the email <input type="email"> relies entirely on
  // the browser's native format validation to stop the submit event before
  // handleRegister ever runs. Assert that directly.
  //
  // TASK-259 review (MEDIUM-2): same gap as the sibling test above, but here
  // it matters more, and does NOT carry that test's caveat — the fields are
  // non-empty, so handleRegister()'s own `if (!email.value || ...) return;`
  // guard does NOT stop it. Verified by mutation (see commit message): with
  // just the native format barrier (`type="email"` via `novalidate`)
  // bypassed, handleRegister() calls authStore.register('not-an-email', ...),
  // Firebase rejects it with `auth/invalid-email`, and an error toast DOES
  // appear — this check alone (no compound mutation needed) catches it.
  test('invalid email format shows validation error', async ({ registerPage, commonPage }) => {
    await registerPage.fillForm({
      email: 'not-an-email',
      password: 'Test123456!',
      username: 'testuser',
      location: 'Test City',
    });
    await registerPage.submit();

    const emailIsInvalid = await registerPage.emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid,
    );
    expect(emailIsInvalid).toBe(true);
    // Same measured timing and single-snapshot reasoning as the sibling test
    // above (toBeHidden() would auto-retry past the toast's own auto-dismiss
    // and pass regardless of whether it ever appeared).
    await registerPage.page.waitForTimeout(1_500);
    const toastAppeared = await commonPage.errorToast.isVisible();
    expect(toastAppeared).toBe(false);
    await expect(registerPage.verificationScreen).toBeHidden();
  });

  test('duplicate email blocks registration', async ({ registerPage, commonPage }) => {
    await registerPage.fillForm({
      email: process.env.TEST_USER_A_EMAIL!,
      password: 'Test123456!',
      username: `dup_${Date.now()}`,
      location: 'Test City',
    });
    await registerPage.submit();

    // TASK-259: `expect(url).toContain('/register')` was tautological for the
    // exact reason the sibling duplicate-username test's comment explains —
    // handleRegister() never navigates away from /register on success OR
    // error. auth.ts's register() catch block has no `auth/email-already-in-use`
    // branch (unlike changeRegistrationEmail's catch, which does) — it just
    // surfaces the raw Firebase error via `error.message`, un-localized. That
    // message ("Firebase: Error (auth/email-already-in-use).", verified live
    // against dev — the short form, not the SDK's long-form English text)
    // comes straight from the Firebase Auth SDK, not from our i18n files, so
    // it is the same in every app locale. Matched on the error CODE
    // (`email-already-in-use`) rather than free-text wording, since the
    // code is the stable part across SDK message-format changes.
    await expect(commonPage.errorToast).toHaveText(/email-already-in-use/i, { timeout: 10_000 });
    await expect(registerPage.verificationScreen).toBeHidden();
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
    //
    // TASK-259 (LOW-1 from TASK-256's review): `toBeVisible()` alone passes
    // for ANY error toast — a Firebase rate-limit or a network blip would
    // paint this green without a duplicate ever being rejected. auth.ts's
    // register() shows `t('auth.messages.usernameTaken')` specifically for
    // the D-06 reservation-collision path; assert that text so only that
    // rejection satisfies the test.
    await expect(commonPage.errorToast).toHaveText(
      /ya está en uso|already taken|já está em uso/i,
      { timeout: 10_000 },
    );
    await expect(registerPage.verificationScreen).toBeHidden();
  });

  test('back to login link works from register page', async ({ registerPage, page }) => {
    await registerPage.loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
