import { test, expect } from '../../fixtures/test';
import { adminUnavailableReason, getTestAdmin } from '../../helpers/admin';
import { SEARCH_TERMS } from '../../helpers/test-data';

test.describe('Preferences (Wishlist) CRUD', () => {
  test.beforeEach(async ({ preferencesPage }) => {
    await preferencesPage.goto();
  });

  test('WANTED filter shows wishlist cards section', async ({ preferencesPage, page }) => {
    // Verify WANTED filter is active (highlighted)
    await expect(preferencesPage.wantedFilter).toBeVisible();
    await expect(page).toHaveURL(/\/collection/);
  });

  // TASK-271: this test used to create a real "Lightning Bolt" wishlist card
  // and never delete it — MEASURED by the orchestrator against dev: two
  // such cards, ids 6eeOJUGGc30w4q3IbJ3y (20:49:31Z) and ybwMo29QyYUJ0OMw0M5w
  // (23:49:33Z), one per run, no exceptions. Cleanup reuses
  // `e2e/helpers/admin.ts`'s `deleteCards(ids)` (TASK-240/TASK-238) rather
  // than a new deletion path — it removes the card_index entry too, not
  // just the document, so it can't manufacture the phantom-index damage
  // class TASK-238 is about. Deleted by the exact id this run created, found
  // by polling (not a single snapshot: the success toast is not proof the
  // write reached the server — the same reasoning collection-crud.spec.ts's
  // "add card" teardown documents) — never by grid position.
  test('add wishlist card via add card modal → appears in WANTED', async ({ preferencesPage, commonPage, page }) => {
    const admin = await getTestAdmin();
    test.skip(admin === null, `TASK-271: no admin teardown available — ${adminUnavailableReason()}`);
    if (!admin) return;

    const before = await admin.docFields();
    const beforeIds = new Set(Object.keys(before.quantities));
    const addedName = SEARCH_TERMS.common.toLowerCase();

    await preferencesPage.openAddCardModal();
    await preferencesPage.addModal.searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await preferencesPage.addModal.searchInput.fill(SEARCH_TERMS.common);
    await preferencesPage.addModal.searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Review MEDIUM-2: this used to wrap the whole body in
    // `if (resultCount > 0)`, so a 0-result search made the test pass GREEN
    // without creating or deleting anything — exercising nothing while
    // looking like a pass. The sibling "delete a wishlist card" test got a
    // loud `test.skip` for the identical condition in the same commit;
    // leaving this one silent was an inconsistency worse than the gap
    // itself, since it invites copying the wrong half next time.
    const resultCount = await preferencesPage.addModal.resultCards.count();
    test.skip(resultCount === 0, `TASK-271: search for "${SEARCH_TERMS.common}" returned no results, nothing to add`);

    await preferencesPage.addModal.resultCards.first().click({ force: true });
    await page.waitForTimeout(500);
    // Set status to wishlist via the status chip group (v2 redesign — see AddCardModal.vue)
    await preferencesPage.addModal.statusChipWishlist.waitFor({ state: 'visible', timeout: 5000 });
    await preferencesPage.addModal.statusChipWishlist.click();
    await expect(preferencesPage.addModal.statusChipWishlist).toHaveAttribute('aria-pressed', 'true');
    await preferencesPage.addModal.saveButton.click();
    await commonPage.waitForToast('success');

    let created: string[] = [];
    const deadline = Date.now() + 15_000;
    for (;;) {
      const now = await admin.docFields();
      created = Object.keys(now.quantities).filter(
        (id) => !beforeIds.has(id) && (now.names[id] ?? '').toLowerCase() === addedName,
      );
      if (created.length > 0 || Date.now() > deadline) break;
      await page.waitForTimeout(2000);
    }
    // Reddens rather than leaking silently: if the toast fired but no
    // matching new doc ever showed up, this run's card is still out there
    // somewhere the teardown didn't find it, and staying green would hide
    // that (TASK-240's whole premise: a toast is not proof of a write).
    expect(created.length, 'TASK-271: could not find the card this run created to clean it up').toBeGreaterThan(0);
    await admin.deleteCards(created);

    // The sensor: deleteCards() returning without throwing is not proof it
    // deleted anything — same TASK-240 premise as everywhere else in this
    // suite. Re-check by the same ids this run captured.
    const after = await admin.docFields();
    const stillThere = created.filter((id) => id in after.quantities);
    expect(stillThere, 'TASK-271: card(s) this run created were not actually deleted').toEqual([]);
  });

  // TASK-271: this test used to click `cards.first()` in the grid — POSITIONAL
  // selection, the exact pattern TASK-240 measured deleting an unrelated
  // fixture instead of the intended target. It also demonstrably didn't work:
  // the account accumulated two leaked "Lightning Bolt" wishlist cards from
  // the sibling test above while this one ran alongside it, so whatever it
  // was deleting, it wasn't reliably those.
  //
  // Rewritten to be self-contained and non-positional: this test now creates
  // its OWN wishlist card first (a distinct search term, `Counterspell` —
  // deliberately different from `SEARCH_TERMS.common` used by the sibling
  // test, so this run's card can be found in the grid by NAME without
  // colliding with the "Lightning Bolt" cards already sitting in the account
  // from prior leaked runs; AC9's cleanup of that existing pollution is
  // separate and intentionally not done here). It captures the created
  // doc's id via the same admin poll the sibling test uses, locates the grid
  // card by that name (identity, not position), and exercises the real
  // delete flow through the UI — which is the point of this test. A guaranteed
  // cleanup via `admin.deleteCards([id])` in `finally` closes the gap if the
  // UI delete ever silently no-ops (idempotent: deleteCards checks existence
  // first, so it is a no-op when the UI delete already succeeded).
  test('delete a wishlist card from the collection', async ({ preferencesPage, commonPage, page }) => {
    const admin = await getTestAdmin();
    test.skip(admin === null, `TASK-271: no admin teardown available — ${adminUnavailableReason()}`);
    if (!admin) return;

    const deleteTestCardName = 'Counterspell';
    const before = await admin.docFields();
    const beforeIds = new Set(Object.keys(before.quantities));

    // Review MEDIUM-1: targeting later by name only works while exactly one
    // card has this name. A stray Counterspell already sitting in the
    // wishlist (e.g. a prior run of THIS test going red after creating its
    // card but before this ticket moved the "found it" assert inside
    // try/finally, below) would make that ambiguous — `.first()` could grab
    // the bystander instead of the one this run creates, delete IT through
    // the real UI path, and leave the actual card this run made to be
    // cleaned up only by the admin fallback: the test would report green
    // having silently deleted someone else's card without ever really
    // exercising the delete flow it claims to test. Redden here, before
    // creating anything, rather than let that ambiguity happen.
    //
    // Checked on-screen, not via `admin.docFields()`: that projection has no
    // `status` field, so it can't distinguish a wishlist Counterspell from
    // an unrelated one sitting in this account's sale inventory (this
    // account's two "Counterspell" sale rows are exactly that — real,
    // unrelated, and not a leak). `preferencesPage.goto()` already applied
    // the WANTED filter, so the on-screen grid is wishlist-only by construction.
    const preExistingOnScreen = page.getByText(deleteTestCardName, { exact: true });
    await expect(
      preExistingOnScreen,
      `TASK-271: a stray "${deleteTestCardName}" already exists in the wishlist view — targeting by name would be ambiguous`,
    ).toHaveCount(0);

    await preferencesPage.openAddCardModal();
    await preferencesPage.addModal.searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await preferencesPage.addModal.searchInput.fill(deleteTestCardName);
    await preferencesPage.addModal.searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // MEASURED: run right after the sibling "add wishlist card" test (which
    // also hits Scryfall's live search), this search can come back with 0
    // results — verified this is not a timing race (input value is correct,
    // no modal/state carryover, a retry after another 3s still returns 0)
    // and not specific to this test in isolation (passes reliably alone).
    // AddCardModal.vue's searchCards() call swallows its error into an empty
    // result set with no visible error (`catch { searchResults.value = [] }`,
    // AddCardModal.vue:381), so a live Scryfall hiccup — most plausibly
    // rate-limiting after two real searches back-to-back from the same CI
    // machine — surfaces as silence, not a diagnosable failure. Same shape
    // as the two flakes CLAUDE.md's "Known flaky specs" line already
    // documents for other live-API-dependent specs in this suite. One retry
    // still covers a genuine short timing race; skipping loudly beats
    // creating a document this run can't find to clean up.
    let resultCount = await preferencesPage.addModal.resultCards.count();
    if (resultCount === 0) {
      await page.waitForTimeout(3000);
      resultCount = await preferencesPage.addModal.resultCards.count();
    }
    test.skip(resultCount === 0, `TASK-271: search for "${deleteTestCardName}" returned no results, nothing to delete`);
    await preferencesPage.addModal.resultCards.first().click({ force: true });
    await page.waitForTimeout(500);
    await preferencesPage.addModal.statusChipWishlist.waitFor({ state: 'visible', timeout: 5000 });
    await preferencesPage.addModal.statusChipWishlist.click();
    await expect(preferencesPage.addModal.statusChipWishlist).toHaveAttribute('aria-pressed', 'true');
    await preferencesPage.addModal.saveButton.click();
    await commonPage.waitForToast('success');

    let created: string[] = [];
    const findDeadline = Date.now() + 15_000;
    for (;;) {
      const now = await admin.docFields();
      created = Object.keys(now.quantities).filter(
        (id) => !beforeIds.has(id) && (now.names[id] ?? '').toLowerCase() === deleteTestCardName.toLowerCase(),
      );
      if (created.length > 0 || Date.now() > findDeadline) break;
      await page.waitForTimeout(2000);
    }

    try {
      // Review MEDIUM-1 (b): this used to sit BEFORE try/finally. Moved in
      // so every exit from here on — this assert included — goes through
      // the same finally, rather than a failed poll skipping cleanup
      // entirely (though with `created` empty in that case there is nothing
      // for deleteCards to target either way; the point is consistency of
      // control flow, not a new cleanup path).
      expect(created.length, 'TASK-271: could not find the card this run created, cannot test deleting it').toBeGreaterThan(0);

      // Locate THIS run's card by name (identity), not by grid position.
      // MEASURED (this ticket): with a single WANTED card the grid renders
      // `CollectionGridCardFull.vue` — its DELETE button is inline on the
      // card itself, there is no CardDetailModal in this layout, and the
      // DELETE button is a SIBLING of the card's `data-testid="collection-
      // card"` image row within the same outer `.group.relative` wrapper
      // (CollectionGridCardFull.vue's root `<div class="group relative">`),
      // not a descendant of it. Starting from the paragraph that names the
      // card and walking up to that shared wrapper scopes the DELETE click
      // to THIS card's own button, never a bystander's.
      //
      // Review MEDIUM-1 (a): one-line uniqueness guard right before the
      // click — on top of the pre-existing-bystander check above, which
      // only covers what existed before this run started. This confirms
      // exactly one match is on screen at the moment of targeting; more
      // than one means `.first()` below cannot be trusted to be OUR card.
      const matchingCards = page.getByText(deleteTestCardName, { exact: true });
      await expect(matchingCards, `TASK-271: expected exactly one "${deleteTestCardName}" card on screen before deleting`).toHaveCount(1, { timeout: 10_000 });
      const cardName = matchingCards.first();
      const cardWrapper = cardName.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ") and contains(concat(" ", normalize-space(@class), " "), " relative ")][1]');
      const deleteBtn = cardWrapper.getByRole('button', { name: /delete|eliminar/i });
      await deleteBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await deleteBtn.click();
      await commonPage.confirmAction();
      await commonPage.waitForToast('success');
    } finally {
      // Guaranteed cleanup regardless of whether the UI delete above
      // actually landed — idempotent, so a successful UI delete makes this
      // a no-op (deleteCards checks existence before deleting).
      await admin.deleteCards(created);

      // The sensor: same as the sibling test, re-check by id rather than
      // trust that deleteCards() (or the UI delete before it) returning
      // without throwing means something was actually removed.
      const after = await admin.docFields();
      const stillThere = created.filter((id) => id in after.quantities);
      expect(stillThere, 'TASK-271: card this run created was not actually deleted').toEqual([]);
    }
  });

  test('cancel add card modal without saving', async ({ preferencesPage }) => {
    await preferencesPage.openAddCardModal();
    await preferencesPage.addModal.searchInput.waitFor({ state: 'visible', timeout: 5000 });
    // Close without saving
    const closeBtn = preferencesPage.addModal.cancelButton;
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    }
    await preferencesPage.page.waitForTimeout(500);
  });

  test('status filter shows only wishlist cards', async ({ preferencesPage, page }) => {
    // WANTED filter should already be active from goto()
    // Verify the filter badge or heading indicates wishlist
    const wantedText = page.locator('text=/WANTED|wishlist|deseado/i');
    await expect(wantedText.first()).toBeVisible({ timeout: 5000 });
  });
});
