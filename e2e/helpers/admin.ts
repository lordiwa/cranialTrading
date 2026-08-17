/**
 * TASK-240 — out-of-band Firestore access for E2E teardown.
 *
 * WHY THIS EXISTS AT ALL. The "add card" spec's cleanup used to delete
 * whatever card sat at grid index 0 and hope that was the card it had just
 * created. Measured on 2026-08-17, that is unfixable from the UI while
 * TASK-234 is open: a freshly added card frequently never reaches
 * `card_index`, the grid is built and sorted FROM that index, so the created
 * card is simply not on screen and there is no button to click. The cleanup
 * then deleted a bystander instead (measured: it de-indexed "Angel's Herald",
 * one of TASK-238's live fixtures) while the created doc stayed forever.
 *
 * So teardown goes around the interface: identify the doc the test created by
 * diffing a before/after snapshot of the account, and delete it by id with
 * firebase-admin. Deleting by id is the only strategy that is correct
 * regardless of whether the index write landed.
 *
 * SAFETY RAILS — this module can delete real documents, so it refuses to run
 * unless everything lines up:
 *  - It only ever targets `cranial-trading-dev`. Any other project id is a
 *    hard error, not a warning: an E2E run configured against production must
 *    never reach an admin delete.
 *  - It only ever deletes ids the caller measured as new in this run. There is
 *    no "delete by name", no "delete the newest", no positional guessing.
 *  - If Application Default Credentials are missing, it reports unavailable
 *    rather than throwing, and the caller SKIPS the mutating test. A test that
 *    cannot clean up after itself must not run — that is the whole point of
 *    the ticket ("que deje de crear cosas que no borra").
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

/** The ONLY project this module is allowed to write to. */
const DEV_PROJECT_ID = 'cranial-trading-dev';

export type AccountSnapshot = {
  /** Ids of every doc under users/<uid>/cards. */
  cardDocIds: string[];
  /**
   * id -> quantity. Needed because "add card" does NOT always create a doc:
   * AddCardModal merges into an existing row of the same print
   * (scryfallId+edition+condition+foil+status) and bumps its quantity instead
   * (SCRUM-35 bug #1). A teardown that only looks for new documents would
   * report "nothing to clean" on those runs while leaving +1 quantity behind
   * every time — the same unbounded accumulation in a different field.
   */
  quantities: Record<string, number>;
  /**
   * id -> the card's `name` / `scryfallId` fields. Present so a caller can
   * bound a teardown to THE PRINT IT ADDED instead of to the whole account.
   * TASK-240 round 4, HIGH-1: restoreQuantities' document half used to run over
   * every id in the snapshot, and "it only writes ids whose quantity changed"
   * is not a safety property — it assumes a single writer, which this project
   * does not have (a nightly run and a push-to-develop run share this account).
   * Measured 2026-08-17 by the reviewer: a third party bumped an untouched card
   * to 8 after `before` was taken and the teardown reverted it to 1, index
   * entry included. Scoping needs an identity, so the snapshot carries one.
   */
  names: Record<string, string>;
  scryfallIds: Record<string, string>;
  /** Ids referenced by card_index entries (the `i` field of each entry). */
  indexEntryIds: string[];
  /**
   * id -> the `q` field of that id's card_index entry. `q` IS the quantity
   * (src/stores/collection.ts, `IndexCard`), so a merged add bumps it in
   * lockstep with the document. Snapshotting it is what lets teardown put the
   * index back too: restoring only the document leaves doc=N / entry=N+1, a
   * permanent divergence — nothing in `functions/` reconciles the two — which
   * is the exact damage class TASK-238 exists to repair. Absent from the map
   * when the id has no index entry at all (a normal state here: TASK-234).
   */
  indexQuantities: Record<string, number>;
  /**
   * Ids that appear in MORE THAN ONE card_index entry. `indexQuantities` can
   * only hold one `q` per id, so a duplicated id silently collapses to
   * whichever entry was read last — and TASK-168 documents duplicate entries as
   * a real corruption class, not a hypothetical. Rather than let that
   * ambiguity decide a lock quietly, the duplicates are reported: the caller
   * treats a duplicated id it touched as an incoherence, and prints the rest.
   * Measured 2026-08-17 on this account: empty.
   */
  duplicateIndexEntryIds: string[];
  cardDocCount: number;
  indexEntryCount: number;
};

