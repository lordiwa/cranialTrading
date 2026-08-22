import { test, expect } from '../../fixtures/test';
import { adminUnavailableReason, getTestAdmin } from '../../helpers/admin';

test.describe('Registration', () => {
  test.beforeEach(async ({ registerPage }) => {
    await registerPage.goto();
  });

  // TASK-271: this used to have no cleanup path at all — "account deletion
  // isn't exposed via UI" — so it created a real Firebase Auth account +
  // `/users` doc + `/usernames` reservation on every run and left all three
  // forever. TASK-240 already established the pattern this now follows: an
  // out-of-band admin teardown deletes by the identifier the test captured at
  // creation time, and if admin credentials are unavailable the test SKIPS
  // instead of creating an account it cannot clean up (AC4) — never runs and
  // leaves the mess anyway.
  //
  // AC8 decision, CORRECTED (an earlier draft of this comment got this
  // wrong): `@nightly-skip` STAYS. CLAUDE.md documents TWO independent
  // reasons this test carried the tag, not one:
  //   (a) no cleanup path (the "Mutators" section, e2e-3-level-policy) — DEAD
  //       as of this ticket, this test deletes what it creates now.
  //   (b) a real, separate flake — Firebase rate-limits
  //       `sendEmailVerification` under repeated automated registration (the
  //       "Known flaky specs" line). CLAUDE.md's "Known flakes" bullet in the
  //       nightly section says this explicitly: register.spec.ts and
  //       search.spec.ts's autocomplete test are tagged `@nightly-skip`
  //       "in addition to Playwright's existing retries: 2 under CI, so
  //       neither ever reds out a nightly run on its own" — i.e. the project
  //       already measured that CI's retries do NOT absorb this flake on
  //       their own, which is exactly why the tag exists on top of them.
  // Only (a) is this ticket's business. (b) is untouched and still live, so
  // removing the tag on (a)'s strength alone would silently undo a decision
  // CLAUDE.md already documents — don't re-derive "the tag can go" from this
  // ticket without re-reading both of those CLAUDE.md sections first.
  test('successful registration shows email verification screen @nightly-skip', async ({ registerPage }) => {
    const admin = await getTestAdmin();
    test.skip(admin === null, `TASK-271: no admin teardown available — ${adminUnavailableReason()}`);

    const unique = Date.now();
    const email = `test_${unique}@e2etest.com`;
    // AC6: the identifier this run's teardown deletes by. Captured HERE, from
    // the exact values this test is about to submit — never rederived later
    // by lookup, grid position, "most recent", or any other heuristic. This
    // is the same failure mode TASK-240 measured: heuristic teardown deleted
    // an unrelated fixture instead of what the test created.
    const usernameNorm = `e2euser${unique}`.toLowerCase();

    await registerPage.fillForm({
      email,
      password: 'Test123456!',
      username: usernameNorm,
      location: 'Test City, USA',
    });
    await registerPage.submit();

    let registrationSucceeded = false;
    try {
      await expect(registerPage.verificationScreen).toBeVisible({ timeout: 15_000 });
      registrationSucceeded = true;
    } finally {
      // Runs whether the assertion above passed or failed: a red assertion
      // does not mean registration didn't happen — the account may still
      // exist and still need deleting.
      const uid = await admin!.getUidByEmail(email);

      // Review MEDIUM-1: a null `uid` here does NOT mean cleanup already
      // happened — it can equally mean getUidByEmail lagged or is broken.
      // The old code let a null uid make the ENTIRE post-cleanup check block
      // a no-op (it lived inside `if (uid)`), so a broken lookup passed the
      // test GREEN with all three pieces still live — the lookup that
      // decides whether to clean up was also the only thing deciding whether
      // cleanup was verified, so its own failure silenced the sensor
      // instead of tripping it. If the verification screen was seen, the
      // account demonstrably exists, so `uid` being null at this point is
      // itself a defect that must redden here, not be swallowed.
      if (registrationSucceeded) {
        expect
          .soft(uid, 'TASK-271: registration succeeded but getUidByEmail(email) returned null — cannot verify or perform cleanup')
          .not.toBeNull();
      }

      if (uid) {
        await admin!.deleteAccount({ uid, usernameNorm });
      }

      // AC3's sensor: a teardown call that returns without throwing is not
      // proof it deleted anything — TASK-240's whole premise is that a
      // "green" teardown can still leak. Re-check all THREE pieces by the
      // identity captured at creation time (AC6), with `expect.soft` so all
      // three are always evaluated regardless of one another — a hard
      // `expect` stops at the first failure, which would mask whether
      // /usernames or /users were ever checked at all once Auth failed
      // first (measured on an earlier draft of this test). A partial leak
      // (e.g. Auth+users deleted but /usernames orphaned — precisely the
      // TASK-268 damage class) reds out exactly the assertion that detected
      // it and none of the others. Verified live (see this ticket's commit
      // message for the captured red run, with all three deletion steps in
      // `deleteAccount` disabled at once and all three messages present in
      // the same failure, plus the final green).
      //
      // /usernames is keyed by `usernameNorm`, which this test always knows
      // — unlike the Auth/`/users` checks below, it never needed `uid`, so
      // (review MEDIUM-1) it must not live inside `if (uid)` where a lookup
      // failure would silence it too.
      const usernameDocAfter = await admin!.db.doc(`usernames/${usernameNorm}`).get();
      expect.soft(usernameDocAfter.exists, 'TASK-271: /usernames entry was not deleted').toBe(false);

      if (uid) {
        const uidAfter = await admin!.getUidByEmail(email);
        expect.soft(uidAfter, 'TASK-271: Auth account was not deleted').toBeNull();
        const userDocAfter = await admin!.db.doc(`users/${uid}`).get();
        expect.soft(userDocAfter.exists, 'TASK-271: /users doc was not deleted').toBe(false);
      }
    }
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
      // TASK-267: dev was wiped entirely on 2026-08-21; the old 'rafael_m'
      // fixture is gone along with every other prior account. 'qa_mtg' is
      // the sole account left, confirmed live: its own /usernames/qa_mtg
      // index doc resolves correctly (see
      // e2e/specs/user-profile/user-profile.spec.ts's file-header comment
      // for the full account picture, including the TASK-268 /usernames/qa
      // orphan — do not confuse that orphan key with this real username).
      username: 'qa_mtg', // Known existing username
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
