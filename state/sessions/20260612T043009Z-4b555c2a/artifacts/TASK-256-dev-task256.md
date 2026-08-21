=== dev-task256 @ 2026-08-20T23:20:00Z ===

AC2 evidence — verbatim red output for each of the 6 mutations (5 in
`e2e/specs/user-profile/user-profile.spec.ts` + 1 in
`e2e/specs/auth/register.spec.ts`). All captured live during this session,
copied here unedited from the tool output; none reconstructed from memory.
Every mutation was reverted immediately after capture and the suite
re-confirmed green before moving to the next one (see the two final green
runs at the bottom).

Command used for every user-profile mutation:
```
VITE_MODE=development npx playwright test e2e/specs/user-profile --grep "<test name>"
```
Command used for the register mutation:
```
VITE_MODE=development npx playwright test e2e/specs/auth/register.spec.ts --grep "duplicate username"
```

---

## Mutation 1 — 'view public user profile: username, location, avatar visible'

**Mutated:** `await userProfilePage.goto(PUBLIC_PROFILE_USERNAME);` →
`await userProfilePage.goto('MUTATION-zzznonexistentuserzzz');`

**Red output (verbatim):**
```
  x  2 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:47:3 › User Profile › view public user profile: username, location, avatar visible (10.5s)

  1) [chromium] › e2e\specs\user-profile\user-profile.spec.ts:47:3 › User Profile › view public user profile: username, location, avatar visible

    Error: expect(locator).toHaveText(expected) failed

    Locator: locator('h1').first()
    Expected: "@rafael_m"
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toHaveText" with timeout 10000ms
      - waiting for locator('h1').first()

       49 |     // Asserting the ACTUAL text, not just "an h1 exists" — the latter is what
       50 |     // let this test pass against an orphaned/mismatched account before.
    >  51 |     await expect(userProfilePage.username).toHaveText(`@${PUBLIC_PROFILE_USERNAME}`, { timeout: 10_000 });
          |                                            ^
       52 |     await expect(userProfilePage.avatar.first()).toBeVisible();
       53 |   });

  1 failed
    [chromium] › e2e\specs\user-profile\user-profile.spec.ts:47:3 › User Profile › view public user profile: username, location, avatar visible
  1 passed
```
Reverted immediately after capture.

---

## Mutation 2a — 'browse public cards on profile with text search filter' (wrong account)

**Mutated:** `await userProfilePage.goto(PUBLIC_PROFILE_USERNAME);` →
`await userProfilePage.goto('MUTATION-zzznonexistentuserzzz');`

**Red output (verbatim):**
```
  x  2 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:55:3 › User Profile › browse public cards on profile with text search filter (10.6s)

  1) [chromium] › e2e\specs\user-profile\user-profile.spec.ts:55:3 › User Profile › browse public cards on profile with text search filter

    Error: expect(locator).toBeVisible() failed

    Locator: locator('main input[type="text"]').first()
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for locator('main input[type="text"]').first()

       58 |     // Real content actually rendered — not wrapped in an `if` that lets the
       59 |     // test pass by doing nothing when the element isn't there.
    >  60 |     await expect(userProfilePage.searchInput).toBeVisible({ timeout: 10_000 });
          |                                                ^
       61 |     await expect(userProfilePage.resultTotal).toBeVisible();
       62 |     const initialTotal = await userProfilePage.resultTotal.textContent();
       63 |     expect(Number(initialTotal)).toBeGreaterThan(0);

  1 failed
    [chromium] › e2e\specs\user-profile\user-profile.spec.ts:55:3 › User Profile › browse public cards on profile with text search filter
  1 passed
```
Reverted (account line only) before running mutation 2b.

## Mutation 2b — same test (filter with a real, matchable term instead of a nonsense one)

**Mutated:** `await userProfilePage.filterCards('zzznonexistentcardzzz');` →
`await userProfilePage.filterCards('a'); // MUTATION: real term, should NOT empty the grid`

