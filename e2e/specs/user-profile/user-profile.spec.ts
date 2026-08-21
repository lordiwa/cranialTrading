import { test, expect } from '../../fixtures/test';

// TASK-256. Which account each test targets, and why:
//
// - 'rafael_m' (uid yoU2gaJARfe72oW7GK2GkQxSgCe2): the ONLY dev account with a
//   real, populated public profile (3,211 cards), measured 2026-08-20. Used by
//   every test that looks at somebody ELSE's public profile.
// - 'RafaMoose' (uid jV6gJqf3csPA4vRfO2k9Vb5ejYo2, TEST_USER_A_EMAIL): the
//   account the whole suite authenticates as (e2e/auth.setup.ts). Used ONLY by
//   the "own profile" test, and MUST be the exact stored casing — see below.
// - The old target, 'rafael', is gone as a real account. Its
//   /usernames/rafael index pointer was measured live to still exist and now
//   points at an ORPHANED doc whose `username` field is something else
//   entirely (a leftover from a register.spec.ts run). resolveUsernameToUid()
//   trusts the index pointer without checking the resolved doc's username
//   field matches, so the profile silently rendered THAT doc — which is why
//   the old "username visible" assertion passed against a "deleted" account:
//   it was never checking that the visible username was the right one.
//   Real production bug, not a test bug — reported, not fixed here (out of
//   this ticket's scope; see hand-off AC7).
//
// 'RafaMoose' has EXACT case that matters: UserProfileView.vue's own-profile
// branch is `authStore.user?.username === username.value`, comparing the
// route param to the raw (non-normalized) stored `username` field — it does
// NOT go through resolveUsernameToUid's normalization. Any other casing
// ('rafamoose') falls through to resolveUsernameToUid, which has no
// /usernames/rafamoose index doc, so it 404s.
//
// Exact case is necessary but NOT sufficient. Measured live: a raw
// `page.goto('/@RafaMoose')` — a full browser navigation — 404s too, because
// it races the app's own async auth-restore. `loadProfile()` runs in
// `onMounted`, and on a fresh page load `authStore.user` is still null at
// that point (Firebase hasn't finished restoring the session from
// localStorage yet), so the own-profile branch above is skipped in favour of
// resolveUsernameToUid — which then 404s for the reason above. There is no
// watcher that retries once auth becomes ready. Real race in production
// code, not a test artifact — reported, not fixed here (see hand-off AC7).
// The realistic fix is realistic navigation: real users reach their own
// profile through the in-app "View my public profile" link (a client-side
// `<router-link>` click, UserPopover.vue), which only ever renders once
// `authStore.user` is already populated — so it never hits this race. The
// "own profile" test below reproduces that path instead of a raw goto.
const PUBLIC_PROFILE_USERNAME = 'rafael_m';
const OWN_PROFILE_USERNAME = 'RafaMoose'; // exact case — see comment above

test.describe('User Profile', () => {
  test('view public user profile: username, location, avatar visible', async ({ userProfilePage }) => {
    await userProfilePage.goto(PUBLIC_PROFILE_USERNAME);
    // Asserting the ACTUAL text, not just "an h1 exists" — the latter is what
    // let this test pass against an orphaned/mismatched account before.
    await expect(userProfilePage.username).toHaveText(`@${PUBLIC_PROFILE_USERNAME}`, { timeout: 10_000 });
    await expect(userProfilePage.avatar.first()).toBeVisible();
  });

  test('browse public cards on profile with text search filter', async ({ userProfilePage }) => {
    await userProfilePage.goto(PUBLIC_PROFILE_USERNAME);

    // Real content actually rendered — not wrapped in an `if` that lets the
    // test pass by doing nothing when the element isn't there.
    await expect(userProfilePage.searchInput).toBeVisible({ timeout: 10_000 });
    await expect(userProfilePage.resultTotal).toBeVisible();
    const initialTotal = await userProfilePage.resultTotal.textContent();
    expect(Number(initialTotal)).toBeGreaterThan(0);

    // A search term no card can match proves the filter actually filters
    // (server-side, over the whole collection — TASK-247) rather than being a
    // no-op text box. Robust against whatever the account happens to own,
    // unlike asserting on a specific card name.
    await userProfilePage.filterCards('zzznonexistentcardzzz');
    await expect(userProfilePage.filteredEmptyState).toBeVisible({ timeout: 10_000 });
  });

  test('logged-out visitor does NOT see interest/contact buttons', async ({ browser }) => {
    // TASK-256 AC4: `page.context().clearCookies()` does NOT log anyone out —
    // Firebase auth persists to localStorage (e2e/auth.setup.ts's own
    // comment says so), and this spec file runs under the 'chromium' project,
    // which applies `storageState: 'e2e/.auth/user.json'` (a signed-in
    // session) to every test by default. The old assertion
    // (`expect(typeof visible).toBe('boolean')`) was tautological precisely
    // because it had to tolerate either outcome — it never actually knew
    // whether the visitor was logged out.
    //
    // Fix is the mechanism, not the assertion — and a bare `browser.newContext()`
    // is NOT enough either. Measured live: Playwright inherits the project's
    // `use: { storageState: 'e2e/.auth/user.json' }` as the DEFAULT for any
    // `newContext()` call made through the test's `browser` fixture, not just
    // the auto-created `page`. An empty-options `newContext()` came back with
    // the signed-in `firebase:authUser:...` localStorage key already present.
    // Only an EXPLICIT blank storageState overrides that default and produces
    // a genuinely unauthenticated context.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto(`/@${PUBLIC_PROFILE_USERNAME}`);
    await page.waitForLoadState('domcontentloaded');

    // Confirm the profile actually loaded (real negative, not "nothing
    // rendered so naturally there's no button either").
    await expect(page.locator('h1').first()).toHaveText(`@${PUBLIC_PROFILE_USERNAME}`, { timeout: 10_000 });

    const contactBtn = page.getByRole('button', { name: /contact|contactar/i });
    await expect(contactBtn).toBeHidden();

    await context.close();
  });

  test('non-existent username shows user-not-found state', async ({ userProfilePage }) => {
    await userProfilePage.goto('zzznonexistentuserzzz');

    await expect(userProfilePage.notFoundMessage).toBeVisible({ timeout: 10_000 });
  });

  test('logged-in user viewing own profile sees different UI', async ({ userProfilePage, page }) => {
    // Realistic navigation (see file-header comment): land on an already-
    // authenticated page first, then reach the own profile via the real
    // in-app popover link — a client-side route change, not a full reload —
    // so authStore.user is already populated when UserProfileView mounts.
    await page.goto('/collection');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: userProfilePage.viewPublicProfileLabel }).click();
    await page.getByRole('link', { name: userProfilePage.viewPublicProfileLabel }).click();

    await expect(page).toHaveURL(new RegExp(`/@${OWN_PROFILE_USERNAME}$`));
    await expect(userProfilePage.username).toHaveText(`@${OWN_PROFILE_USERNAME}`, { timeout: 10_000 });

    // Own profile: wishlist link instead of a contact button (UserProfileView.vue
    // isOwnProfile branch) — this is the actual "different UI" the title promises.
    await expect(userProfilePage.wishlistLink).toBeVisible({ timeout: 10_000 });
    await expect(userProfilePage.contactButton).toBeHidden();
  });
});
