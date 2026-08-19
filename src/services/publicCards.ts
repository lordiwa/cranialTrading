/**
 * Public Cards Service
 *
 * Manages denormalized public collections for efficient match queries.
 * Instead of loading ALL users to find matches, we query indexed collections.
 *
 * Collections:
 * - /public_cards/{docId} - Cards available for trade/sale
 * - /public_preferences/{docId} - Cards users are looking for
 */

import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  setDoc,
  startAfter,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
// TYPE-ONLY, deliberately: a value import here would eagerly run
// cloudFunctions.ts's module-top-level `getFunctions(getApp())` for every
// module that imports publicCards.ts, which throws "No Firebase App
// '[DEFAULT]'" in any test that doesn't also mock firebase/app — the exact
// breakage already documented (and measured at 9 test files) on
// triggerIndexReconcileNow below. `import type` is erased at compile time;
// the value comes from a dynamic import inside queryUserPublicCardIndex.
import type {
  PublicCardIndexFacets,
  PublicIndexCard,
  QueryPublicCardIndexRequest,
  QueryPublicCardIndexResponse,
} from './cloudFunctions'
import { db } from './firestore'
import type { Card } from '../types/card'
import { cardImageProxyUrl } from '../utils/cardImageUrl'
import { logSanitizedError } from '../utils/logSanitizedError'

/** Firestore caps an 'in' filter at 30 values. */
const FIRESTORE_IN_LIMIT = 30

/**
 * How many chunk queries may be in flight at once.
 *
 * The match finders used to await their chunks ONE AT A TIME, so a 59k-card
 * collection turned into thousands of serial round-trips on the post-login
 * landing. Unbounded Promise.all is not the answer either — Firestore multiplexes
 * over a limited number of connections and a few thousand simultaneous getDocs
 * just queues with extra memory. 8 is the usual sweet spot.
 */
const MAX_CONCURRENT_CHUNK_QUERIES = 8

/** Split a list into fixed-size chunks. Pure — exported for unit testing. */
export function chunkList<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Map over items with at most `limit` workers running concurrently, preserving
 * input order in the result. Rejects as soon as any task rejects.
 *
 * Pure (given a pure worker) — exported for unit testing.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    // Each runner pulls the next index until the queue drains, so a slow task
    // never blocks the others behind a fixed partition.
    for (let i = next++; i < items.length; i = next++) {
      // The loop condition already bounds i, so the indexed access is defined —
      // the cast only satisfies noUncheckedIndexedAccess.
      results[i] = await worker(items[i] as T, i)
    }
  })

  await Promise.all(runners)
  return results
}

export interface PublicCard {
  docId: string // Firestore document ID
  cardId: string // matches the user's card document ID
  userId: string
  username: string
  avatarUrl?: string | null
  cardName: string
  cardNameLower: string // lowercased cardName — matches the prefix query in publicCardSearch.ts
  scryfallId: string
  setCode: string // TASK-138 AC3: Scryfall set code, NOT card.edition (human-readable set_name — see cardEnrichment.ts canonical rule). '' when the source card had no setCode yet; docs written before this field existed are patched in-memory by UserProfileView's enrichPublicCardsInMemory (needsEnrichment/buildEnrichmentPatch already backfill setCode for display — no separate backfill script needed).
  status: 'trade' | 'sale'
  price: number
  edition: string
  condition: string
  foil: boolean
  quantity: number
  image: string
  location?: string
  email?: string
  updatedAt: Timestamp
}

export interface PreferenceInput {
  id: string
  cardName?: string
  name?: string
  scryfallId?: string
  maxPrice?: number
  minCondition?: string
}

export interface PublicPreference {
  docId: string // Firestore document ID
  prefId: string // matches the user's preference document ID
  userId: string
  username: string
  avatarUrl?: string | null
  cardName: string
  scryfallId: string
  maxPrice?: number
  minCondition?: string
  location?: string
  email?: string
  updatedAt: Timestamp
}

/**
 * The STRICT predicate — sale/trade status AND `public === true` — and the
 * one that gates WRITING to public_cards. TASK-085: sale/trade is a
 * whitelist, not a 'collection' blacklist, because public_cards is readable
 * by anonymous users and a 'wishlist' card marked public must never slip
 * through as "not collection". Strict on `public` for the same reason: that
 * collection only ever receives what was explicitly opted in.
 *
 * NOT to be confused with `isPossiblyPublicCard` (src/utils/publicSyncFilter.ts),
 * which is PERMISSIVE (`public !== false`) and answers a different question:
 * should the sync machinery even LOOK at this card. Two predicates, two
 * jobs — write-gate vs. look-gate.
 *
 * That distinction is not academic: choosing the wrong one is exactly the
 * bug TASK-247 tanda 2c round 4 (MEDIUM-1/HIGH-2) had to fix. A strict guard
 * on the LOOK question skipped legacy cards carrying no `public` field at
 * all (measured: 7 of 7,374 real sale/trade cards), orphaning their
 * public_cards documents — the ghost-card bug.
 *
 * Deliberately module-private. Round 3 (MED-A) exported it for
 * stores/collection.ts's updateCard/deleteCard guards; round 4 replaced
 * those call sites with `isPossiblyPublicCard` precisely because the strict
 * predicate was the wrong one there, leaving this export with no consumer
 * outside this file. An exported strict predicate is what the next reader
 * reaches for by default, so it stays unexported until something outside
 * genuinely needs the WRITE gate.
 */