**Red output (verbatim):**
```
  x  2 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:55:3 › User Profile › browse public cards on profile with text search filter (14.7s)

  1) [chromium] › e2e\specs\user-profile\user-profile.spec.ts:55:3 › User Profile › browse public cards on profile with text search filter

    Error: expect(locator).toBeVisible() failed

    Locator: locator('[data-testid="profile-filtered-empty"]')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for locator('[data-testid="profile-filtered-empty"]')

       68 |     // unlike asserting on a specific card name.
       69 |     await userProfilePage.filterCards('a'); // MUTATION: real term, should NOT empty the grid
    >  70 |     await expect(userProfilePage.filteredEmptyState).toBeVisible({ timeout: 10_000 });
          |                                                      ^
       71 |   });
       72 |
       73 |   test('logged-out visitor does NOT see interest/contact buttons', async ({ browser }) => {

  1 failed
    [chromium] › e2e\specs\user-profile\user-profile.spec.ts:55:3 › User Profile › browse public cards on profile with text search filter
  1 passed
```
Reverted immediately after capture.

---

## Mutation 3 — 'logged-out visitor does NOT see interest/contact buttons'

**Mutated:** `const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });`
→ `const context = await browser.newContext(); // MUTATION: drop the explicit blank storageState`

**Red output (verbatim):**
```
  x  2 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:73:3 › User Profile › logged-out visitor does NOT see interest/contact buttons (9.6s)

  1) [chromium] › e2e\specs\user-profile\user-profile.spec.ts:73:3 › User Profile › logged-out visitor does NOT see interest/contact buttons

    Error: expect(locator).toBeHidden() failed

    Locator:  getByRole('button', { name: /contact|contactar/i })
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
      - Expect "toBeHidden" with timeout 5000ms
      - waiting for getByRole('button', { name: /contact|contactar/i })
        8 × locator resolved to <button type="button" class="font-bold uppercase tracking-[.1em] cursor-pointer min-h-[44px] inline-flex items-center justify-center gap-2 rounded-md transition-all duration-200 ease-v2 px-3 py-2.5 text-[11px] border border-neon text-neon hover:bg-neon-10 hover:shadow-glow-neon active:bg-neon-10">…</button>
          - unexpected value "visible"

       100 |
       101 |     const contactBtn = page.getByRole('button', { name: /contact|contactar/i });
    >  102 |     await expect(contactBtn).toBeHidden();
           |                              ^
       103 |
       104 |     await context.close();
       105 |   });

  1 failed
    [chromium] › e2e\specs\user-profile\user-profile.spec.ts:73:3 › User Profile › logged-out visitor does NOT see interest/contact buttons
  1 passed
```
This is the run that also **proved the mechanism claim in AC4**: a bare
`browser.newContext()` under this project's config genuinely does inherit the
authenticated `storageState` — the contact button is visible because the
"fresh" context is not actually logged out. Confirmed separately by reading
`localStorage` in a debug spec right after `newContext()` + `goto()`:
`firebase:authUser:...` key present, cookies empty. Reverted immediately
after capture.

---

## Mutation 4 — 'non-existent username shows user-not-found state'

**Mutated:** `await userProfilePage.goto('zzznonexistentuserzzz');` →
`await userProfilePage.goto('rafael_m'); // MUTATION: a real, existing username`

**Red output (verbatim):**
```
  x  2 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:107:3 › User Profile › non-existent username shows user-not-found state (10.6s)

  1) [chromium] › e2e\specs\user-profile\user-profile.spec.ts:107:3 › User Profile › non-existent username shows user-not-found state

    Error: expect(locator).toBeVisible() failed

    Locator: locator('text=/not found|no encontrad/i')
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for locator('text=/not found|no encontrad/i')

       108 |     await userProfilePage.goto('rafael_m'); // MUTATION: a real, existing username
       109 |
    >  110 |     await expect(userProfilePage.notFoundMessage).toBeVisible({ timeout: 10_000 });
           |                                                   ^
       111 |   });
       112 |
       113 |   test('logged-in user viewing own profile sees different UI', async ({ userProfilePage, page }) => {

  1 failed
    [chromium] › e2e\specs\user-profile\user-profile.spec.ts:107:3 › User Profile › non-existent username shows user-not-found state
  1 passed
```
Reverted immediately after capture.