export type TestAdmin = {
  uid: string;
  db: Firestore;
  snapshot(): Promise<AccountSnapshot>;
  /**
   * id -> quantity for every card document, and NOTHING else. The cheap half
   * of snapshot(): no card_index chunks. Exposed because callers that poll
   * (TASK-240 round 4, MEDIUM-2) were paying a whole-account chunk read every
   * 2s for data they never looked at — on the CI account (41k+ cards, ~30
   * chunks) that is multi-megabyte per iteration, up to 15 iterations, inside
   * a 90s test.
   */
  docQuantities(): Promise<Record<string, number>>;
  /** Count of docs in an arbitrary user subcollection (decks, binders, …). */
  subcollectionIds(name: string): Promise<string[]>;
  /**
   * Deletes the given card docs AND strips their card_index entries. Both
   * halves matter: deleting the doc alone would manufacture exactly the
   * "phantom" (index entry with no document) that TASK-238 is about.
   */
  deleteCards(ids: string[]): Promise<{ docsDeleted: number; indexEntriesRemoved: number; passes: number }>;
  /**
   * Restores pre-existing docs' quantities to the given snapshot values —
   * BOTH the document and its card_index entry. Returns what it changed.
   *
   * `expected` says WHAT the values should be. `scope` says WHICH ids this
   * call is allowed to write, and there is no id outside it that this call can
   * touch on either side:
   *  - `docScope` — the only documents whose `quantity` may be rewritten.
   *  - `indexScope` — the only card_index entries whose `q` may be rewritten,
   *    plus any id whose document this call restored itself (having written the
   *    document, it owns the entry's agreement with it).
   *
   * Both are required and neither defaults to "everything", so a caller cannot
   * obtain an account-wide rewrite by passing only `expected`. That is a
   * COMPILE-TIME guard only, and a weak one here: tsconfig.json excludes `e2e`
   * and `npm run type-check` is `vue-tsc` over `src`, so nothing in CI
   * type-checks this call site. What actually holds the line is that both sets
   * are consulted as allow-lists at runtime — an omitted or empty scope writes
   * nothing, which fails safe.
   */
  restoreQuantities(
    expected: Record<string, number>,
    scope: { docScope: Iterable<string>; indexScope: Iterable<string> },
  ): Promise<string[]>;
};

let cached: TestAdmin | null | undefined;
let unavailableReason = '';

/** Why the last getTestAdmin() returned null. Safe to read after the call. */
export function adminUnavailableReason(): string {
  return unavailableReason;
}

/**
 * Returns an admin handle, or null when this run must not use one. Null is a
 * normal outcome (no credentials on a contributor's machine, or a run pointed
 * at production) — callers turn it into a visible test.skip, never a silent
 * pass.
 */
export async function getTestAdmin(): Promise<TestAdmin | null> {
  if (cached !== undefined) return cached;
  cached = await build();
  return cached;
}