function isPublicCard(card: Card): boolean {
  return (card.status === 'sale' || card.status === 'trade') && card.public === true
}

/**
 * Single source of truth for the public_cards document shape (TASK-247
 * tanda 2c). Previously syncCardToPublic, batchSyncCardsToPublic, and
 * syncAllUserCards each carried their own object literal — the exact drift
 * risk the server's PUBLIC_CARD_FIELDS catalog (functions/lib/
 * publicCardIndexReconciler.js) exists to guard against. Every field that
 * catalog reads (scryfallId, cardId, cardName, cardNameLower, quantity,
 * price, status, foil, condition, setCode, edition, updatedAt) is written
 * here, plus the fields the profile UI itself needs (userId, username,
 * avatarUrl, image, location) — matches the real 17-field shape measured
 * against production (see the PublicCard doc comment above). Deliberately
 * excludes `email` — TASK-169, public_cards is anonymous-readable.
 *
 * `location` defaults to '' rather than staying undefined: this project's
 * Firestore client has no ignoreUndefinedProperties override (see
 * services/firestore.ts), so `undefined` in a setDoc/batch.set payload
 * throws. syncAllUserCards already guarded this correctly (`userLocation ??
 * ''`); syncCardToPublic and batchSyncCardsToPublic used to pass
 * `userLocation` straight through — unified here to the safe variant. In
 * practice every caller resolves location from authStore.user.location,
 * which is always a string (defaulted to '' at signup — see
 * stores/auth.ts), so this was latent, not a live bug.
 */
export function buildPublicCardDoc(
  card: Card,
  userId: string,
  username: string,
  userLocation?: string,
  userAvatarUrl?: string | null
): Omit<PublicCard, 'docId'> {
  return {
    cardId: card.id,
    userId,
    username,
    avatarUrl: userAvatarUrl ?? null,
    cardName: card.name,
    cardNameLower: card.name.toLowerCase(),
    scryfallId: card.scryfallId,
    setCode: card.setCode ?? '',
    status: card.status as 'trade' | 'sale',
    price: card.price || 0,
    edition: card.edition || '',
    condition: card.condition || 'NM',
    foil: card.foil || false,
    quantity: card.quantity || 1,
    image: card.image || '',
    location: userLocation ?? '',
    updatedAt: Timestamp.now(),
  }
}

/**
 * TASK-247 tanda 2c review round 2 (HIGH-1): coalescing window for the
 * reconcile trigger. A bare, un-debounced call meant every single quantity
 * +1 click on a 6,758-card public profile fired its own full reconcile
 * invoke (2 GiB, reads the seller's whole public_cards + a scryfall_cache
 * join) — three quick clicks, three full sweeps, and two loops that mutate
 * cards one at a time (stores/buyRequests.ts fulfillRequest,
 * composables/useCollectionTotals.ts's auto-fix) turned that into one full
 * sweep PER CARD.
 *
 * Review round 3 (HIGH-A): the first version of this window was
 * TRAILING-ONLY (fire once RECONCILE_DEBOUNCE_MS after the LAST call in a
 * burst) — only the setTimeout half of the sibling card_index delta
 * debounce (queueCardIndexDelta/scheduleCardIndexDeltaFlush, TASK-237),
 * missing the half that survives a tab close
 * (flushPendingCardIndexDeltasOnUnload). A trailing-only debounce is WORSE
 * than no debounce for that failure mode: before it existed, the reconcile
 * fired immediately (loss window = one RTT); after it, the loss window
 * became RTT + 2s, landing exactly when the user has just finished editing
 * and is likeliest to navigate away — and there is no server-side safety
 * net (no onDocumentWritten/onSchedule reconcile exists; verified by grep).
 * Fixed to LEADING + TRAILING: the first call in a burst fires immediately
 * (`scheduleIndexReconcile`'s own call to `triggerIndexReconcileNow`,
 * below) — restoring the original RTT-only loss window — and any calls
 * landing while that leading call's coalescing window is still open are
 * marked `_reconcileTrailingPending` and coalesced into a single trailing
 * call once the window elapses. A real keepalive beacon on unload
 * (mirroring sendCardIndexDeltaBeacon) would close the trailing call's own
 * residual loss window too; that's out of this tanda's scope — the
 * trailing call only ever coalesces work the leading call didn't already
 * cover, so nothing from a burst's FIRST edit can be lost this way anymore.
 *
 * Deliberately kept HERE rather than moved next to the card_index sibling:
 * every path that can change the public set (all 3 writers below,
 * removeCardFromPublic, AND stores/collection.ts's own
 * deletePublicCardBatches for bulk delete, which writes public_cards
 * directly via writeBatch and bypasses every writer in this file) needs to
 * share ONE window — this module is the only point all of them already
 * converge on. `scheduleIndexReconcile` is exported so
 * deletePublicCardBatches can still participate in the same shared window
 * instead of getting its own, uncoordinated one.
 *
 * Review round 4 (LOW-1), an honesty correction to this comment rather
 * than a behavior change: the trailing call does NOT re-arm a fresh
 * window when it fires. Under SUSTAINED editing (not a single burst — new
 * edits keep arriving right as each window closes), the cadence is a
 * leading+trailing PAIR roughly every RECONCILE_DEBOUNCE_MS, not "one call
 * per window" — e.g. calls land near t=0, 2.0, 2.1, 4.1, 4.2... This is
 * still bounded well below the pre-debounce one-per-edit rate (still
 * capped by the in-flight guard too), so it was left as-is rather than
 * adding re-arming complexity for a case that's already a large
 * improvement over the original bug.
 */