---

## Mutation 5 — 'logged-in user viewing own profile sees different UI'

**Mutated:** the realistic-navigation flow (goto `/collection` → click the
popover trigger → click "View my public profile") → a direct
`await page.goto('/@${PUBLIC_PROFILE_USERNAME}'); // MUTATION: someone else's profile, not own`

**Red output (verbatim):**
```
  x  2 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:113:3 › User Profile › logged-in user viewing own profile sees different UI (6.1s)

  1) [chromium] › e2e\specs\user-profile\user-profile.spec.ts:113:3 › User Profile › logged-in user viewing own profile sees different UI

    Error: expect(page).toHaveURL(expected) failed

    Expected pattern: /\/@RafaMoose$/
    Received string:  "http://localhost:4173/@rafael_m"
    Timeout: 5000ms

    Call log:
      - Expect "toHaveURL" with timeout 5000ms
        8 × unexpected value "http://localhost:4173/@rafael_m"

       118 |     await page.goto(`/@${PUBLIC_PROFILE_USERNAME}`); // MUTATION: someone else's profile, not own
       119 |
    >  120 |     await expect(page).toHaveURL(new RegExp(`/@${OWN_PROFILE_USERNAME}$`));
           |                        ^
       121 |     await expect(userProfilePage.username).toHaveText(`@${OWN_PROFILE_USERNAME}`, { timeout: 10_000 });
       122 |
       123 |     // Own profile: wishlist link instead of a contact button (UserProfileView.vue

  1 failed
    [chromium] › e2e\specs\user-profile\user-profile.spec.ts:113:3 › User Profile › logged-in user viewing own profile sees different UI
  1 passed
```
Reverted immediately after capture. Full `e2e:profile` re-run afterward, all
6 tests green (see final confirmation run below).

---

## Mutation 6 — register.spec.ts 'duplicate username blocks registration'

**Mutated:** `username: 'rafael_m', // Known existing username` →
`username: `zzmut${Date.now()}`, // MUTATION: valid format, genuinely not taken`
(a syntactically valid, definitely-unregistered username — deliberately NOT
an over-length string, so the failure exercises the actual duplicate-check
path rather than the separate format-validation path)

**Red output (verbatim):**
```
  x  1 [no-auth-tests] › e2e\specs\auth\register.spec.ts:61:3 › Registration › duplicate username blocks registration (10.5s)

  1) [no-auth-tests] › e2e\specs\auth\register.spec.ts:61:3 › Registration › duplicate username blocks registration

    Error: expect(locator).toBeVisible() failed

    Locator: locator('.border-rust.text-rust').last()
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for locator('.border-rust.text-rust').last()

       81 |     // registration succeeded or failed. Only the toast and the pending-
       82 |     // verification screen actually distinguish the two outcomes.
    >  83 |     await expect(commonPage.errorToast).toBeVisible({ timeout: 10_000 });
          |                                         ^
       84 |     await expect(registerPage.verificationScreen).toBeHidden();
       85 |   });
       86 |

  1 failed
    [no-auth-tests] › e2e\specs\auth\register.spec.ts:61:3 › Registration › duplicate username blocks registration
```
**Known side effect, disclosed:** this mutation did not just fail an
assertion — the registration actually SUCCEEDED (no duplicate, valid
format), which means a real account was created in `cranial-trading-dev`
(email `unique_<timestamp>@e2etest.com`, username `zzmut<timestamp>`). I have
no `GOOGLE_APPLICATION_CREDENTIALS`/ADC in this session to delete it by id.
This is the same risk profile CLAUDE.md already documents and accepts for
this file's own "successful registration" test (`@nightly-skip`, no cleanup
path). Reverted the code mutation immediately after capture; did not attempt
to delete the created account.

---

## Final confirmation — both files green with all mutations reverted

