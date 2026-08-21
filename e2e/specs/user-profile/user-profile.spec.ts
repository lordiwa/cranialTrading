import { test, expect } from '../../fixtures/test';

// TASK-256. Which account each test targets, and why:
//
// - 'rafael_m' (uid yoU2gaJARfe72oW7GK2GkQxSgCe2): the ONLY dev account with a
//   real, populated public profile (3,211 cards), measured 2026-08-20. Used by
//   every test that looks at somebody ELSE's public profile.
// - 'rafamoose' (uid jV6gJqf3csPA4vRfO2k9Vb5ejYo2, TEST_USER_A_EMAIL): the
//   account the whole suite authenticates as (e2e/auth.setup.ts). Used ONLY by
//   the "own profile" tests.
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
// TASK-258: this file used to detour the "own profile" test through the
// UserPopover click instead of a raw `page.goto` to the profile URL, with a
// long comment claiming a real onMounted/auth-restore race caused any direct
// navigation to 404. That claim was measured FALSE (TASK-258 orchestrator
// comment, 2026-08-21): an anonymous visitor who never had a session 404'd on
// the exact same URL, which a session-restore race cannot explain. The real
// cause was a dev-only fixture bug — `/usernames/RafaMoose` and
// `users.username` were both stored unnormalized ("RafaMoose" instead of
// "rafamoose"), so `resolveUsernameToUid`'s normalized lookup and its legacy
// fallback both missed it. Production had zero such cases. The fixture is
// repaired (dev now has `/usernames/rafamoose` and a normalized
// `users.username`), so the detour is gone — see the "own profile loads via
// direct URL" test below, which is the scenario the detour used to hide:
// bookmarking or refreshing on your own profile.
const PUBLIC_PROFILE_USERNAME = 'rafael_m';
const OWN_PROFILE_USERNAME = 'rafamoose';

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

  test('own profile loads via direct URL navigation (bookmark / refresh)', async ({ userProfilePage, page }) => {
    // TASK-258 AC1. The exact scenario the old popover detour hid: a full
    // browser navigation straight to the own-profile URL, the same thing a
    // bookmark, a shared link, or F5 on the profile page does. This must
    // actually load the right profile, not just respond with SOME page —
    // asserting the h1 text against the requested username, not a bare
    // toBeVisible, is what would have caught the old bug (it 404'd instead).
    await page.goto(`/@${OWN_PROFILE_USERNAME}`);
    await expect(userProfilePage.username).toHaveText(`@${OWN_PROFILE_USERNAME}`, { timeout: 10_000 });
    await expect(userProfilePage.notFoundMessage).toBeHidden();
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