export const RECONCILE_DEBOUNCE_MS = 2000

let _reconcileWindowTimer: ReturnType<typeof setTimeout> | null = null
let _reconcileTrailingPending = false
let _reconcileInFlight = false
let _reconcileQueuedWhileInFlight = false

/**
 * TASK-247 tanda 2c review round 3 (LOW-A): the debounce/in-flight state
 * above lives in module-level singletons with no reset previously
 * exported — tests were relying on execution order to never leave state
 * dirty across tests. Test-only escape hatch, never called from
 * production code.
 */
export function __resetReconcileStateForTests(): void {
  if (_reconcileWindowTimer) clearTimeout(_reconcileWindowTimer)
  _reconcileWindowTimer = null
  _reconcileTrailingPending = false
  _reconcileInFlight = false
  _reconcileQueuedWhileInFlight = false
}

/**
 * TASK-247 tanda 2c review round (MED-1): the server's reconcile holds a
 * lease in Firestore only for the duration of the call
 * (functions/lib/publicCardIndexReconciler.js's acquireReconcileLease), so
 * two client-issued calls close enough together can still land on top of
 * each other even after debouncing coalesces a single burst — the read
 * phase alone (all of the seller's public_cards + the scryfall_cache join)
 * is not instant, so a second burst's debounce can elapse WHILE the first
 * call is still running. Before this fix that second call was simply
 * refused (failed-precondition) and silently dropped — the index would be
 * left one edit behind with nothing to notice or retry.
 *
 * This in-flight guard makes that impossible from THIS tab: a trigger that
 * lands while a call is already in flight is not sent — it's queued, and
 * the queued flag fires exactly one more call the instant the in-flight one
 * settles (success OR failure), so the index still converges on the latest
 * state instead of getting stuck on a refused/dropped attempt.
 *
 * This does NOT cover a genuine cross-tab/cross-session race (two browser
 * tabs of the same seller editing at the same instant) — that residual
 * case still relies on the server lease's own documented self-healing ("the
 * next attempt IS the cleanup", publicCardIndexReconciler.js), not a client
 * retry. A cross-tab fix would need server-side coordination beyond a
 * single tab's in-memory state and is out of this tanda's scope.
 */
function triggerIndexReconcileNow(): void {
  if (_reconcileInFlight) {
    _reconcileQueuedWhileInFlight = true
    return
  }
  _reconcileInFlight = true
  // Dynamic `import('./cloudFunctions')` rather than a static one — same
  // reason stores/collection.ts's applyCardIndexDelta wrapper does it
  // (TASK-232, see that comment): a static import would make importing
  // publicCards.ts eagerly run cloudFunctions.ts's module-top-level
  // `getFunctions(getApp())`, which throws "No Firebase App '[DEFAULT]'" in
  // any test that imports this module (directly or via stores/collection.ts,
  // stores/binders.ts, stores/decks.ts, ...) without also mocking
  // firebase/app — measured: 9 test files broke this way with a static
  // import before this fix.
  import('./cloudFunctions')
    .then(({ reconcilePublicCardIndex }) => reconcilePublicCardIndex())
    .catch((error: unknown) => {
      // Non-blocking and non-fatal: a reconcile failure must never surface
      // as a failure of the card save/sync the user actually asked for,
      // matching the existing non-blocking pattern for these writers' own
      // callers (stores/collection.ts's fire-and-forget syncCardToPublic/
      // batchSyncCardsToPublic calls).
      logSanitizedError('[PublicCards] index reconcile failed (non-fatal)', error, 'warn')
    })
    .finally(() => {
      _reconcileInFlight = false
      if (_reconcileQueuedWhileInFlight) {
        _reconcileQueuedWhileInFlight = false
        triggerIndexReconcileNow()
      }
    })
}

/**
 * Leading+trailing coalescing trigger for the server-side public index
 * reconcile (functions/index.js's `reconcilePublicCardIndex`, self-only,
 * wired in tanda 2b but never invoked from the client until tanda 2c).
 * Called by every writer below on a real change to the public set — see
 * RECONCILE_DEBOUNCE_MS's doc comment for why this fires the FIRST call in
 * a burst immediately and only coalesces the rest.
 */
export function scheduleIndexReconcile(): void {
  if (_reconcileWindowTimer) {
    // Already inside a coalescing window opened by an earlier call in this
    // burst — queue a single trailing call instead of firing again now.
    _reconcileTrailingPending = true
    return
  }
  // Leading edge: fire immediately. This is what makes the reconcile safe
  // against a tab close/unload — nothing waits on the window below.
  triggerIndexReconcileNow()
  _reconcileWindowTimer = setTimeout(() => {
    _reconcileWindowTimer = null
    if (_reconcileTrailingPending) {
      _reconcileTrailingPending = false
      triggerIndexReconcileNow()
    }
  }, RECONCILE_DEBOUNCE_MS)
}

