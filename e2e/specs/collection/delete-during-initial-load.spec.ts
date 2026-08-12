import { test, expect } from '../../fixtures/test';

/**
 * TASK-185 regression: deleting a card during the collection's initial load.
 *
 * Reported from production: open /collection, right-click a card, ELIMINAR —
 * and nothing happens. No delete, no error, no toast.
 *
 * The window: the grid paints from `paginatedCards` (the server-side card_index
 * query, back in well under a second), while `cards.value` is only assigned at
 * the END of loadFromIndex, after all ~30 index chunks are read. `deleteCard`
 * looked the card up in `cards.value` and bailed with a silent `return false`
 * when it wasn't there yet — so every delete inside that window was a no-op,
 * and CollectionView only toasts on `true`, so nothing surfaced at all.
 *
 * Why the existing "delete card" test in collection-crud.spec.ts never caught
 * it: it (correctly) waits for the grid to be ready first, by which point the
 * load has finished and `cards.value` is populated. It exercises a state the
 * bug does not live in. This test deliberately acts as early as it can.
 *
 * Also the only test in the suite that touches the right-click context menu —
 * grepping e2e/ for `button: 'right'` / `contextmenu` returned nothing before
 * this file, so all ten of its actions were unexercised.
 */
test.describe('Collection: delete during initial load (TASK-185)', () => {
  test.setTimeout(90_000);

  // QUARANTINED (test.fixme) — and the reason is the point, so read it before
  // deleting or "fixing" this file.
  //
  // The test body is correct and the app passes every step of it: the delete
  // fires, Firestore accepts it, the success toast appears. What it cannot do
  // on a desktop machine is prove it landed INSIDE the window it exists to
  // test, and it refuses to pass without that proof (the final guard). Measured
  // here, both ways:
  //   - unthrottled: loadCollection finishes before the first card is even
  //     clickable, so the delete takes the ordinary post-load path. Green here
  //     would have proven nothing — this is TASK-144's mechanism 11 exactly.
  //   - 1 Mbps: the first card never appears within 60s at all (that is
  //     TASK-179, a separate open defect, not a problem with this test).
  //   - 4 Mbps: card appears, delete works, still outside the window.
  // The window is wide on Rafael's phone over slow 4G and narrow-to-absent on a
  // desktop against a local preview. Making it deterministic needs the index
  // chunk reads specifically delayed (not the whole network) — Firestore's
  // streaming channel makes that non-trivial and it was not attempted.
  //
  // The logic itself IS covered, at the seam where the bug lives:
  // tests/unit/stores/collection.mutateBeforeIndexLoad.test.ts, 7 tests, red
  // before the fix and verified able to fail by mutation.
  test.fixme('right-click → ELIMINAR on a card the full index has not loaded yet actually deletes it', async ({ collectionPage, commonPage, page }) => {
    // The replay line only prints when a mutation was queued because the load
    // was still in flight — i.e. it is the proof that this run actually landed
    // inside the window under test. Without it a green here would prove
    // nothing (the delete would have gone down the ordinary post-load path).
    const consoleLines: string[] = [];
    page.on('console', (msg) => consoleLines.push(msg.text()));

    // Throttle before navigating. On a fast desktop against the local preview
    // the whole index load can finish before the first card is even clickable,
    // which closes the window under test (an unthrottled run fails this test's
    // final guard rather than passing emptily — measured). Throttling both
    // widens the window deterministically AND matches the conditions the app
    // actually ships into: slow 4G, where the window is seconds wide.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 100,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (4 * 1024 * 1024) / 8,
    });

    await collectionPage.goto();

    // Deliberately NOT waitForGridReady(): wait only for the first card to be
    // painted — the earliest moment a real user could right-click one — and
    // act immediately, while loadCollection is still reading index chunks.
    const firstCard = collectionPage.gridCards.first();
    await firstCard.waitFor({ state: 'visible', timeout: 60_000 });
    // The trigger here is the grid card's own DELETE button, not the right-click
    // menu item, and that substitution is deliberate and bounded:
    // CollectionGridCardFull fires the identical `emit('delete', card)` from
    // both (lines 364 and 579), CollectionView.handleDelete is the single
    // handler, and the defect is in the store's deleteCard — none of it is
    // reachable only via the menu.
    //
    // Driving the real context menu from Playwright against this virtualized
    // grid was tried three ways and abandoned: the tile's image skeleton counts
    // as an interception until the artwork loads (>30s here), `force: true`
    // skips scroll-into-view and the first card's centre sits below the 720px
    // viewport, and clamped raw-mouse coordinates still missed after the
    // virtualizer re-rendered. A synthetic `dispatchEvent('contextmenu')` DOES
    // open the menu with all 10 items, which proves the menu itself is healthy
    // and that what failed was the automation, not the product — but a
    // synthetic event is not a user action, so it is not used as the trigger.
    // The right-click path therefore remains uncovered by E2E; that gap is
    // recorded in TASK-185 rather than papered over here.
    await collectionPage.deleteButtonInGrid(0).click();

    await commonPage.confirmAction();

    // THE assertion for this defect. With the bug, deleteCard returns false,
    // CollectionView.handleDelete skips its toast entirely, and the user gets
    // no feedback of any kind — so "a success toast appeared" is exactly the
    // signal that was missing. (It is not a proxy for the Firestore write:
    // handleDelete only toasts on a fulfilled `true`, which deleteCard now
    // only returns after `await deleteDoc` resolved.)
    await commonPage.waitForToast('success');

    // NOT asserted here: "the card left the grid". TASK-144's mechanism 14 —
    // the virtualizer refills index 0 behind the removal, so both a count poll
    // and an identity check at that position are false anchors, proven there by
    // mutation. What the toast above does prove is precise and sufficient for
    // this defect: handleDelete only toasts on a fulfilled `true`, and
    // deleteCard only returns `true` after `await deleteDoc` resolved against
    // Firestore. With the bug it returned `false` before touching Firestore and
    // no toast of any kind appeared.

    // Guard against a meaningless green: if the load had already finished, the
    // queue was never used and this run did not test the reported scenario.
    const replayed = consoleLines.some(l => l.includes('[IndexSync] Replayed'));
    expect(
      replayed,
      'the delete did not land inside the initial-load window — this run did not exercise TASK-185 (collection loaded too fast; re-run against the large account)'
    ).toBe(true);
  });
});