async function build(): Promise<TestAdmin | null> {
  // Refuse outright when the run is aimed at production: the app under test
  // would be writing to prod while this module deleted from dev — a leak in
  // prod plus a green teardown, the worst of both.
  if ((process.env.VITE_MODE ?? '') === 'production') {
    unavailableReason = 'VITE_MODE=production — admin teardown is dev-only, refusing to run';
    return null;
  }
  const baseUrl = process.env.E2E_BASE_URL ?? '';
  if (baseUrl && !baseUrl.includes('cranial-trading-dev')) {
    unavailableReason = `E2E_BASE_URL=${baseUrl} is not the dev environment — admin teardown is dev-only, refusing to run`;
    return null;
  }

  const projectId = process.env.E2E_ADMIN_PROJECT_ID ?? DEV_PROJECT_ID;
  if (projectId !== DEV_PROJECT_ID) {
    unavailableReason = `E2E_ADMIN_PROJECT_ID=${projectId} is not ${DEV_PROJECT_ID} — refusing to run`;
    return null;
  }

  const email = process.env.TEST_USER_A_EMAIL;
  if (!email) {
    unavailableReason = 'TEST_USER_A_EMAIL is not set';
    return null;
  }

  let uid: string;
  let db: Firestore;
  try {
    const app = getApps().find((a) => a.name === 'e2e-teardown')
      ?? initializeApp({ credential: applicationDefault(), projectId }, 'e2e-teardown');
    uid = (await getAuth(app).getUserByEmail(email)).uid;
    db = getFirestore(app);
    // Prove the credentials actually read Firestore before any test relies on
    // them — an init that "succeeds" and then fails at teardown time would
    // leave the leak this ticket exists to stop.
    await db.collection(`users/${uid}/cards`).limit(1).get();
  } catch (err) {
    unavailableReason = `firebase-admin unavailable (Application Default Credentials?): ${(err as Error).message}`;
    return null;
  }

  /**
   * The document half of a snapshot, on its own. Split out because
   * restoreQuantities' retry loop needs ONLY this: reading every card_index
   * chunk as well costs an extra multi-megabyte read per pass on the CI
   * account (41k+ entries) for data that pass did not use. See the cost note
   * on restoreQuantities.
   */
  const readDocQuantities = async (): Promise<Record<string, number>> => {
    const cardsSnap = await db.collection(`users/${uid}/cards`).select('quantity').get();
    const quantities: Record<string, number> = {};
    cardsSnap.docs.forEach((d) => { quantities[d.id] = Number(d.get('quantity') ?? 0); });
    return quantities;
  };

  const snapshot = async (): Promise<AccountSnapshot> => {
    const [cardsSnap, indexSnap] = await Promise.all([
      db.collection(`users/${uid}/cards`).select('quantity', 'name', 'scryfallId').get(),
      db.collection(`users/${uid}/card_index`).get(),
    ]);
    const quantities: Record<string, number> = {};
    const names: Record<string, string> = {};
    const scryfallIds: Record<string, string> = {};
    cardsSnap.docs.forEach((d) => {
      quantities[d.id] = Number(d.get('quantity') ?? 0);
      names[d.id] = String(d.get('name') ?? '');
      scryfallIds[d.id] = String(d.get('scryfallId') ?? '');
    });
    const cardDocIds = Object.keys(quantities);
    const indexEntryIds: string[] = [];
    const indexQuantities: Record<string, number> = {};
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    indexSnap.forEach((chunk) => {
      const entries = chunk.data().cards;
      if (Array.isArray(entries)) {
        for (const e of entries) {
          const id = String(e?.i);
          indexEntryIds.push(id);
          if (seen.has(id)) duplicates.add(id); else seen.add(id);
          indexQuantities[id] = Number(e?.q ?? 0);
        }
      }
    });
    return {
      cardDocIds,
      quantities,
      names,
      scryfallIds,
      indexEntryIds,
      indexQuantities,
      duplicateIndexEntryIds: [...duplicates],
      cardDocCount: cardDocIds.length,
      indexEntryCount: indexEntryIds.length,
    };
  };

  /**
   * One pass of rewriting the `q` field of the card_index entries named in
   * `wanted`. Transactional and re-reading the chunk fresh, for the same reason
   * stripIndexEntries is: the chunk is live and rewritten wholesale by the
   * client, so a stale-read rewrite would clobber concurrent writes. Only the
   * `q` of the named ids is touched — every other entry (TASK-238's fixtures
   * among them) is passed through byte-for-byte, and `count` stays in sync
   * because the app maintains both.
   *
   * THAT LAST SENTENCE IS ONLY AS TRUE AS `wanted`. It described this function
   * read in isolation and was false of its caller: restoreQuantities used to
   * fill `wanted` from every pre-existing document in the account, so any card
   * whose entry already disagreed with its document — a TASK-238 quantity
   * fixture, or natural TASK-208/234 drift — got silently "repaired" by an E2E
   * teardown. Measured 2026-08-17 on an untouched bystander (doc=1, entry
   * seeded to q=8): the teardown rewrote the entry back to 1. Callers owe this
   * function a set of ids the run actually touched — see `indexScope`.
   */
  const syncIndexQuantities = async (wanted: Map<string, number>): Promise<string[]> => {
    if (wanted.size === 0) return [];
    const changed: string[] = [];
    const chunks = await db.collection(`users/${uid}/card_index`).get();
    for (const chunk of chunks.docs) {
      // Assigned (not accumulated) inside the transaction: Firestore may run
      // the callback more than once on contention, and an accumulating counter
      // would over-report.
      let chunkChanged: string[] = [];
      await db.runTransaction(async (tx) => {
        chunkChanged = [];
        const fresh = await tx.get(chunk.ref);
        const entries = fresh.data()?.cards;
        if (!Array.isArray(entries)) return;
        const next = entries.map((e: { i?: string; q?: number }) => {
          const id = String(e?.i);
          if (!wanted.has(id)) return e;
          const q = wanted.get(id)!;
          if (Number(e?.q) === q) return e;
          chunkChanged.push(`idx ${id}:${Number(e?.q)}->${q}`);
          return { ...e, q };
        });
        if (chunkChanged.length === 0) return;
        tx.update(chunk.ref, { cards: next, count: next.length });
      });
      changed.push(...chunkChanged);
    }
    return changed;
  };

  /**
   * Puts quantities back exactly as `expected` had them, for pre-existing docs
   * only, ON BOTH SIDES. Used to undo a merged add (see
   * AccountSnapshot.quantities).
   *
   * WHY BOTH SIDES (TASK-240 fix round). This used to write the document and
   * stop there. Measured 2026-08-17 on the merge path: the account was left
   * with doc.quantity=1 and its card_index entry at q=2, permanently — no
   * Firestore trigger reconciles them — while the test went green, because
   * every lock compared documents against documents. Teardown was manufacturing
   * the divergence the suite is supposed to protect against.
   *
   * WHY THE RETRY LOOP. Same race deleteCards documents: the client's
   * card_index persist is DEBOUNCED, so an entry carrying the bumped quantity
   * can be written SECONDS AFTER a single correcting pass, silently undoing it.
   * A one-shot fix here would be green-and-wrong exactly as often as the
   * timing happened to fall badly. So, as in deleteCards, re-check until two
   * consecutive passes find nothing to change — that spans the debounce window
   * instead of guessing a sleep long enough to cover it. The document half is
   * re-checked in the same loop even though `updateCard` writes it
   * undebounced: it costs nothing, and it is read from the same read.
   *
   * WHY BOTH HALVES ARE SCOPED, AND WHY THE SCOPES DIFFER (TASK-240 round 4,
   * HIGH-1). The document half used to run over every id in `expected`, i.e.
   * the whole account, defended by "it only writes an id whose CURRENT quantity
   * differs from the snapshot, so an untouched card can never match". That
   * defence is false as written. The real predicate is "a card whose quantity
   * did not CHANGE", and it only implies "untouched" under a single-writer
   * assumption this project does not have: CLAUDE.md schedules a nightly run
   * against the same dev account that a push-to-develop run can overlap.
   * MEASURED by the reviewer on 2026-08-17 — a third party set an untouched
   * card to 8 after `before` was taken, and this function put it back to 1,
   * document AND card_index entry, silently. So `docScope` is now an allow-list
   * too, and the caller is expected to fill it with the ids that could
   * plausibly be the run's own doing (for the 'add card' spec: the rows of the
   * exact print it added — see that spec).
   *
   * The two scopes still differ, and the index one is the narrower. The
   * document half compares a document against a value the CALLER recorded from
   * that same document, so restricting it to the run's own print is enough. The
   * index half compares an entry against a DOCUMENT, and doc/entry disagreement
   * is a pre-existing condition here (TASK-208/234, plus TASK-238's deliberate
   * fixtures) — on an account with 25+ rows for the card the spec adds, "same
   * print" would still be wide enough to "repair" a fixture. It therefore stays
   * at the ids the run OBSERVED changing, plus any id whose document this call
   * restored itself: having written the document, this call owns the entry's
   * agreement with it. Note that this is the path by which the document half
   * feeds the index half — which is exactly why the document half could not
   * stay global.
   *
   * COST (round 3). A pass used to take a full snapshot(): every card document
   * AND every card_index chunk, multi-megabyte on the CI account, paid even
   * when no index write was possible. A timeout here lands MID-TEARDOWN and
   * leaks the document, so the loop reads documents only and leaves the chunk
   * read to syncIndexQuantities, which skips it entirely when `wanted` is empty.
   *
   * GRACE PERIOD, and the round-3 contradiction it resolves (round 4,
   * MEDIUM-1). Round 3 also made the loop demand only ONE clean pass when the
   * index allow-list was empty — which is the `created=[] && bumped=[]` path,
   * the very case the spec flags with "no new card document and no quantity
   * change appeared within 30s". On that path the loop returned after a single
   * read with no sleep, so a write landing a second later was a permanent leak
   * nothing would see. That directly contradicted the reason given for keeping
   * the document half global ("catch a merge that landed after the caller
   * stopped polling"): the same change removed the window in which such a merge
   * could be caught. Resolved in the one direction that is coherent — the
   * window is real and it is kept: whenever ANYTHING is in scope on either
   * side, there is a late write this call could still catch, so it requires two
   * consecutive clean passes with a sleep between them. One pass is used only
   * when both scopes are empty, where by construction this function may write
   * nothing at all and waiting could not change any outcome. The saving from
   * round 3 is kept where it was actually earned: the extra pass is now a
   * documents-only read, not a whole-account snapshot.
   */
  const restoreQuantities = async (
    expected: Record<string, number>,
    scope: { docScope: Iterable<string>; indexScope: Iterable<string> },
  ): Promise<string[]> => {
    const restored: string[] = [];
    const allowDoc = new Set(scope.docScope);
    // Grows as the loop restores documents: an id we ourselves wrote is an id
    // whose entry we are now accountable for, even if the caller didn't name it.
    // It can only grow with ids from `allowDoc`, so the caller's document scope
    // bounds BOTH halves.
    const allowIndex = new Set(scope.indexScope);
    // Fixed before the loop on purpose: `allowIndex` can only grow via a
    // document write, which requires a non-empty `allowDoc`, so the two-pass
    // requirement can never be missed by evaluating this early.
    const needed = allowDoc.size > 0 || allowIndex.size > 0 ? 2 : 1;
    let consecutiveClean = 0;
    let passes = 0;
    while (consecutiveClean < needed && passes < 8) {
      const current = await readDocQuantities();
      const wanted = new Map<string, number>();
      const docChanges: string[] = [];
      for (const id of allowDoc) {
        if (!(id in expected) || !(id in current)) continue;
        const q = expected[id];
        if (current[id] !== q) {
          // `updatedAt` alongside `quantity` because every write the app makes
          // pairs them (src/stores/collection.ts updateCard/batchUpdateCards);
          // a teardown that moves a quantity without moving the timestamp
          // leaves a document the app itself could never have produced.
          await db.doc(`users/${uid}/cards/${id}`).update({ quantity: q, updatedAt: Timestamp.now() });
          docChanges.push(`${id}:${current[id]}->${q}`);
          allowIndex.add(id);
        }
        // The entry has to agree with the RESTORED document, whether or not the
        // document itself needed touching this pass. Handed over unconditionally
        // for allow-listed ids: syncIndexQuantities already leaves an entry that
        // matches untouched, and never creates one that is absent (an id with no
        // entry is legitimate here — TASK-234 leaves unindexed docs behind), so
        // passing it the id costs one comparison and saves this loop a
        // whole-account chunk read.
        if (allowIndex.has(id)) wanted.set(id, q);
      }
      // Ids the caller put in `indexScope` but NOT in `docScope`: their entry is
      // this call's business even though their document is not. Synced to the
      // document's CURRENT value, deliberately not to `expected[id]` — this call
      // is not going to restore that document, so writing the snapshot value
      // into the entry would MANUFACTURE the doc/index divergence the whole
      // exercise is about.
      for (const id of allowIndex) {
        if (wanted.has(id) || !(id in current)) continue;
        wanted.set(id, current[id]);
      }
      const idxChanges = await syncIndexQuantities(wanted);
      restored.push(...docChanges, ...idxChanges);
      passes++;
      consecutiveClean = docChanges.length + idxChanges.length === 0 ? consecutiveClean + 1 : 0;
      if (consecutiveClean < needed) await new Promise((r) => setTimeout(r, 4000));
    }
    return restored;
  };

  const subcollectionIds = async (name: string): Promise<string[]> => {
    const snap = await db.collection(`users/${uid}/${name}`).select().get();
    return snap.docs.map((d) => d.id);
  };

  /**
   * One stripping pass: removes `doomed` ids from every card_index chunk,
   * transactionally. A transaction, not a plain update, because the chunk is
   * live — the app rewrites it from the client — and a stale-read rewrite
   * would clobber concurrent writes. The chunk also holds TASK-238's
   * deliberately-dirty fixtures, so only ids in `doomed` are ever removed;
   * `count` is kept in sync with `cards` because the app maintains both.
   */
  const stripIndexEntries = async (doomed: Set<string>): Promise<number> => {
    let removed = 0;
    const chunks = await db.collection(`users/${uid}/card_index`).get();
    for (const chunk of chunks.docs) {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(chunk.ref);
        const entries = fresh.data()?.cards;
        if (!Array.isArray(entries)) return;
        const kept = entries.filter((e: { i?: string }) => !doomed.has(String(e?.i)));
        if (kept.length === entries.length) return;
        removed += entries.length - kept.length;
        tx.update(chunk.ref, { cards: kept, count: kept.length });
      });
    }
    return removed;
  };

  const deleteCards = async (ids: string[]) => {
    if (ids.length === 0) return { docsDeleted: 0, indexEntriesRemoved: 0, passes: 0 };
    const doomed = new Set(ids);

    // Document first, index second — and then keep checking. Measured
    // 2026-08-17: stripping the index once, before deleting the doc, produced
    // a PHANTOM (index entry pointing at a document that no longer exists —
    // the TASK-238 damage class). The app's card_index persist is debounced on
    // the client, so an entry for the card we just deleted can be written
    // SECONDS AFTER the teardown's single strip. One pass is not enough; the
    // loop below re-strips until two consecutive passes find nothing, which
    // spans the debounce window rather than guessing a sleep long enough to
    // cover it.
    let docsDeleted = 0;
    for (const id of ids) {
      await db.doc(`users/${uid}/cards/${id}`).delete();
      docsDeleted++;
    }

    let indexEntriesRemoved = 0;
    let consecutiveClean = 0;
    let passes = 0;
    while (consecutiveClean < 2 && passes < 8) {
      const removed = await stripIndexEntries(doomed);
      passes++;
      indexEntriesRemoved += removed;
      consecutiveClean = removed === 0 ? consecutiveClean + 1 : 0;
      if (consecutiveClean < 2) await new Promise((r) => setTimeout(r, 4000));
    }
    return { docsDeleted, indexEntriesRemoved, passes };
  };

  return { uid, db, snapshot, docQuantities: readDocQuantities, subcollectionIds, deleteCards, restoreQuantities };
}