/**
 * TASK-247 tanda 2c review round 4 (MEDIUM-2): syncAllUserCards's own
 * immediate-reconcile guarantee, restored. It used to call
 * triggerIndexReconcileNow() directly; round 3 (MED-B) switched it to the
 * shared scheduleIndexReconcile() for consistency, which regressed the
 * guarantee — if an earlier edit's coalescing window was still open,
 * syncAllUserCards's own call became `_reconcileTrailingPending` instead
 * of firing, silently waiting out whatever was left of that window (up to
 * RECONCILE_DEBOUNCE_MS) with no unload flush and no server-side safety
 * net. That's HIGH-A's exact tab-close failure mode, reintroduced on the
 * one path (an explicit, user-initiated "sync all" the user is told
 * succeeded via a toast right after) the original code kept immediate on
 * purpose.
 *
 * This cancels any open window outright — not just fires alongside it —
 * so a stale trailing call from an EARLIER edit doesn't also fire
 * redundantly once that window would have elapsed; syncAllUserCards's own
 * call already reconciles everything that trailing call would have
 * covered (it just rebuilt the ENTIRE public set). Still routes through
 * triggerIndexReconcileNow's in-flight guard — a currently-running
 * reconcile is queued, not dropped or raced against.
 */
function flushIndexReconcileNow(): void {
  if (_reconcileWindowTimer) {
    clearTimeout(_reconcileWindowTimer)
    _reconcileWindowTimer = null
  }
  _reconcileTrailingPending = false
  triggerIndexReconcileNow()
}

/**
 * Sync a single card to public_cards collection
 * Only syncs cards with status 'trade' or 'sale' AND public: true
 */
export async function syncCardToPublic(
  card: Card,
  userId: string,
  username: string,
  userLocation?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  const publicCardId = `${userId}_${card.id}`
  const publicCardRef = doc(db, 'public_cards', publicCardId)

  if (isPublicCard(card)) {
    // TASK-169: el email NO se publica aca. public_cards se lee SIN login
    // (TASK-085, a proposito, para que un visitante vea quien vende), asi que
    // copiar el correo del dueño en cada documento permitia bajarse en masa
    // los emails de toda la plataforma con una peticion anonima. Verificado
    // en vivo contra dev antes de este arreglo. El contacto vive ahora en
    // contact_info/{userId}, que exige estar logueado para leerse.
    await setDoc(publicCardRef, buildPublicCardDoc(card, userId, username, userLocation, userAvatarUrl))
  } else {
    // Remove from public if not public or status changed.
    //
    // TASK-247 tanda 2c review round 4 (LOW-2), known limitation, left
    // undocumented until now rather than fixed: this swallows EVERY
    // deleteDoc failure, not just "doc doesn't exist" (Firestore's delete
    // is idempotent, so that specific case is expected and fine) — a real
    // failure (permission-denied, unavailable, ...) is silently discarded
    // too, and MED-A's isPossiblyPublicCard guard (stores/collection.ts)
    // means the NEXT edit to a card that's still private won't retry this
    // delete either, unlike before MED-A when every edit unconditionally
    // re-attempted it. A genuinely orphaned public_cards doc from a
    // swallowed real failure now persists until the user runs "sync all"
    // (syncAllUserCards, which unconditionally rebuilds the whole set) or
    // edits the card while it's actually public again. Not fixed here:
    // distinguishing "not-found" from a real failure needs the same
    // isNotFoundError() check collection.ts's deleteCard already uses
    // (functions/index.js's card-doc delete path), which is a NEW,
    // separate change to this function's error handling, not a natural
    // fit for this round's scope.
    await deleteDoc(publicCardRef).catch(() => { /* doc may not exist */ })
  }
  scheduleIndexReconcile()
}

/**
 * Batch sync multiple cards to public_cards using writeBatch
 * Much faster than individual syncCardToPublic calls for bulk operations
 */
export async function batchSyncCardsToPublic(
  cards: Card[],
  userId: string,
  username: string,
  userLocation?: string,
  userAvatarUrl?: string | null,
  onProgress?: (completedChunks: number, totalChunks: number) => void
): Promise<void> {
  if (cards.length === 0) return

  const BATCH_SIZE = 400
  const totalChunks = Math.ceil(cards.length / BATCH_SIZE)
  let completedChunks = 0
  // TASK-247 tanda 2c review round 3 (LOW-C): a batch.commit() failure
  // mid-loop used to propagate straight out of this function, skipping
  // scheduleIndexReconcile() below entirely — any chunk that DID commit
  // successfully before the failure was left un-reconciled with no trace.
  // try/finally: whatever succeeded still gets reconciled even when a
  // later chunk throws; the throw itself still propagates afterward
  // (unchanged — batchSyncCardsToPublic's own callers already handle
  // rejection, e.g. stores/collection.ts's fire-and-forget .catch()).
  let anyChunkSucceeded = false

  try {
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const chunk = cards.slice(i, i + BATCH_SIZE)

      for (const card of chunk) {
        const publicCardId = `${userId}_${card.id}`
        const publicCardRef = doc(db, 'public_cards', publicCardId)

        if (isPublicCard(card)) {
          // TASK-169: sin email, ver syncCardToPublic
          batch.set(publicCardRef, buildPublicCardDoc(card, userId, username, userLocation, userAvatarUrl))
        } else {
          batch.delete(publicCardRef)
        }
      }

      await batch.commit()
      anyChunkSucceeded = true
      completedChunks++
      onProgress?.(completedChunks, totalChunks)
    }
  } finally {
    if (anyChunkSucceeded) scheduleIndexReconcile()
  }
}

/**
 * Remove a card from public_cards collection.
 *
 * TASK-247 tanda 2c review round (HIGH-2): this used to be the one writer
 * in this file that never triggered a reconcile at all — a sold/deleted
 * card's public_cards doc disappeared but its index entry didn't, leaving
 * a "ghost card" (this project's own recurring bug family, project memory)
 * listed and filterable on the public profile until an unrelated add/edit
 * happened to reconcile the index as a side effect.
 */