`user-profile.spec.ts`, full file:
```
Running 6 tests using 1 worker

  ok  1 [setup] › e2e\auth.setup.ts:21:1 › authenticate (4.0s)
  ok  2 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:47:3 › User Profile › view public user profile: username, location, avatar visible (4.6s)
  ok  3 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:55:3 › User Profile › browse public cards on profile with text search filter (7.0s)
  ok  4 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:73:3 › User Profile › logged-out visitor does NOT see interest/contact buttons (3.3s)
  ok  5 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:107:3 › User Profile › non-existent username shows user-not-found state (3.4s)
  ok  6 [chromium] › e2e\specs\user-profile\user-profile.spec.ts:113:3 › User Profile › logged-in user viewing own profile sees different UI (2.4s)

  6 passed (45.1s)
```

`register.spec.ts` (whole file, includes the reverted duplicate-username test):
```
Running 15 tests using 1 worker

  ok   1 [no-auth-tests] › e2e\specs\auth\forgot-password.spec.ts:9:3 › Forgot Password › submit email shows confirmation message (1.6s)
  ok   2 [no-auth-tests] › e2e\specs\auth\forgot-password.spec.ts:15:3 › Forgot Password › empty email shows validation error (440ms)
  ok   3 [no-auth-tests] › e2e\specs\auth\forgot-password.spec.ts:22:3 › Forgot Password › back to login link from forgot-password (479ms)
  ok   4 [no-auth-tests] › e2e\specs\auth\forgot-password.spec.ts:29:3 › Reset Password › reset password page rejects mismatched passwords (437ms)
  ok   5 [no-auth-tests] › e2e\specs\auth\forgot-password.spec.ts:37:3 › Reset Password › reset password with invalid/expired oobCode shows error (371ms)
  ok   6 [no-auth-tests] › e2e\specs\auth\login.spec.ts:16:3 › Login › successful login redirects to the /inicio landing @smoke (2.1s)
  ok   7 [no-auth-tests] › e2e\specs\auth\login.spec.ts:27:3 › Login › invalid credentials show error toast (1.0s)
  ok   8 [no-auth-tests] › e2e\specs\auth\login.spec.ts:34:3 › Login › empty fields — submit button is disabled (819ms)
  ok   9 [no-auth-tests] › e2e\specs\auth\login.spec.ts:48:3 › Login › "Forgot Password" and "Register" links navigate correctly (748ms)
  ok  10 [no-auth-tests] › e2e\specs\auth\register.spec.ts:12:3 › Registration › successful registration shows email verification screen @nightly-skip (3.4s)
  ok  11 [no-auth-tests] › e2e\specs\auth\register.spec.ts:25:3 › Registration › register button disabled when required fields empty (462ms)
  ok  12 [no-auth-tests] › e2e\specs\auth\register.spec.ts:32:3 › Registration › invalid email format shows validation error (529ms)
  ok  13 [no-auth-tests] › e2e\specs\auth\register.spec.ts:46:3 › Registration › duplicate email blocks registration (5.5s)
  ok  14 [no-auth-tests] › e2e\specs\auth\register.spec.ts:61:3 › Registration › duplicate username blocks registration (3.4s)
  ok  15 [no-auth-tests] › e2e\specs\auth\register.spec.ts:87:3 › Registration › back to login link works from register page (507ms)

  15 passed (50.8s)
```

`collection-crud.spec.ts` @smoke test (fixed, not part of AC2's mandatory
mutation set, but confirmed green after the fix; no mutation captured for
this one — see hand-off for why: `getCardCount()`/`waitForGridReady()` throw
on zero cards by construction, read from existing helper code, not
re-derived by a live mutation in this session):
```
  ok  1 [setup] › e2e\auth.setup.ts:21:1 › authenticate (3.8s)
  ok  2 [chromium] › e2e\specs\collection\collection-crud.spec.ts:23:3 › Collection CRUD › collection page loads with card grid visible @smoke (3.1s)

  2 passed (33.5s)
```

No evidence is missing for the 6 mandatory AC2 mutations — all 6 have
verbatim red output above, captured live, not reconstructed.
