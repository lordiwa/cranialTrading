import { test, expect } from '../../fixtures/test';
import { SEARCH_TERMS } from '../../helpers/test-data';

// TASK-146: deliberately obscure, not SEARCH_TERMS.common ("Lightning Bolt")
// or another format staple — this CI account has 25+ pre-existing entries for
// Lightning Bolt alone (and a dozen-plus for "Giant Growth", tried first —
// see git history), which is exactly the ambiguity the "edit card" fixture
// below needs to avoid: it must be the ONLY match for its own name, both
// right after adding it and again after a full page reload, so re-finding it
// needs no identity/edition disambiguation at all. Femeref Knight (Mirage) is
// a real, virtually never-played card — verified empirically to have zero
// pre-existing matches in this account before relying on it here.
const EDIT_FIXTURE_CARD_NAME = 'Femeref Knight';

test.describe('Collection CRUD', () => {
  // The default 45s test timeout (playwright.config.ts) is shared by the
  // beforeEach's goto() AND the rest of the test body. On the CI account
  // (41k+ cards) the grid's first real row alone can take 20-27s to mount
  // locally — slower CI runners push that close to or past 45s, which would
  // make waitForGridReady's 60s ceiling unreachable and turn a real timeout
  // into invisible flake instead of a hard red (TASK-145 rebote 2 / MEDIUM).
  // Scoped to this file only — NOT raised in playwright.config.ts, which
  // would mask regressions in the other ~128 tests.
  test.setTimeout(90_000);

  test.beforeEach(async ({ collectionPage }) => {
    await collectionPage.goto();
  });

  test('collection page loads with card grid visible @smoke', async ({ collectionPage, page }) => {
    await expect(page).toHaveURL(/\/collection/);
    await expect(collectionPage.statusFilters).toBeVisible();
  });

  test('add card: open modal → search → select → save → card appears', async ({ collectionPage, commonPage }) => {
    await collectionPage.openAddCardModal();
    await collectionPage.addModal.searchInput.waitFor({ state: 'visible' });
    await collectionPage.addModal.searchInput.fill(SEARCH_TERMS.common);
    await collectionPage.addModal.searchInput.press('Enter');

    // Wait for results
    await collectionPage.page.waitForTimeout(3000);
    await collectionPage.addModal.resultCards.first().waitFor({ state: 'visible', timeout: 10_000 });
    await collectionPage.addModal.resultCards.first().click({ force: true });

    // Fill form and save
    await collectionPage.page.waitForTimeout(500);
    await collectionPage.addModal.quantityInput.waitFor({ state: 'visible' });
    await collectionPage.addModal.quantityInput.fill('1');
    await collectionPage.addModal.saveButton.click();

    await commonPage.waitForToast('success');

    // Cleanup — net-zero doc count, not literal-fixture deletion: the shared
    // CI collection already has 25+ pre-existing "Lightning Bolt" entries
    // (different printings), and card_index writes are eventually consistent
    // (optimistic patch + deferred refresh — see the card_index persist race
    // pattern), so there's no reliable UI signal within a single test to pick
    // out exactly the doc we just created; a name-filtered search can't tell
    // it apart from the pre-existing duplicates either. Deleting whatever
    // card is at grid index 0 — the exact same delete path the "delete card"
    // test below uses — keeps the doc count net-zero for this run instead:
    // the collection composition rotates by one card per run rather than
    // growing without bound, which is the failure mode actually being
    // guarded against.
    //
    // Best-effort by design ("leak, don't redden"): the whole block is
    // wrapped in try/catch so a stuck toast overlay or CI-only timing hiccup
    // here never fails the test above it, which already passed its real
    // assertions. At worst this leaves one extra card in the shared CI
    // collection for a later run's cleanup to rotate back out.
    try {
      // Toasts use v-show (display:none, not DOM removal) and the
      // success-toast locator is a known CI flake source (matches stale,
      // already-hidden toasts — see CLAUDE.md's E2E flake notes), so don't
      // wait on that locator here. Just wait out the documented ~4s
      // auto-dismiss window so the toast isn't still overlaying the grid
      // when clickCardInGrid(0) runs below.
      await collectionPage.page.waitForTimeout(4500);
      const cardCount = await collectionPage.getCardCount();
      if (cardCount > 0) {
        // TASK-146: this used to open the detail modal and look for a
        // deleteButton there — CardDetailModal.vue's v2 redesign has no such
        // button, so that locator never matched and this cleanup silently
        // no-op'd on every run (a real leak, not the accepted one-card leak
        // the comment above describes). The delete affordance lives on the
        // grid card itself; confirm goes through the separate ConfirmModal.
        await collectionPage.deleteButtonInGrid(0).click();
        await commonPage.confirmAction();
        await commonPage.waitForToast('success');
      }
    } catch {
      // Swallow — accepted leak of at most one card this run.
    }
  });

  // TASK-146 AC2 — SCOPE NARROWED, criterion not honestly met today; tracked
  // separately as TASK-155, not solved here. Do not "fix" this with a fixed
  // wait — that's the exact anti-pattern this whole ticket exists to remove.
  //
  // AC2 as written demands asserting quantity persistence against a real
  // page.reload(). That's meaningful because updateCard() (collection.ts)
  // writes the CARD doc immediately (fast — the success toast fires right
  // after) but the LISTING/SEARCH index write is a separate, debounced
  // (2s) background job with NO observable UI completion signal — and,
  // discovered here: updateCard() deliberately does NOT call
  // refreshCurrentPage() the way addCard()/deleteCard() do (TASK-113;
  // `_pendingMembershipRefresh` is only set by add/delete, never update —
  // collection.ts:791,1057,1236, absent from updateCard). So there is no
  // in-page signal to poll for "the edit's index write finished", and
  // reloading before that unobserved write completes doesn't just read
  // stale data — it CANCELS the pending write outright (page.reload() kills
  // the pending JS timer). A fixed wait "long enough" is exactly a guess
  // that sometimes passes and sometimes doesn't: flake that HIDES this gap
  // instead of surfacing it, which is worse than not having the test.
  //
  // Product-level implication (why this belongs in a real ticket, not a
  // sleep): a user who edits a quantity and reloads soon after could see
  // the OLD value in the grid/search — even though the card doc itself
  // saved correctly — because the listing index update behind it can be
  // silently lost. Flow #3 (editar/borrar carta), business-priority #3.
  //
  // What IS covered here, honestly: the add flow's OWN persistence uses the
  // observable signal that DOES exist (addCard() sets
  // `_pendingMembershipRefresh`, and once its index write finishes it calls
  // refreshCurrentPage() on its own — polling cardName(0) for that re-sort,
  // no reload, no guessed wait). That is real, verified, mutation-provable
  // coverage for UC-07's "add" half; it just isn't what AC2 asked for.
  test.fixme(
    'edit card: change quantity → save → reload → change persists (blocked by TASK-155)',
    async () => {
      // Intentionally not implemented. See the comment block above and
      // TASK-155 (the listing index has no completion signal for updateCard,
      // unlike addCard/deleteCard — that's a product gap, not a test gap).
    },
  );

  // TASK-146: identity-based, not count-based (reviewer finding on TASK-145's
  // rebote). On a 41k-card window-virtualized grid, deleting one card doesn't
  // durably drop getCardCount() — the virtualizer refills the visible window
  // right behind it, so a count poll can pass by catching a transient
  // mid-remount state instead of the real removal. What IS durable is WHICH
  // card sits at index 0: after a real delete it's a different card (or the
  // grid is empty); after the mutation below it's still the same one.
  //
  // Mutation used to prove this test can fail: src/stores/collection.ts
  // `deleteCard` → `return true` immediately (mirrors the ticket's M1 for
  // updateCard — skips both the optimistic UI removal and the Firestore
  // delete). With it, the confirm flow still shows a false "eliminada"
  // success toast (deleteResult.value is hardcoded true in
  // CollectionView.handleDelete) but nothing actually leaves the grid, so
  // this test's identity assertion fails; reverting makes it pass — verified
  // both ways (see commit message for the run evidence).
  test('delete card: click delete on grid card → confirm → card removed', async ({ collectionPage, commonPage }) => {
    const cardCount = await collectionPage.getCardCount();
    expect(cardCount).toBeGreaterThan(0);

    const identityBefore = await collectionPage.cardIdentity(0);
    expect(identityBefore).not.toBe(' :: ');

    // No detail modal in this flow — CardDetailModal.vue has no delete
    // affordance (TASK-146); delete lives on the grid card itself.
    await collectionPage.deleteButtonInGrid(0).click();
    await commonPage.confirmAction();
    await commonPage.waitForToast('success');

    await expect.poll(() => collectionPage.cardIdentity(0)).not.toBe(identityBefore);
  });

  // TASK-147: this whole chain used to live inside nested
  // `if (await X.isVisible(...).catch(() => false))` guards with no `expect`
  // anywhere in the body — if any guard failed, the rest silently skipped and
  // the test still went green (proved by mutation: `batchUpdateCards` → return
  // `true` immediately passed 2/2). Two dead locators were part of why the
  // guards failed on this v2 grid: `input[type="checkbox"]` never matched —
  // CollectionGridCardFull.vue's selection affordance is a plain `<div>`
  // overlay, not a real checkbox input, so clicking the grid card itself
  // (which toggles selection via `handleCardActivate` when `selectionMode` is
  // true) is the only real path — and the delete button's old regex
  // (`/delete all|eliminar/i`) never matched the real "DELETE {count}" /
  // "ELIMINAR {count}" label either. Both are now targeted with the
  // `data-testid`s added to BulkSelectionActionBar.vue instead of guessing text.
  //
  // Assertion strategy — course-corrected TWICE on this exact test (both
  // regressions found by re-verification runs, not by design up front):
  // the toast fires on `ok === true` regardless of whether the mutation is
  // in place (the mutated `batchUpdateCards` returns `true` immediately
  // without touching `cards.value`), so a toast check alone can't
  // distinguish real persistence from the no-op mutation. The first replace-
  // ment — re-opening CardDetailModal to read `statusDistribution` — was
  // dropped as unreliable. The second — the grid card's own status badge at
  // index 0 — looked solid (passed 7/7 across two repeat-each=2 runs) but
  // then failed on a THIRD, independent verification run: over the ~30s
  // this test takes, index 0 on this virtualized grid can drift to a
  // genuinely different card from background pagination settling (the same
  // root cause documented on the bulk-delete test below, which this test
  // predates the fix on). Position-based checks on this grid are not
  // provably stable no matter how they're phrased. `statusChipCount()` —
  // the status filter chips' counts — has no such dependency: it's a
  // page-level number computed off the full `collectionStore.cards` array
  // (`statusCounts` in CollectionView.vue), nothing to do with which row a
  // virtualizer renders where.
  test('bulk select → bulk change status to Sale → status counts move in the store, not just the toast', async ({ collectionPage, commonPage }) => {
    // Start from a card known to be status=collection so the "before" state
    // is unambiguous (A4: starting state declared).
    await collectionPage.filterByStatus('collection');
    const cardCount = await collectionPage.getCardCount();
    expect(cardCount).toBeGreaterThan(0);

    const collectionCountBefore = await collectionPage.statusChipCount('collection');
    const availableCountBefore = await collectionPage.statusChipCount('available');
    expect(collectionCountBefore).toBeGreaterThan(0);

    await collectionPage.selectModeButton.click();
    await collectionPage.clickCardInGrid(0);
    await expect(collectionPage.gridCards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    await collectionPage.bulkStatusButton('sale').click();
    await commonPage.waitForToast('success');

    // Real assertion: the card's own status actually changed in the store —
    // the mutated `batchUpdateCards` never touches `cards.value`, so these
    // counts would stay exactly where they started under the mutation.
    await expect.poll(() => collectionPage.statusChipCount('collection')).toBe(collectionCountBefore - 1);
    await expect.poll(() => collectionPage.statusChipCount('available')).toBe(availableCountBefore + 1);

    // Restore (A4): move the same card back to its original status so this
    // run doesn't leave unbounded drift on the shared dev collection.
    await collectionPage.selectModeButton.click();
    await collectionPage.clickCardInGrid(0);
    await collectionPage.bulkStatusButton('collection').click();
    await commonPage.waitForToast('success');

    await expect.poll(() => collectionPage.statusChipCount('collection')).toBe(collectionCountBefore);
    await expect.poll(() => collectionPage.statusChipCount('available')).toBe(availableCountBefore);
  });

  // TASK-147: total-count based, NOT identity-at-index-0 — course-corrected
  // after an identity-based version of this exact test turned out to be a
  // FALSE GREEN under its own mutation. Root cause: index 0 on this
  // virtualized grid can change to a genuinely different card over the
  // ~30s a full test takes, from background card_index/pagination settling —
  // a change entirely unrelated to whether OUR delete actually ran. That drift
  // was enough on its own to make `cardIdentity(0)` differ before vs. after,
  // so the mutated `batchDeleteCards` (no-op, deletes nothing) still passed
  // 1/1 when tried. `totalCardCount()` (the nav badge, driven by the full
  // `collectionStore.cards` array) has no such position dependency: a no-op
  // delete leaves it exactly unchanged, so this is the assertion that
  // actually depends on the deletion having happened.
  test('bulk select → bulk delete → confirm → selected card removed', async ({ collectionPage, commonPage }) => {
    const cardCount = await collectionPage.getCardCount();
    expect(cardCount).toBeGreaterThan(0);

    const countBefore = await collectionPage.totalCardCount();
    expect(countBefore).toBeGreaterThan(0);

    await collectionPage.selectModeButton.click();
    await collectionPage.clickCardInGrid(0);
    await expect(collectionPage.gridCards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    await collectionPage.bulkDeleteButton.click();
    await commonPage.confirmAction();
    await commonPage.waitForToast('success');

    // Mutation used to prove this test can fail: `batchDeleteCards` →
    // returns `{ success: true, deleted: cardIds.length, failed: 0 }`
    // immediately, without touching `cards.value`/`paginatedCards.value` or
    // Firestore — its own seam, distinct from the single-card `deleteCard`
    // mutation, per AC2.
    await expect.poll(() => collectionPage.totalCardCount()).toBe(countBefore - 1);
  });

  // TASK-147 AC5: the secondary "bulk delete cancelled" path was declared
  // covered in docs/CASOS-DE-USO.html and did not exist — the bulk delete
  // test above confirms, it never cancelled. This is that missing test.
  // Anchored to a page-level TOTAL, not a grid position (course-corrected
  // after position-based attempts here proved unreliable — TASK-147): even
  // reading grid index 0 only after entering selection mode, with a
  // stability-polling identity read, "before" and "after" identity at index
  // 0 still didn't reliably refer to the same card across a cancel with no
  // real mutation involved. `totalCardCount()`
  // (the nav badge, driven by the full `collectionStore.cards` array, not
  // the virtualized/paginated grid) sidesteps that whole class of problem —
  // it's a single page-level number, nothing to do with which row a
  // virtualizer happens to render at position 0. It's still a falsifiable
  // assertion: if `cancelAction()` mis-clicked CONFIRM instead of CANCEL (or
  // handleBulkDelete didn't actually gate on the confirm result), the count
  // would drop by exactly 1, same as the real delete in the test above.
  test('bulk select → bulk delete → cancel confirm → selection and count intact', async ({ collectionPage, commonPage }) => {
    const cardCount = await collectionPage.getCardCount();
    expect(cardCount).toBeGreaterThan(0);

    const countBefore = await collectionPage.totalCardCount();
    expect(countBefore).toBeGreaterThan(0);

    await collectionPage.selectModeButton.click();
    await collectionPage.clickCardInGrid(0);
    await expect(collectionPage.gridCards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    await collectionPage.bulkDeleteButton.click();
    await commonPage.cancelAction();

    await expect.poll(() => collectionPage.totalCardCount()).toBe(countBefore);

    // handleBulkDelete returns early on `!confirmed`, before touching
    // selectionMode/selectedCardIds — selection survives a cancelled confirm.
    await expect(collectionPage.gridCards.nth(0)).toHaveAttribute('aria-pressed', 'true');
  });

  // TASK-146: identity-based, not count-based (reviewer finding on TASK-145's
  // rebote). On a 41k-card window-virtualized grid, deleting one card doesn't
  // durably drop getCardCount() — the virtualizer refills the visible window
  // right behind it, so a count poll can pass by catching a transient
  // mid-remount state instead of the real removal. What IS durable is WHICH
  // card sits at index 0: after a real delete it's a different card (or the
  // grid is empty); after the mutation below it's still the same one.
  test('cancel deletion from confirm dialog leaves card intact', async ({ collectionPage, commonPage }) => {
    const cardCount = await collectionPage.getCardCount();
    expect(cardCount).toBeGreaterThan(0);

    const identityBefore = await collectionPage.cardIdentity(0);
    expect(identityBefore).not.toBe(' :: ');

    await collectionPage.deleteButtonInGrid(0).click();
    await commonPage.cancelAction();

    const identityAfter = await collectionPage.cardIdentity(0);
    expect(identityAfter).toBe(identityBefore);
  });
});