export async function removeCardFromPublic(cardId: string, userId: string): Promise<void> {
  const publicCardId = `${userId}_${cardId}`
  await deleteDoc(doc(db, 'public_cards', publicCardId)).catch(() => { /* doc may not exist */ })
  scheduleIndexReconcile()
}

/**
 * Sync a preference to public_preferences collection
 */
export async function syncPreferenceToPublic(
  preference: PreferenceInput,
  userId: string,
  username: string,
  userLocation?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  const publicPrefId = `${userId}_${preference.id}`
  const publicPrefRef = doc(db, 'public_preferences', publicPrefId)

  // Filter out undefined values (Firestore doesn't accept them)
  const publicPref: Record<string, string | number | Timestamp | null> = {
    prefId: preference.id,
    userId,
    username,
    avatarUrl: userAvatarUrl ?? null,
    cardName: preference.cardName ?? preference.name ?? '',
    scryfallId: preference.scryfallId ?? '',
    updatedAt: Timestamp.now(),
  }
  if (preference.maxPrice !== undefined) publicPref.maxPrice = preference.maxPrice
  if (preference.minCondition !== undefined) publicPref.minCondition = preference.minCondition
  if (userLocation) publicPref.location = userLocation
  // TASK-169: sin email, ver syncCardToPublic
  await setDoc(publicPrefRef, publicPref)
}

/**
 * Remove a preference from public_preferences collection
 */
export async function removePreferenceFromPublic(prefId: string, userId: string): Promise<void> {
  const publicPrefId = `${userId}_${prefId}`
  await deleteDoc(doc(db, 'public_preferences', publicPrefId)).catch(() => { /* doc may not exist */ })
}

/**
 * Bulk sync all user's cards to public collection
 * Used on initial setup or when user updates profile
 */
export async function syncAllUserCards(
  cards: Card[],
  userId: string,
  username: string,
  userLocation?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  const publicCards = cards.filter(isPublicCard)

  // First, remove all existing public cards for this user
  const existingQuery = query(
    collection(db, 'public_cards'),
    where('userId', '==', userId)
  )
  const existingDocs = await getDocs(existingQuery)

  // Delete in batches of 400 (Firestore limit is 500)
  const BATCH_SIZE = 400
  const docsToDelete = existingDocs.docs

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = docsToDelete.slice(i, i + BATCH_SIZE)
    chunk.forEach(docSnap => batch.delete(docSnap.ref))
    await batch.commit()
  }

  // Add new cards in batches
  for (let i = 0; i < publicCards.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = publicCards.slice(i, i + BATCH_SIZE)

    for (const card of chunk) {
      const publicCardId = `${userId}_${card.id}`
      const publicCardRef = doc(db, 'public_cards', publicCardId)
      // TASK-169: sin email, ver syncCardToPublic
      batch.set(publicCardRef, buildPublicCardDoc(card, userId, username, userLocation, userAvatarUrl))
    }
    await batch.commit()
  }
  // TASK-247 tanda 2c: syncAllUserCards is only ever called from the
  // explicit, user-initiated "sync all" action (stores/collection.ts's
  // syncAllToPublic, which awaits it and only then shows a success toast).
  // Round 3 (MED-B) briefly routed this through the shared
  // scheduleIndexReconcile() for consistency with every other writer, but
  // that let an already-open coalescing window (from an earlier, unrelated
  // single-card edit) silently defer THIS call instead of sending it —
  // regressing back into HIGH-A's exact tab-close loss window on the one
  // path the original code kept immediate on purpose. flushIndexReconcileNow
  // (see its own doc comment) restores that guarantee: it cancels any open
  // window and fires immediately, rather than being coalesced into one.
  flushIndexReconcileNow()
}

/**
 * Bulk sync all user's preferences to public collection
 */
function buildPreferenceData(
  pref: PreferenceInput,
  userId: string,
  username: string,
  userAvatarUrl?: string | null,
  userLocation?: string,
): Record<string, string | number | Timestamp | null> {
  const data: Record<string, string | number | Timestamp | null> = {
    prefId: pref.id,
    userId,
    username,
    avatarUrl: userAvatarUrl ?? null,
    cardName: pref.cardName ?? pref.name ?? '',
    scryfallId: pref.scryfallId ?? '',
    updatedAt: Timestamp.now(),
  }
  if (pref.maxPrice !== undefined) data.maxPrice = pref.maxPrice
  if (pref.minCondition !== undefined) data.minCondition = pref.minCondition
  if (userLocation) data.location = userLocation
  // TASK-169: sin email, ver syncCardToPublic
  return data
}

export async function syncAllUserPreferences(
  preferences: PreferenceInput[],
  userId: string,
  username: string,
  userLocation?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  // First, remove all existing public preferences for this user
  const existingQuery = query(
    collection(db, 'public_preferences'),
    where('userId', '==', userId)
  )
  const existingDocs = await getDocs(existingQuery)

  // Delete in batches of 400
  const BATCH_SIZE = 400
  const docsToDelete = existingDocs.docs

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = docsToDelete.slice(i, i + BATCH_SIZE)
    chunk.forEach(docSnap => batch.delete(docSnap.ref))
    await batch.commit()
  }

  // Add preferences in batches
  for (let i = 0; i < preferences.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = preferences.slice(i, i + BATCH_SIZE)

    for (const pref of chunk) {
      const publicPrefId = `${userId}_${pref.id}`
      const publicPrefRef = doc(db, 'public_preferences', publicPrefId)
      batch.set(publicPrefRef, buildPreferenceData(pref, userId, username, userAvatarUrl, userLocation))
    }
    await batch.commit()
  }
}

