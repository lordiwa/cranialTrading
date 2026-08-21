import { test, expect } from '../../fixtures/test';

// TASK-267: dev was wiped entirely on 2026-08-21 (all prior accounts gone,
// including 'rafael_m'/'rafamoose'). It now holds exactly ONE account,
// created and measured fresh for this purpose:
//
// - 'qa_mtg' (email qa@cranialtrading.com, uid
//   90PkdmyFKrVm1RLDXjInJdlYXy73, TEST_USER_A_*): the account the whole
//   suite authenticates as (e2e/auth.setup.ts) AND the only account with a
//   populated public profile — 1,878 cards, all status='sale', all public,
//   measured via Admin SDK and the browser 2026-08-21. Because there is only
//   one account, it now serves BOTH roles this file used to split across two
//   usernames: "somebody ELSE's public profile" tests and "own profile"
//   tests both target it.
//
// Historical context, kept because it explains why some tests below are
// written the way they are (anchoring on real text, not "something
// rendered"), NOT because it still describes live data:
// - TASK-256 found that resolveUsernameToUid() trusts the /usernames/{norm}
//   index pointer without checking the resolved doc's `username` field
//   still matches — an orphaned index entry could make a profile silently
//   render the WRONG account under the requested URL. That underlying
//   production bug was reported, not fixed, and is unrelated to the
//   account wipe. A live example of the same shape now exists as
//   /usernames/qa (TASK-268, kept deliberately as evidence — do not delete
//   it, and do not use 'qa' as a "username that doesn't exist" fixture).
// - TASK-258 found that a prior "own profile 404s on direct navigation"
//   symptom was a dev-fixture bug (unnormalized username casing), not a
//   real onMounted/auth-restore race — hence this file navigates straight
//   to the own-profile URL below instead of detouring through the
//   UserPopover.
const PUBLIC_PROFILE_USERNAME = 'qa_mtg';
const OWN_PROFILE_USERNAME = 'qa_mtg';

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
