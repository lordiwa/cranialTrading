import { test, expect } from '../../fixtures/test';
import { adminUnavailableReason, getTestAdmin } from '../../helpers/admin';
import { findIncoherent } from '../../helpers/coherence';
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

  // TASK-240 — this test's cleanup is an ADMIN TEARDOWN, not a UI delete, and
  // it REDDENS. Both of those are deliberate reversals of earlier decisions;
  // the reasons are measured, and recorded here so they are not undone by
  // someone reading only the old comments.
  //
  // WHY NOT THE UI (reverses "delete whatever is at grid index 0"). Measured
  // 2026-08-17 over three runs with a full before/after Firestore snapshot
  // diffed BY DOCUMENT ID:
  //   - run A (cleanup exactly as it shipped): all three UI steps —
  //     deleteButtonInGrid(0).click(), confirmAction(), waitForToast('success')
  //     — completed without throwing, and ZERO documents were deleted. The
  //     account went 260 -> 261 docs. So the old try/catch was not swallowing
  //     an exception at all; there was nothing to swallow. Both standing
  //     hypotheses (a dead locator like TASK-146, an overlay intercepting the
  //     click) are refuted by that run.
  //   - The real defect is the TARGET. `card_index` is what the grid is built
  //     and sorted from, and a freshly added card frequently never reaches it
  //     (TASK-234). When it doesn't, the created card is not on screen at all,
  //     grid index 0 is a BYSTANDER, and the cleanup deletes that instead. Run
  //     B measured exactly this: index 0 was "Angel's Herald" — one of
  //     TASK-238's deliberately-dirty fixtures — and the cleanup removed its
  //     card_index entry while its document survived. The cleanup was not
  //     merely failing to clean; it was corrupting unrelated data.
  //   - run C, with the delete guarded to fire only when index 0 really was
  //     the just-added printing, deleted the doc and its index entry cleanly.
  //     So the UI delete path itself works. It just cannot be aimed at the
  //     right card while TASK-234 is open.
  //   - Secondary measured hazard, which is why even a correctly-aimed UI
  //     delete is the wrong tool here: `deleteCard` awaits a Cloud Function
  //     (applyCardIndexDelta) BEFORE deleteDoc, while the success toast fires
  //     without awaiting either. With 0s of grace after the toast nothing
  //     landed; with 3s only the index half landed (doc alive, entry gone —
  //     manufacturing a TASK-238-style invisible card); it took ~20s for both
  //     halves. A teardown whose correctness depends on an unobservable
  //     20-second window is not a teardown.
  // Deleting by document id, out of band, is correct whether or not the index
  // write landed, and cannot hit a bystander.
  //
  // WHY IT REDDENS (reverses "leak, don't redden"). That call was made when
  // the cleanup ran through flaky UI, where a failure was as likely to mean
  // "CI timing hiccup" as "real bug", and reddening would have punished a test
  // that had already passed its real assertions. It cost this project two
  // silent failures: TASK-146's dead locator, and this one. The tradeoff is
  // gone now — an admin delete by id has no overlays, no virtualized grid and
  // no toast timing, so a failure here means the account really did keep a
  // document, which is the exact defect the ticket is about. "Warn but stay
  // green" was also tried, implicitly, for two rounds: nobody read the output.
  // The lock below is therefore a real assertion, and it is falsifiable —
  // removing the deleteCards() call makes it fail (TASK-240 AC4).
  test('add card: open modal → search → select → save → card appears', async ({ collectionPage, commonPage }) => {
    // No credentials => no teardown => this test does not run. It creates a
    // real document in a shared account; a run that cannot delete what it
    // creates is precisely the failure mode being fixed, so skipping loudly
    // beats leaking quietly. (CI supplies GOOGLE_APPLICATION_CREDENTIALS from
    // the FIREBASE_SERVICE_ACCOUNT_DEV secret — see .github/workflows/test.yml.)
    const admin = await getTestAdmin();
    test.skip(admin === null, `TASK-240: no admin teardown available — ${adminUnavailableReason()}`);
    if (!admin) return;

    const before = await admin.snapshot();

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

    // ---------- teardown ----------
    // Poll rather than snapshot once: the success toast is not proof the write
    // reached the server (measured above), and a doc that lands AFTER the
    // teardown would leak while the lock still went green. The page is still
    // open here, so the client keeps flushing while we wait.
    //
    // Two possible outcomes, both of which have to be undone. The add creates
    // a NEW doc only when the account has no row for this exact print;
    // otherwise AddCardModal merges into the existing row and bumps its
    // quantity (SCRUM-35 bug #1). Measured on 2026-08-17: both happen across
    // consecutive runs of this very test. A teardown that watched only for new
    // documents would print "nothing to clean" on merge runs while leaving +1
    // quantity behind on every one of them.
    //
    // The rows this teardown is ALLOWED to write (TASK-240 round 4, HIGH-1).
    // A merged add can only ever land on a row of the exact print the modal
    // saved: AddCardModal matches on scryfallId+edition+condition+foil+status.
    // The test does not know which print the first search result was, but it
    // knows the name it searched for, and every print of that card shares it —
    // so the rows of that name are a small superset of the possible merge
    // targets and, crucially, exclude every OTHER card in the account. The
    // teardown's document half is bounded to this set; passing the whole
    // account (the previous round's behaviour) let it revert a card a
    // CONCURRENT run had legitimately changed — measured by the reviewer, on
    // this account, index entry included.
    const addedName = SEARCH_TERMS.common.toLowerCase();
    const printCandidates = before.cardDocIds.filter((id) => (before.names[id] ?? '').toLowerCase() === addedName);

    const beforeIds = new Set(before.cardDocIds);
    let created: string[] = [];
    let bumped: string[] = [];
    const deadline = Date.now() + 30_000;
    for (;;) {
      // docQuantities(), NOT snapshot() (round 4, MEDIUM-2): `created` needs
      // ids and `bumped` needs quantities; neither reads card_index. A full
      // snapshot here re-read every chunk — multi-megabyte on the CI account —
      // up to 15 times inside a test that is already close to its timeout.
      const now = await admin.docQuantities();
      created = Object.keys(now).filter((id) => !beforeIds.has(id));
      // Restricted to the print candidates for the same reason the doc scope
      // is: an unrelated card whose quantity moved during our run moved because
      // SOMEONE ELSE moved it, and treating that as "ours" is what put a third
      // party's write on this teardown's restore list.
      bumped = printCandidates.filter((id) => id in now && now[id] !== before.quantities[id]);
      if (created.length > 0 || bumped.length > 0 || Date.now() > deadline) break;
      await collectionPage.page.waitForTimeout(2000);
    }

    if (created.length === 0 && bumped.length === 0) {
      // Not fatal on its own — the locks below are what decide. Loud because
      // "the add reported success but 30s later the account is unchanged" is a
      // finding either way, and this file's history is one of findings that
      // were never printed anywhere.
      // eslint-disable-next-line no-console
      console.warn('[cleanup][add card] WARNING: no new card document and no quantity change appeared within 30s of the success toast — nothing to undo, and the add may not have persisted.');
    }

    const deleted = await admin.deleteCards(created);
    // Two allow-lists, both narrow, neither of them "the account":
    //  - docScope = the rows of the print this test added. Wide enough to catch
    //    a merge that landed after the poll above gave up (the reason the
    //    document half was kept broad in round 3), narrow enough that it cannot
    //    reach a card of any other name.
    //  - indexScope = `bumped` only. Narrower still, because an index write
    //    compares an entry against a DOCUMENT, and this account holds 25+
    //    Lightning Bolt rows whose entries may legitimately disagree with their
    //    documents already (TASK-208/234 drift, TASK-238 fixtures). Measured on
    //    2026-08-17: an untouched bystander at doc=1 with a seeded entry at q=8
    //    came back rewritten to 1 when this half was broad.
    // `created` is deliberately in neither: those documents are gone by now, and
    // their entries are deleteCards' business.
    const restored = await admin.restoreQuantities(before.quantities, {
      docScope: printCandidates,
      indexScope: bumped,
    });
    // eslint-disable-next-line no-console
    console.log(`[cleanup][add card] created=[${created.join(', ')}] docsDeleted=${deleted.docsDeleted} indexEntriesRemoved=${deleted.indexEntriesRemoved} passes=${deleted.passes} printCandidates=${printCandidates.length} bumped=[${bumped.join(', ')}] quantitiesRestored=[${restored.join(', ')}]`);

    // ---------- THE LOCKS (AC4) ----------
    // All three read straight from Firestore, never from the UI, so none of
    // them can be satisfied by an optimistic patch or a false success toast.
    const after = await admin.snapshot();

    // 1. No leaked document.
    expect(
      after.cardDocCount,
      `[cleanup][add card] LEAK: the account has ${after.cardDocCount} card docs, was ${before.cardDocCount}. created=[${created.join(', ')}]`,
    ).toBe(before.cardDocCount);

    // 2. Nothing this run created may survive anywhere — doc OR index entry.
    //    The second half is not pedantry: an index entry whose document is
    //    gone is a PHANTOM, the damage class TASK-238 tracks, and an earlier
    //    version of this teardown manufactured one by stripping the index
    //    before the client had finished writing it.
    const leftovers = created.filter((id) => after.cardDocIds.includes(id) || after.indexEntryIds.includes(id));
    expect(
      leftovers,
      `[cleanup][add card] LEAK: ids created by this run still present as doc or card_index entry: [${leftovers.join(', ')}]`,
    ).toEqual([]);

    // 3. No quantity drift on pre-existing cards (the merge path).
    //    Deliberately kept GLOBAL even though the teardown's write scope is now
    //    narrow (HIGH-1): this assertion is the net UNDER that narrowing. If the
    //    teardown ever again writes a document outside its allow-list, or fails
    //    to restore one inside it, this is what says so. The cost is a possible
    //    red when a genuinely concurrent run changes an unrelated card — that is
    //    a real, investigable event, and it is strictly better than the silent
    //    overwrite the previous round shipped.
    const drifted = Object.keys(before.quantities)
      .filter((id) => id in after.quantities && after.quantities[id] !== before.quantities[id])
      .map((id) => `${id}: ${before.quantities[id]} -> ${after.quantities[id]}`);
    expect(
      drifted,
      `[cleanup][add card] DRIFT: pre-existing cards changed quantity and were not restored: [${drifted.join('; ')}]`,
    ).toEqual([]);

    // 4. Document <-> card_index coherence, INCLUDING the quantity, over the
    //    cards THIS run touched. Locks 1-3 are all blind to the merge path's
    //    real damage: lock 1 compares document counts (a merge changes none),
    //    lock 2 only looks at ids in `created` (empty on a merge), and lock 3
    //    compares documents against documents — precisely the one half that
    //    restoreQuantities already fixed. Measured 2026-08-17: with teardown
    //    writing only the document, a merge run finished GREEN and left
    //    doc.q=1 / idx.q=2 on a real card, permanently.
    //    Scoped to `created ∪ bumped` on purpose, and to keep the branches
    //    honest the predicate itself lives in helpers/coherence.ts, where
    //    tests/unit/e2e/coherence.test.ts covers every one of them — including
    //    the merge branch, which only fires here on a run that really merged.
    //
    //    ON REBUILDS, precisely. Scoping makes it immune to the app rebuilding
    //    OTHER cards' entries, and a completed rebuild of a touched card is
    //    also fine: a rebuild derives `q` from the document, so it lands on
    //    idx==doc, which SATISFIES this lock. What is NOT immune is a snapshot
    //    taken mid-rebuild: buildCardIndex writes chunks with plain,
    //    untransacted .set()s, one chunk at a time (functions/index.js), so on
    //    a MULTI-CHUNK account a read between two of those writes can see a
    //    touched card's entry missing and trip the "entry vanished" branch. No
    //    tolerance is added for it: this account is one chunk today (measured
    //    2026-08-17), a tolerance would blunt the very branch that catches a
    //    teardown-manufactured invisible card, and the honest fix is the
    //    already-known bug that the app rebuilds the whole index on every page
    //    load. If this ever reds on the CI account, that is the first suspect.
    const touched = [...new Set([...created, ...bumped])];
    const incoherent = findIncoherent(touched, before, after);
    expect(
      incoherent,
      `[cleanup][add card] DIVERGENCE: document and card_index disagree for cards this run touched: [${incoherent.join('; ')}]`,
    ).toEqual([]);

    // Deliberately NOT asserted: a global before/after equality on
    // `card_index` entry COUNT. TASK-240 AC4 asks for one, and it was written
    // first and then removed on evidence: measured 2026-08-17, the app itself
    // rebuilt this account's whole card_index during a run of this spec —
    // 258 entries became 261, five previously-unindexed docs gained entries
    // and two phantoms disappeared, none of it attributable to the cleanup.
    // A global index count therefore reds out for reasons that are not leaks,
    // which is how tests get quarantined and stop meaning anything. Lock 2
    // covers what the cleanup is actually accountable for: its OWN entries.
    // eslint-disable-next-line no-console
    console.log(`[cleanup][add card] card_index entries ${before.indexEntryCount} -> ${after.indexEntryCount} (informational; see the comment above) duplicateIndexEntryIds=[${after.duplicateIndexEntryIds.join(', ')}]`);
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
  // QUARANTINED 2026-08-10 — TASK-176. This is NOT a flaky test and it is not
  // skipped because it is unreliable: it fails because it is CORRECT, and the
  // product defect it catches is real and still open.
  //
  // Measured cause, proven by surgical mutation: every bulk status change
  // schedules a full card_index persist 2s later, which getDocs's all ~30
  // chunks and rewrites all 30 (~30MB read + ~30MB write) to change one field
  // on one card. The NEXT write queues behind that storm in the Firestore
  // client. Pushing the persist debounce from 2s to 10min — changing nothing
  // else — took this test's second bulk action from 14928/10139/14110ms to
  // 864/801/1149ms, 3 runs out of 3.
  //
  // Ruled out with data, not reasoning: not the network (36.7s of total wire
  // silence before the write was even issued, in the worst run) and not main-
  // thread CPU (1.2-2.4s of long tasks across a 10-15s wait).
  //
  // Rafael's call, 2026-08-10: quarantine here and ship the /inicio boot work
  // (TASK-182/183/184, ~53% off time-to-usable-hero) to dev now, rather than
  // open collection.ts — the file with TASK-168's data-loss history — at the
  // end of a long session. UNSKIP THIS AS PART OF FIXING TASK-176; it is the
  // regression test for that fix, and the fix is to write only the chunks
  // that actually changed instead of all 30.
  test.fixme('bulk select → bulk change status to Sale → status counts move in the store, not just the toast', async ({ collectionPage, commonPage }) => {
    // Start from a card known to be status=collection so the "before" state
    // is unambiguous (A4: starting state declared).
    await collectionPage.filterByStatus('collection');
    const cardCount = await collectionPage.getCardCount();
    expect(cardCount).toBeGreaterThan(0);

    const collectionCountBefore = await collectionPage.statusChipCount('collection');
    const availableCountBefore = await collectionPage.statusChipCount('available');
    expect(collectionCountBefore).toBeGreaterThan(0);

    // Identity captured BEFORE the status change, while the card is still
    // under the `collection` filter at index 0 — used only to re-FIND the
    // same card afterwards, never to assert on (the chip counts above/below
    // are the real assertions). Needed because the restore step below moves
    // this card out of the `collection` filter entirely, so index 0 there
    // is guaranteed to point at a DIFFERENT card by the time we get back to
    // it (mechanism 14 / TASK-144: index-0 drift on a virtualized grid,
    // this time caused by the filter itself, not background settling).
    const identityBefore = await collectionPage.cardIdentity(0);

    await collectionPage.selectModeButton.click();
    await collectionPage.clickCardInGrid(0);
    await expect(collectionPage.gridCards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    await collectionPage.bulkStatusButton('sale').click();
    await commonPage.waitForToast('success');
    await collectionPage.waitForBulkActionComplete();

    // Real assertion: the card's own status actually changed in the store —
    // the mutated `batchUpdateCards` never touches `cards.value`, so these
    // counts would stay exactly where they started under the mutation.
    await expect.poll(() => collectionPage.statusChipCount('collection')).toBe(collectionCountBefore - 1);
    await expect.poll(() => collectionPage.statusChipCount('available')).toBe(availableCountBefore + 1);

    // Restore (A4): move the same card back to its original status so this
    // run doesn't leave unbounded drift on the shared dev collection. The
    // card now lives under the `available` filter (status=sale), not
    // `collection` — switch filters and narrow by name before re-locating
    // it by identity, rather than assuming it re-lands at index 0.
    const [nameBefore] = identityBefore.split(' :: ');
    await collectionPage.filterByStatus('available');
    await collectionPage.searchInput.fill(nameBefore);
    await collectionPage.dismissSearchDropdown();

    await collectionPage.selectModeButton.click();
    await collectionPage.clickCardByIdentity(identityBefore);
    await collectionPage.bulkStatusButton('collection').click();
    await commonPage.waitForToast('success');
    await collectionPage.waitForBulkActionComplete();

    // No need to reset the search/filter narrowing before reading the chips
    // back: the status chip buttons render unconditionally regardless of
    // which filter is active (CollectionView.vue's `v-for` over the status
    // counts isn't gated on `statusFilter`), and their counts come from the
    // full `collectionStore.cards` array, not the filtered/searched grid —
    // so they're readable as-is. An earlier version reset search/filter
    // here defensively; under `--repeat-each` stress that extra
    // fill/click pair itself became a source of flakiness (the toolbar
    // shifts as `selectionMode` toggles off), for no assertion benefit.
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

  // TASK-146 → TASK-168: this assertion has now been through THREE anchors.
  // getCardCount() failed first: on a 59k-card window-virtualized grid the
  // virtualizer refills the visible window right behind a removed row, so a
  // count poll can pass by catching a transient mid-remount state. Identity at
  // grid index 0 replaced it and failed too — twice in consecutive CI runs —
  // because opening the confirm dialog shifts the layout and the virtualizer
  // re-renders its window, putting a different card at position 0 with or
  // without a real deletion. The anchor that holds is the nav badge:
  // collectionStore.cards.length, the whole array, no grid index anywhere.
  test('cancel deletion from confirm dialog leaves card intact', async ({ collectionPage, commonPage }) => {
    const cardCount = await collectionPage.getCardCount();
    expect(cardCount).toBeGreaterThan(0);

    // Anchor on the nav badge (collectionStore.cards.length), never on which
    // card sits at grid index 0. Identity-at-index-0 was the previous anchor
    // and it failed in CI twice in a row: opening the confirm dialog shifts
    // the layout, the virtualizer re-renders its window, and a different card
    // lands at position 0 — with or without a real deletion. The badge counts
    // the whole array, so it cannot move for a reason unrelated to the
    // operation under test. A cancel must leave it exactly unchanged; a real
    // deletion decrements it, which is what makes this falsifiable.
    const totalBefore = await collectionPage.totalCardCount();
    expect(totalBefore).toBeGreaterThan(0);

    await collectionPage.deleteButtonInGrid(0).click();
    await commonPage.cancelAction();

    expect(await collectionPage.totalCardCount()).toBe(totalBefore);
  });
});

// TASK-240 round 3, MEDIUM-2 — the merge branch, exercised deterministically.
//
// THE PROBLEM THIS SOLVES. 'add card' above only reaches the merge path when
// the account already holds a row for the exact print AddCardModal picked
// (scryfallId+edition+condition+foil+status). It adds Lightning Bolt, this
// account holds none, and the teardown now returns it to none on every run —
// so `bumped` is empty every time. Measured over the round-2 and round-3 runs:
// always `bumped=[]`. Lock 4's quantity-divergence branch — the one AC4 is
// really about, and the one that caught a real regression last round — was
// therefore latent: present, never executed in CI.
//
// WHY NOT JUST MAKE THE UI MERGE. Two adds in one test would merge only if the
// first card reached `card_index` between them: AddCardModal's merge check runs
// against `collectionStore.cards`, which is built FROM the index, and a
// just-added card frequently never gets there (TASK-234). So the "deterministic"
// version would be nondeterministic in the opposite direction, silently falling
// back to creating a second document — and it would add a second full add-card
// UI round trip to a test whose worst path is already close to its timeout
// (MEDIUM-3). Seeding a matching row up front has the same dependency, on the
// same broken subsystem.
//
// WHAT THIS DOES INSTEAD. Puts the account into the exact post-merge state
// (document and entry both at N+1) out of band, runs the real teardown against
// real Firestore, and asserts both halves came back — with the same predicate
// the E2E lock uses. No UI, no page load, no dependency on TASK-234. The
// predicate's own branches are covered separately and offline by
// tests/unit/e2e/coherence.test.ts.
//
// WHAT THIS DOES AND DOES NOT PROVE (TASK-240 round 4, MEDIUM-4 — the earlier
// wording here claimed it covered "the retry loop, the transaction, and the
// debounce window", and that was oversold). There is no browser page in this
// test, so there is no debounced client rewriting the chunk from stale memory —
// which is the entire reason the retry loop exists. Measured: `restored=[doc,
// idx]` on the first effective pass, no contention, no retry. What it DOES
// prove, and what is worth having, is that a settled post-merge state is
// restored on BOTH sides against real Firestore, through the real transaction
// path, with the real scope the spec passes.
test.describe('Collection CRUD — teardown contract (TASK-240)', () => {
  test.setTimeout(90_000);

  test('teardown restores a merged add on BOTH sides (doc and card_index)', async () => {
    const admin = await getTestAdmin();
    test.skip(admin === null, `TASK-240: no admin teardown available — ${adminUnavailableReason()}`);
    if (!admin) return;

    // ---------- crash recovery (TASK-240 round 4, MEDIUM-3) ----------
    // The `finally` below is the only thing that undoes the seeded merge, and a
    // Playwright TEST TIMEOUT does not run it: Playwright abandons the body and
    // tears the worker down. The borrowed card would be left at doc=N+1 /
    // idx=N+1 — COHERENT, therefore invisible to every lock in this suite and
    // to any audit that looks for divergence — and because the target is chosen
    // deterministically (`.sort()[0]`), the next run would read N+1 as its
    // `originalQ` and bump it again. Unbounded growth on a real card, produced
    // by the test written to prevent exactly that.
    //
    // So the intended restore state is written to a MARKER DOCUMENT before
    // anything is seeded, and repaired from that marker at the start of the
    // next run. A process that dies at ANY point between the seed and the
    // `finally` — timeout, SIGKILL, machine reboot — self-heals on the next
    // run, because the marker is what survives, not the in-memory `finally`.
    // Its own subcollection, never `cards`, so it can never be mistaken for a
    // card by the locks that count documents.
    const markerRef = admin.db.doc(`users/${admin.uid}/e2e_teardown_state/merge-fixture`);

    const writeIndexQuantity = async (id: string, q: number): Promise<string[]> => {
      const changes: string[] = [];
      const chunks = await admin.db.collection(`users/${admin.uid}/card_index`).get();
      for (const chunk of chunks.docs) {
        const entries = chunk.data().cards;
        if (!Array.isArray(entries)) continue;
        const hit = entries.find((e: { i?: string; q?: number }) => String(e?.i) === id);
        if (hit === undefined || Number(hit.q) === q) continue;
        await chunk.ref.update({
          cards: entries.map((e: { i?: string }) => (String(e?.i) === id ? { ...e, q } : e)),
        });
        changes.push(`idx ${id}:${Number(hit.q)}->${q}`);
      }
      return changes;
    };

    // Deliberately NOT admin.restoreQuantities: this is the seeder's repair
    // path AND the crash-recovery path, and both have to work while the thing
    // under test is broken. Found by mutation, not by reasoning — the first
    // version of this test repaired with restoreQuantities, so the run that
    // proved the lock reddens also left the borrowed card at doc=1 /
    // card_index q=2 and it had to be fixed by hand. A cleanup that only works
    // when the code is already correct is not a cleanup.
    const repair = async (id: string, q: number): Promise<string[]> => {
      const changes: string[] = [];
      const doc = await admin.db.doc(`users/${admin.uid}/cards/${id}`).get();
      if (doc.exists && Number(doc.get('quantity')) !== q) {
        await doc.ref.update({ quantity: q, updatedAt: new Date() });
        changes.push(`doc ${id}:${Number(doc.get('quantity'))}->${q}`);
      }
      changes.push(...await writeIndexQuantity(id, q));
      return changes;
    };

    const stale = await markerRef.get();
    if (stale.exists) {
      const { target: staleTarget, originalQ: staleQ } = stale.data() as { target: string; originalQ: number };
      const healed = await repair(staleTarget, staleQ);
      // eslint-disable-next-line no-console
      console.log(`[teardown contract] SELF-HEAL: a previous run died before its cleanup. marker=${JSON.stringify(stale.data())} repaired=[${healed.join(', ')}]`);
      await markerRef.delete();
    }

    // Taken AFTER the self-heal on purpose: a snapshot of a still-damaged
    // account would bake the previous run's leftover into this run's baseline.
    const before = await admin.snapshot();

    // A card that is currently COHERENT and not duplicated. Coherence is the
    // selection criterion on purpose: a divergent card may be one of TASK-238's
    // deliberate fixtures, and this test must not borrow one of those. Sorted
    // so the choice is reproducible across runs rather than "whatever came back
    // first".
    const target = before.cardDocIds
      .filter((id) => before.indexQuantities[id] !== undefined
        && before.indexQuantities[id] === before.quantities[id]
        && !before.duplicateIndexEntryIds.includes(id))
      .sort()[0];
    test.skip(target === undefined, 'TASK-240: no coherent card available to borrow for the merge fixture');
    if (target === undefined) return;

    const originalQ = before.quantities[target];
    const mergedQ = originalQ + 1;

    // BEFORE any mutation, and awaited: if the process dies after this line the
    // next run knows exactly what to put back; if it dies before it, nothing
    // has been changed yet. There is no ordering in between.
    await markerRef.set({ target, originalQ, mergedQ, at: new Date().toISOString() });

    try {
      // The post-merge state, as the app leaves it: updateCard bumps the
      // document, and the card_index persist eventually carries the same value.
      await admin.db.doc(`users/${admin.uid}/cards/${target}`).update({ quantity: mergedQ, updatedAt: new Date() });
      await writeIndexQuantity(target, mergedQ);

      const seeded = await admin.snapshot();
      expect(
        [seeded.quantities[target], seeded.indexQuantities[target]],
        `[teardown contract] the merge fixture did not take on ${target}`,
      ).toEqual([mergedQ, mergedQ]);

      // The real teardown call, with the real scope shape the spec passes.
      const restored = await admin.restoreQuantities(before.quantities, {
        docScope: [target],
        indexScope: [target],
      });
      // eslint-disable-next-line no-console
      console.log(`[teardown contract] target=${target} ${originalQ}->${mergedQ} restored=[${restored.join(', ')}]`);

      const after = await admin.snapshot();
      // Same predicate as lock 4 in 'add card', now on its merge branch: the
      // document SURVIVES and its entry has to agree with it.
      expect(
        findIncoherent([target], before, after),
        '[teardown contract] doc and card_index disagree after restoring a merged add',
      ).toEqual([]);
      expect(after.quantities[target], '[teardown contract] document quantity not restored').toBe(originalQ);
      expect(after.indexQuantities[target], '[teardown contract] card_index quantity not restored').toBe(originalQ);
    } finally {
      // Unconditional: an assertion failure above must not leave the borrowed
      // card at N+1. Writes only when something is actually off, so a clean run
      // is a no-op. The marker is deleted LAST — if this block itself dies
      // halfway, the marker is still there and the next run finishes the job.
      const changed = await repair(target, originalQ);
      // eslint-disable-next-line no-console
      console.log(`[teardown contract] fixture cleanup: repaired=[${changed.join(', ')}]`);
      await markerRef.delete();
    }
  });
});