/**
 * Find public cards that match user's preferences (BUSCO matches)
 * Returns cards from other users that I'm looking for
 * Matches by card NAME (any printing), not exact scryfallId
 */
export async function findCardsMatchingPreferences(
  preferences: PreferenceInput[],
  excludeUserId: string
): Promise<PublicCard[]> {
  if (preferences.length === 0) {
    return []
  }

  // Get unique card names from preferences
  const cardNames = [...new Set(
    preferences
      .map(p => p.cardName ?? p.name ?? '')
      .filter((name): name is string => !!name && name.length > 0)
  )]

  if (cardNames.length === 0) {
    return []
  }

  // Firestore 'in' query limited to 30 items, so chunk — and run the chunks
  // concurrently (bounded): serially awaiting them made this thousands of
  // sequential round-trips on a large collection.
  const chunks = chunkList(cardNames, FIRESTORE_IN_LIMIT)

  const perChunk = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNK_QUERIES, async (chunk) => {
    const q = query(
      collection(db, 'public_cards'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    const found: PublicCard[] = []
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicCard
      if (data.userId !== excludeUserId) {
        found.push({ ...data, docId: docSnap.id })
      }
    })
    return found
  })

  return perChunk.flat()
}

/**
 * Find public preferences that match user's cards (VENDO matches)
 * Returns preferences from other users for cards I have
 * Matches by card NAME (any printing), not exact scryfallId
 */
export async function findPreferencesMatchingCards(
  cards: Card[],
  excludeUserId: string
): Promise<PublicPreference[]> {
  const tradeableCards = cards.filter(c => c.status === 'trade' || c.status === 'sale')
  if (tradeableCards.length === 0) return []

  // Get unique card names from tradeable cards
  const cardNames = [...new Set(
    tradeableCards
      .map(c => c.name)
      .filter(name => name && name.length > 0)
  )]

  if (cardNames.length === 0) return []

  // Parallel sibling of findCardsMatchingPreferences above — same bounded fanout.
  const chunks = chunkList(cardNames, FIRESTORE_IN_LIMIT)

  const perChunk = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNK_QUERIES, async (chunk) => {
    const q = query(
      collection(db, 'public_preferences'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    const found: PublicPreference[] = []
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicPreference
      if (data.userId !== excludeUserId) {
        found.push({ ...data, docId: docSnap.id })
      }
    })
    return found
  })

  return perChunk.flat()
}

/**
 * Get all public cards for a specific user (for bidirectional matching)
 */
export async function getUserPublicCards(userId: string): Promise<PublicCard[]> {
  const q = query(
    collection(db, 'public_cards'),
    where('userId', '==', userId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ ...d.data(), docId: d.id } as PublicCard))
}

export interface PublicCardsPage {
  cards: PublicCard[]
  /** Last doc of this page — pass back in as `cursor` to fetch the next page. Null once exhausted. */
  cursor: QueryDocumentSnapshot | null
  hasMore: boolean
}

/**
 * Server-side-paginated query for a single user's public cards (TASK-136).
 *
 * Used by the public profile view instead of reading the owner's private
 * users/{uid}/cards subcollection — that subcollection is readable by
 * anyone (see firestore.rules comment) and the view used to download it in
 * full (thousands of docs, including private ones) and filter client-side.
 * /public_cards is safe-by-construction: writers here only ever publish
 * sale/trade cards with public===true (see syncCardToPublic above).
 *
 * Orders by `cardName` to reuse the existing `userId ASC, cardName ASC`
 * composite index (firestore.indexes.json) — no new index deploy needed.
 * Fetches `pageSize + 1` docs to detect `hasMore` without a separate count
 * query; the extra doc is trimmed before returning.
 */
export async function getUserPublicCardsPage(
  userId: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot | null = null
): Promise<PublicCardsPage> {
  const constraints = [
    where('userId', '==', userId),
    orderBy('cardName'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize + 1),
  ]
  const snapshot = await getDocs(query(collection(db, 'public_cards'), ...constraints))

  const hasMore = snapshot.docs.length > pageSize
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs

  return {
    cards: pageDocs.map(d => ({ ...d.data(), docId: d.id }) as PublicCard),
    cursor: pageDocs.length > 0 ? (pageDocs[pageDocs.length - 1] ?? null) : null,
    hasMore,
  }
}

/**
 * Server-side prefix search over a single user's public cards (TASK-138 AC1).
 *
 * Text search on the public profile used to filter only whatever page(s)
 * getUserPublicCardsPage had already loaded (~60 of potentially 5000+ cards)
 * — finding a specific card in a large profile was effectively impossible
 * from the UI. This queries `cardNameLower` directly against Firestore,
 * scoped to `userId`, so it reaches cards regardless of pagination state.
 *
 * Requires the composite index `public_cards: userId ASC, cardNameLower ASC`
 * (firestore.indexes.json) — deploy is manual, done by the team lead.
 *
 * Deliberately NOT cursor-paginated like getUserPublicCardsPage: this is a
 * single capped page (default 50). A "find this card" search returning 50
 * name-prefix matches within one user's profile covers the realistic case;
 * paginating search results themselves would double the gen-token/debounce
 * surface in usePublicProfileCards for a scenario (>50 same-prefix cards for
 * one seller) rare enough not to justify it here.
 */
