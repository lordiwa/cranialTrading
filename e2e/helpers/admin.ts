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
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

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
  /** Ids referenced by card_index entries (the `i` field of each entry). */
  indexEntryIds: string[];
  cardDocCount: number;
  indexEntryCount: number;
};

export type TestAdmin = {
  uid: string;
  db: Firestore;
  snapshot(): Promise<AccountSnapshot>;
  /** Count of docs in an arbitrary user subcollection (decks, binders, …). */
  subcollectionIds(name: string): Promise<string[]>;
  /**
   * Deletes the given card docs AND strips their card_index entries. Both
   * halves matter: deleting the doc alone would manufacture exactly the
   * "phantom" (index entry with no document) that TASK-238 is about.
   */
  deleteCards(ids: string[]): Promise<{ docsDeleted: number; indexEntriesRemoved: number; passes: number }>;
  /** Restores pre-existing docs' quantities to the given snapshot values. Returns what it changed. */
  restoreQuantities(expected: Record<string, number>): Promise<string[]>;
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

  const snapshot = async (): Promise<AccountSnapshot> => {
    const [cardsSnap, indexSnap] = await Promise.all([
      db.collection(`users/${uid}/cards`).select('quantity').get(),
      db.collection(`users/${uid}/card_index`).get(),
    ]);
    const cardDocIds = cardsSnap.docs.map((d) => d.id);
    const quantities: Record<string, number> = {};
    cardsSnap.docs.forEach((d) => { quantities[d.id] = Number(d.get('quantity') ?? 0); });
    const indexEntryIds: string[] = [];
    indexSnap.forEach((chunk) => {
      const entries = chunk.data().cards;
      if (Array.isArray(entries)) for (const e of entries) indexEntryIds.push(String(e?.i));
    });
    return {
      cardDocIds,
      quantities,
      indexEntryIds,
      cardDocCount: cardDocIds.length,
      indexEntryCount: indexEntryIds.length,
    };
  };

  /**
   * Puts quantities back exactly as `expected` had them, for pre-existing docs
   * only. Used to undo a merged add (see AccountSnapshot.quantities).
   */
  const restoreQuantities = async (expected: Record<string, number>): Promise<string[]> => {
    const current = await snapshot();
    const restored: string[] = [];
    for (const [id, q] of Object.entries(expected)) {
      if (!(id in current.quantities) || current.quantities[id] === q) continue;
      await db.doc(`users/${uid}/cards/${id}`).update({ quantity: q });
      restored.push(`${id}:${current.quantities[id]}->${q}`);
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

  return { uid, db, snapshot, subcollectionIds, deleteCards, restoreQuantities };
}