export async function searchUserPublicCards(
  userId: string,
  term: string,
  pageSize = 50
): Promise<PublicCardsPage> {
  const termLower = term.trim().toLowerCase()
  if (termLower.length < 2) {
    return { cards: [], cursor: null, hasMore: false }
  }

  const constraints = [
    where('userId', '==', userId),
    where('cardNameLower', '>=', termLower),
    where('cardNameLower', '<=', termLower + ''),
    orderBy('cardNameLower'),
    limit(pageSize + 1),
  ]
  const snapshot = await getDocs(query(collection(db, 'public_cards'), ...constraints))

  const hasMore = snapshot.docs.length > pageSize
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs

  return {
    cards: pageDocs.map(d => ({ ...d.data(), docId: d.id }) as PublicCard),
    cursor: pageDocs.length > 0 ? (pageDocs[pageDocs.length - 1] ?? null) : null,
    hasMore,
  }
}

export interface PublicCardStatusCounts {
  sale: number
  trade: number
}

/**
 * Exact sale/trade totals for a user's public profile header (TASK-136 M4,
 * round 2). Decoupled from getUserPublicCardsPage's pagination so the header
 * chips always show the profile's true totals, not just however many cards
 * have been scrolled into view so far.
 *
 * Deliberately two equality-only queries (userId== + status==) rather than
 * one query with an orderBy — equality-only compound filters use Firestore's
 * automatic single-field indexes, so this never needs a new composite index
 * (verified against the deployed index set; see firestore.indexes.json).
 */
export async function getUserPublicCardStatusCounts(userId: string): Promise<PublicCardStatusCounts> {
  const baseCol = collection(db, 'public_cards')
  const [saleSnap, tradeSnap] = await Promise.all([
    getCountFromServer(query(baseCol, where('userId', '==', userId), where('status', '==', 'sale'))),
    getCountFromServer(query(baseCol, where('userId', '==', userId), where('status', '==', 'trade'))),
  ])
  return { sale: saleSnap.data().count, trade: tradeSnap.data().count }
}

/**
 * Total public-card count for a user (TASK-139). Used by UserProfileHoverCard —
 * previously the hover card downloaded the visited user's ENTIRE
 * users/{uid}/cards subcollection via getDocs(where('public','==',true)) just
 * to read snapshot.size, the last residual reader of that ajena subcollection
 * in src/ (blocking TASK-087's firestore.rules tightening). A single
 * equality-only aggregate query gives the same total in one billed read: every
 * doc in /public_cards is already sale or trade by construction (see
 * syncCardToPublic above), so userId== alone equals sale+trade summed —
 * no need for getUserPublicCardStatusCounts' two-query split here.
 *
 * KNOWN DIVERGENCE from the old subcollection count: the old query counted
 * ANY status with public===true (including a 'collection' or 'wishlist' card
 * a user marked public), while /public_cards only ever contains sale/trade
 * (TASK-085 whitelist). Profiles with public wishlist/collection cards will
 * show a lower number here than before — same product-decision gap already
 * flagged as M3 on TASK-136 (pending Rafael).
 */
export async function getUserPublicCardsCount(userId: string): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, 'public_cards'), where('userId', '==', userId))
  )
  return snap.data().count
}

/**
 * Get all public preferences for a specific user (for bidirectional matching)
 */
export async function getUserPublicPreferences(userId: string): Promise<PublicPreference[]> {
  const q = query(
    collection(db, 'public_preferences'),
    where('userId', '==', userId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ ...d.data(), docId: d.id } as PublicPreference))
}

/**
 * Shape of a public_cards search result — matches the inline interface
 * formerly defined in src/views/DashboardView.vue.
 *
 * AMENDMENT B — `extends DocumentData` is REQUIRED so the consumer's
 * `{ id: d.id, ...d.data() } as PublicCardSearchResult` cast compiles.
 */
export interface PublicCardSearchResult extends DocumentData {
  id: string
  cardName?: string
  userId?: string
  edition?: string
  condition?: string
  price?: number
  image?: string
  username?: string
  avatarUrl?: string
  status?: string
  scryfallId?: string
  cardId?: string
  quantity?: number
  foil?: boolean
  location?: string
}

/**
 * Search the denormalized public_cards collection for a card name.
 * Excludes the caller's own cards. Currently does a full-collection
 * scan + client-side substring match (matches DashboardView's prior
 * behavior verbatim — to be optimized in a future phase if scale demands).
 *
 * AMENDMENT B — slice(0, 20) preserves DashboardView:975 cap.
 *
 * @param term Search term, case-insensitive substring match on cardName
 * @param excludeUserId Caller's userId — results owned by this user are filtered out
 */
export const searchPublicCards = async (
  term: string,
  excludeUserId: string,
): Promise<PublicCardSearchResult[]> => {
  const trimmed = term.trim()
  if (!trimmed) return []
  const normalised = trimmed.toLowerCase()

  const cardsRef = collection(db, 'public_cards')
  const snapshot = await getDocs(cardsRef)

  const results: PublicCardSearchResult[] = []
  for (const docSnap of snapshot.docs) {
    const data = { id: docSnap.id, ...docSnap.data() } as PublicCardSearchResult
    if (data.userId === excludeUserId) continue
    const name = (data.cardName ?? '').toLowerCase()
    if (!name.includes(normalised)) continue
    results.push(data)
  }
  return results.slice(0, 20) // Preserves DashboardView:975 cap
}

// ============================================================================
// TASK-247 tanda 3: reading the public card INDEX instead of the raw
// public_cards page.
//
// What this replaces, and why it is a different shape. `getUserPublicCardsPage`
// + `searchUserPublicCards` above are both honest Firestore queries, and both
// are structurally incapable of answering the question the profile UI asks:
//   - the color chips filter over whatever ~60 documents are already in
//     memory, so a profile with 1,412 black documents reports 36;
//   - the text search is a PREFIX query (Firestore has no substring
//     operator), so 'blight' returns 9 of 14 documents and can never reach
//     `Marauding Blight-Priest` or a split card's back face;
//   - `public_cards` carries no Scryfall metadata at all — no colors, no
//     type_line — and `scryfall_cache` requires auth, so an anonymous
//     visitor cannot enrich client-side either.
//
// The index answers all three server-side. Note the two numbers the response
// keeps separate, which today's page conflates into one: `total` is over the
// seller's WHOLE public collection, `cards` is just the page. That separation
// IS the fix.
//
// Not migrated here: usePublicProfileCards / UserProfileView still call the
// two functions above. Rewiring them, and moving the color chips onto the
// OR-inclusive letter vocabulary this index uses, is tanda 4.
// ============================================================================

/** Index rows store the rarity initial; the UI shows the full name. */
const RARITY_BY_INITIAL: Record<string, string> = {
  c: 'common',
  u: 'uncommon',
  r: 'rare',
  m: 'mythic',
}

export interface PublicCardIndexPage {
  cards: Card[]
  /**
   * Documents matching the filter across the seller's ENTIRE public
   * collection — not `cards.length`. `null` means the server caught the
   * index mid-rebuild and refuses to name a number it cannot stand behind;
   * render that as "updating", never as 0 and never as `cards.length`.
   */
  total: number | null
  page: number
  pageSize: number
  hasMore: boolean
  /** `null` while the index is mid-rebuild — see the type in cloudFunctions.ts. */
  facets: PublicCardIndexFacets | null
  indexState: QueryPublicCardIndexResponse['indexState']
}

/**
 * Maps one 13-field index row onto the `Card` shape CollectionGrid,
 * useCardFilter and the exchange cart already expect — the same job
 * `publicCardToCard` does for a raw public_cards document.
 *
 * `image` is DERIVED, not received: the row carries only `s` (scryfallId)
 * and the URL is rebuilt with cardImageProxyUrl (TASK-241). That is ~90
 * bytes per row that never crosses the network, 5.4 KB on a 60-row page,
 * against a project boot budget of 160 KB on slow 4G.
 */
export function publicIndexCardToCard(row: PublicIndexCard): Card {
  return {
    id: row.i,
    scryfallId: row.s,
    name: row.n,
    edition: row.ed,
    // Same rule publicCardToCard follows: '' becomes undefined so
    // cardEnrichment's needsEnrichment still treats it as missing.
    setCode: row.sc || undefined,
    quantity: row.q,
    condition: row.cn as Card['condition'],
    foil: row.f,
    price: row.p,
    image: cardImageProxyUrl(row.s),
    status: row.st,
    public: true,
    colors: row.co,
    type_line: row.t,
    // Only lands carry this, and it is the ONLY thing that gives a land a
    // colour — a Swamp's `colors` is []. Without it the grid cannot draw a
    // land's colour at all, and `useCardFilter`'s land handling
    // (getCardColorCategory/passesColorFilter, which read produced_mana, not
    // colors) has nothing to work with.
    ...(row.pm && row.pm.length > 0 ? { produced_mana: row.pm } : {}),
    rarity: RARITY_BY_INITIAL[row.r],
    // The index stores `ca` (updatedAt) but deliberately does not ship it —
    // it exists to SORT on the server, and the grid never renders it. A
    // fresh Date keeps the required field of Card populated without
    // pretending to a precision the row doesn't carry.
    updatedAt: new Date(),
  }
}

/**
 * One page of a seller's public collection, filtered and counted server-side
 * against the public card index.
 *
 * `userId` is the SELLER being viewed, not the caller — see
 * cloudFunctions.ts's `queryPublicCardIndex` for why that is safe here and
 * was a security hole in `queryCardIndex` (TASK-214). No auth required: an
 * anonymous visitor browsing a public profile is the primary use case.
 */
export async function queryUserPublicCardIndex(
  userId: string,
  options: Omit<QueryPublicCardIndexRequest, 'userId'> = {}
): Promise<PublicCardIndexPage> {
  // Dynamic import for the same reason triggerIndexReconcileNow uses one —
  // see the type-only import at the top of this file.
  const { queryPublicCardIndex } = await import('./cloudFunctions')
  const response = await queryPublicCardIndex({
    userId,
    filters: options.filters ?? {},
    ...(options.sort ? { sort: options.sort } : {}),
    page: options.page ?? 0,
    // 60 matches usePublicProfileCards's DEFAULT_PAGE_SIZE, so migrating the
    // profile onto this path does not change how far one scroll goes.
    pageSize: options.pageSize ?? 60,
    ...(options.mode ? { mode: options.mode } : {}),
  })

  return {
    cards: response.cards.map(publicIndexCardToCard),
    total: response.total,
    page: response.page,
    pageSize: response.pageSize,
    hasMore: response.hasMore,
    facets: response.facets,
    indexState: response.indexState,
  }
}
