import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { backgroundSafeDelay } from '../utils/backgroundSafeDelay'
import { defineStore } from 'pinia'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getCountFromServer,
    getDocs,
    setDoc,
    Timestamp,
    updateDoc,
    writeBatch,
} from 'firebase/firestore'
import { db } from '../services/firestore'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { type Card, type CardCondition, type CardStatus } from '../types/card'
import {
    batchSyncCardsToPublic,
    removeCardFromPublic,
    scheduleIndexReconcile,
    syncAllUserCards,
    syncAllUserPreferences,
    syncCardToPublic,
} from '../services/publicCards'
import { t } from '../composables/useI18n'
import { getCardsByIds } from '../services/scryfallCache'
import { buildEnrichmentPatch } from '../utils/cardEnrichment'
import { cardImageProxyUrl } from '../utils/cardImageUrl'
import { logSanitizedError } from '../utils/logSanitizedError'
import { getCardsNeedingPublicSync, isPossiblyPublicCard } from '../utils/publicSyncFilter'
import { withTimeout } from '../utils/withTimeout'
import type { CardIndexDeltaMutation, QueryCardIndexRequest } from '../services/cloudFunctions'

/**
 * TASK-255 AC1. addDoc/updateDoc/deleteDoc (raw Firestore SDK writes, as
 * opposed to the httpsCallable Cloud Functions elsewhere in this file, which
 * already carry their own 30-60s client timeouts — see cloudFunctions.ts)
 * have NO built-in timeout in the web SDK. Under a bad connection the await
 * can sit pending forever — this is the exact, measured mechanism of the
 * production incident: a deleteDoc that never settled left the save button
 * stuck on "GUARDANDO" forever and skipped the existing failure-compensation
 * logic entirely, since neither the catch nor the finally block ever ran.
 *
 * 20000ms (20s), chosen relative to two already-established numbers in this
 * codebase rather than invented from scratch:
 *   - It sits below the 30-60s timeouts already given to this store's own
 *     httpsCallable writes (applyCardIndexDelta, bulkImportCards) — a
 *     single small document write should not need as much slack as a
 *     Cloud Function invocation that reads/writes multiple chunks.
 *   - TASK-229 measured that a SATURATED write STREAM (a ~24MB card_index
 *     rewrite, not a single doc) can leave promises pending for minutes
 *     before converging — this timeout deliberately does NOT try to cover
 *     that scenario (a single-document write is a tiny fraction of that
 *     payload) and is scoped to "this exact card's write", not the shared
 *     stream.
 * This number has NOT been measured against live throttled 4G — that
 * verification is AC10, owned by the orchestrator in-browser. If AC10 finds
 * 20s too short for a legitimate slow save, raise this constant; the
 * compensation path below stays correct for any value.
 */
const CARD_WRITE_TIMEOUT_MS = 20000

/**
 * Commit a Firestore batch with retry logic (skips retries for permission errors)
 */
const commitBatchWithRetry = async (batchFn: () => ReturnType<typeof writeBatch>, maxRetries = 2): Promise<boolean> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const batch = batchFn()
            await batch.commit()
            return true
        } catch (error: unknown) {
            // TASK-223: both call sites of commitBatchWithRetry are DELETE-only
            // batches (users/{uid}/cards and public_cards cleanup). A real
            // Firestore delete never throws not-found for a missing doc — it's
            // idempotent — so a not-found here can only mean the objective
            // (that document being gone) was already true before this batch
            // ran. Treat it as done rather than retrying (retrying would just
            // hit the same not-found again) or reporting it as a failure that
            // restores an already-deleted card (TASK-223 AC3).
            if (isNotFoundError(error)) {
                logSanitizedError('Batch commit hit not-found — treating as already deleted (TASK-223)', error, 'warn')
                return true
            }
            logSanitizedError(`Batch commit failed (attempt ${attempt + 1}/${maxRetries + 1})`, error, 'warn')
            const msg = error instanceof Error ? error.message : String(error)
            if (msg.includes('permission') || msg.includes('Permission')) {
                return false
            }
            if (msg.includes('resource-exhausted')) {
                // SDK is in maximum backoff — don't retry (SDK retries internally)
                // Wait 30s for the write stream to drain
                console.warn('[Import] Write stream exhausted, waiting 30s for drain...')
                await backgroundSafeDelay(30000)
                return false
            }
            if (attempt < maxRetries) {
                await backgroundSafeDelay(500)
            }
        }
    }
    return false
}

/**
 * TASK-223: true only for the EXACT Firestore error code 'not-found' — the
 * one signal solid enough to justify silently curing a card_index entry
 * (removing a "ghost" whose document is gone). Never matched on message
 * text, and never on any other code (permission-denied, unavailable,
 * deadline-exceeded, resource-exhausted, a network failure, or a plain
 * Error with no code at all) — those must keep behaving exactly as before
 * (rollback + error shown to the user).
 */
function isNotFoundError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'not-found'
}

/** Strip undefined values from an object (Firestore rejects undefined) */
const stripUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
    const clean: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
        // eslint-disable-next-line security/detect-object-injection
        if (value !== undefined) clean[key] = value
    }
    return clean
}

/** Split an array into chunks of a given size */
const chunkArray = <T>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size))
    }
    return chunks
}

/**
 * TASK-232: lazy wrapper around the applyCardIndexDelta Cloud Function —
 * every other cloudFunctions usage in this store is a dynamic import (see
 * loadFromIndex/buildCardIndex/queryCardIndex call sites below) rather than
 * a static one, specifically so importing this store never eagerly calls
 * `getFunctions(getApp())` (src/services/cloudFunctions.ts's module-top-level
 * init) before Firebase itself is guaranteed initialized. A static import
 * broke exactly that in tests that import the store without mocking
 * cloudFunctions (module load blew up with "No Firebase App '[DEFAULT]'").
 */
const applyCardIndexDelta = async (mutations: CardIndexDeltaMutation[]) => {
    const { applyCardIndexDelta: call } = await import('../services/cloudFunctions')
    const response = await call(mutations)
    // TASK-232 gap #2 (team-lead review): a mutation the server could NOT
    // resolve (missing/unreadable chunkId, update target not found in its
    // chunk) is reported back in `skipped`/`skippedIds` rather than thrown —
    // applyCardIndexDelta itself did not fail. Every call site funnels
    // through this one wrapper, so logging here — once — makes a skip
    // visible (console.warn, picked up by whatever the app's log pipeline
    // already captures) instead of a silently stale/missing card_index
    // entry with no trace anywhere the client can see.
    if (response.skipped > 0) {
        console.warn(`[IndexSync] applyCardIndexDelta could not resolve ${response.skipped} mutation(s) — card_index left stale/unindexed for: ${response.skippedIds.join(', ')}`)
    }
    return response
}

/**
 * TASK-247 tanda 2c review round (HIGH-2): this writes public_cards
 * directly via writeBatch, bypassing every writer in services/publicCards.ts —
 * so it never triggered a reconcile at all, even though a bulk delete
 * changes the public set exactly like the writers do. Ends with a single
 * scheduleIndexReconcile() call for the WHOLE batch (not per chunk) —
 * empty-input case (publicCardIds.length === 0) skips the loop entirely
 * and correctly triggers nothing, matching batchSyncCardsToPublic's own
 * early-return-means-no-signal behavior.
 */
const deletePublicCardBatches = async (
    publicCardIds: string[],
    userId: string,
    batchSize: number,
    progress: { completed: number; total: number; onProgress?: (percent: number) => void },
): Promise<void> => {
    if (publicCardIds.length === 0) return
    for (let i = 0; i < publicCardIds.length; i += batchSize) {
        const chunk = publicCardIds.slice(i, i + batchSize)
        const ok = await commitBatchWithRetry(() => {
            const batch = writeBatch(db)
            chunk.forEach(cardId => batch.delete(doc(db, 'public_cards', `${userId}_${cardId}`)))
            return batch
        })

        progress.completed++
        if (progress.onProgress) progress.onProgress(Math.round((progress.completed / progress.total) * 100))

        if (!ok) {
            console.warn(`Failed to delete public_cards batch — skipping remaining public_cards cleanup`)
            const remainingBatches = Math.ceil((publicCardIds.length - i - batchSize) / batchSize)
            progress.completed += Math.max(0, remainingBatches)
            if (progress.onProgress) progress.onProgress(Math.round((progress.completed / progress.total) * 100))
            break
        }

        if (i + batchSize < publicCardIds.length) {
            await backgroundSafeDelay(200)
        }
    }
    scheduleIndexReconcile()
}

// ── Index types ─────────────────────────────────────────────────────────────
/** Compact index card stored in Firestore card_index chunks */
export interface IndexCard {
    i: string      // id
    s: string      // scryfallId
    n: string      // name
    st: string     // status
    q: number      // quantity
    p: number      // price
    cm: number     // cmc
    co: string[]   // colors
    r: string      // rarity (first char)
    t: string      // type_line
    f: boolean     // foil
    sc: string     // setCode (e.g., "ECL")
    e?: string     // edition (set_name humano-legible, e.g., "Lorwyn Eclipsed"). Optional for backward compat with pre-v3 indexes.
    pw: string     // power
    to: string     // toughness
    fa: boolean    // full_art
    pm: string[]   // produced_mana
    kw: string[]   // keywords
    lg: string[]   // legal formats
    ca: number     // createdAt (ms)
    cn: string     // condition
    pb: boolean    // public
    df?: boolean   // dual-faced (has card_faces with separate images)
}

const RARITY_MAP: Record<string, string> = { c: 'common', u: 'uncommon', r: 'rare', m: 'mythic' }

/** Map an IndexCard to a thin Card object (satisfies FilterableCard + Card interface) */
function indexToCard(ic: IndexCard): Card {
    // Expand compact legalities array to Record
    const legalities: Record<string, string> = {}
    for (const fmt of ic.lg) {
        legalities[fmt] = 'legal' // eslint-disable-line security/detect-object-injection
    }

    return {
        id: ic.i,
        scryfallId: ic.s,
        name: ic.n,
        edition: ic.e || ic.sc?.toUpperCase() || '',
        setCode: ic.sc,
        status: ic.st as CardStatus,
        quantity: ic.q,
        price: ic.p,
        cmc: ic.cm,
        colors: ic.co,
        rarity: RARITY_MAP[ic.r] || ic.r,  
        type_line: ic.t,
        foil: ic.f,
        condition: ic.cn as CardCondition,
        public: ic.pb,
        power: ic.pw || undefined,
        toughness: ic.to || undefined,
        full_art: ic.fa,
        produced_mana: ic.pm,
        keywords: ic.kw,
        legalities,
        // Construct image from scryfallId — dual-faced cards get card_faces JSON.
        // TASK-241 AC1: the grid only ever renders a thumbnail, so it requests
        // Scryfall's `thumb` variant (146x204 WEBP, replaces `small`) instead of
        // `normal` (488x680 JPG, ~6.7x heavier).
        // TASK-241 AC2/AC3/AC9 (proxy re-scope): the URL itself is now OUR OWN
        // cardImageProxyUrl (Cloud Function `cardImage` + Firebase Storage cache,
        // see functions/lib/cardImage.js), not cards.scryfall.io directly — the
        // problem this ticket was reopened for is REQUEST COUNT to Scryfall, not
        // bytes (AC1 already fixed bytes). Routing through our own domain means
        // a repeat grid load only ever calls Scryfall once per (variant, face,
        // scryfallId), ever. Both `.normal` and `.small` keys below point at the
        // same proxy URL because CollectionGridCardCompact/Full only ever read
        // `.normal` — see src/stores/collection.ts callers.
        image: ic.s
          ? (ic.df
            ? JSON.stringify({ card_faces: [
                { image_uris: { normal: cardImageProxyUrl(ic.s, 'thumb', 'front'), small: cardImageProxyUrl(ic.s, 'thumb', 'front') } },
                { image_uris: { normal: cardImageProxyUrl(ic.s, 'thumb', 'back'), small: cardImageProxyUrl(ic.s, 'thumb', 'back') } },
              ] })
            : cardImageProxyUrl(ic.s, 'thumb', 'front'))
          : '',
        createdAt: new Date(ic.ca),
        updatedAt: new Date(ic.ca),
    }
}

/** Build a compact IndexCard from a full Card object */
function cardToIndex(card: Card): IndexCard {
    const lg: string[] = []
    if (card.legalities) {
        for (const [fmt, status] of Object.entries(card.legalities)) {
            if (status === 'legal') lg.push(fmt)
        }
    }
    const rarity = card.rarity ? card.rarity.charAt(0) : ''
    return {
        i: card.id,
        s: card.scryfallId,
        n: card.name,
        st: card.status,
        q: card.quantity,
        p: card.price,
        cm: card.cmc ?? 0,
        co: card.colors || [],
        r: rarity,
        t: card.type_line || '',
        f: card.foil,
        sc: card.setCode || '',
        e: card.edition || '',
        pw: card.power || '',
        to: card.toughness || '',
        fa: card.full_art || false,
        pm: card.produced_mana || [],
        kw: card.keywords || [],
        lg,
        ca: card.createdAt ? new Date(card.createdAt).getTime() : Date.now(),
        cn: card.condition,
        pb: card.public !== false,
        df: (() => {
            try { return ((JSON.parse(card.image || '') as { card_faces?: unknown[] }).card_faces?.length ?? 0) > 1 }
            catch { return false }
        })(),
    }
}

/**
 * True when no card_index filter is active (the common default, unfiltered
 * collection view). Used by addCard's optimistic paginatedCards patch (TASK-116)
 * to decide whether a newly added card can safely be assumed to belong on the
 * currently displayed page without replicating the server's full filter engine
 * (functions/index.js filterIndexCards) client-side.
 */
function hasNoActiveFilters(filters: QueryCardIndexRequest['filters']): boolean {
    return !filters.search
        && !filters.status?.length
        && !filters.edition?.length
        && !filters.color?.length
        && !filters.rarity?.length
        && !filters.type?.length
        && filters.foil === undefined
        && !filters.condition?.length
        && filters.minPrice === undefined
        && filters.maxPrice === undefined
}

export const useCollectionStore = defineStore('collection', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    const cards = shallowRef<Card[]>([])
    const cardsById = new Map<string, Card>()
    const loading = ref(false)
    const importing = ref(false)
    // NICE-09: computed from cards so it auto-derives without manual sync
    // D-11 note: loadFromIndex and loadFromFullCards no longer need to set this manually
    const collectionSummary = computed(() => {
        const cardList = cards.value
        if (cardList.length === 0) return null
        const statusCounts: Record<string, number> = {}
        let totalValue = 0
        for (const card of cardList) {
            statusCounts[card.status] = (statusCounts[card.status] || 0) + 1  
            totalValue += (card.price || 0) * card.quantity
        }
        return {
            totalCards: cardList.length,
            totalValue,
            statusCounts,
            loadedCards: cardList.length,
        }
    })
    const lastSyncAt = ref<Date | null>(null)

    // Card index state — compact index for fast load, kept in sync with cards
    const cardIndexRaw = shallowRef<IndexCard[]>([])
    const fullCardCache = new Map<string, Card>() // Cache of full cards fetched via loadCardPage

    /** Rebuild the O(1) card lookup index after any mutation to cards.value */
    function rebuildCardIndex() {
        cardsById.clear()
        for (const card of cards.value) {
            cardsById.set(card.id, card)
        }
    }

    // Helper to get user info for public sync
    const getUserInfo = () => {
        if (!authStore.user) return null
        return {
            userId: authStore.user.id,
            username: authStore.user.username || authStore.user.email?.split('@')[0] || 'Unknown', // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback
            location: authStore.user.location,
            email: authStore.user.email,
            avatarUrl: authStore.user.avatarUrl,
        }
    }

    // ========================================================================
    // CORE OPERATIONS
    // ========================================================================

    /**
     * Load collection via card_index (fast: ~25 reads) with fallback to full load.
     * Maps IndexCard[] → thin Card[] so the entire filtering pipeline works unchanged.
     */
    const loadCollection = async () => {
        if (!authStore.user) return
        loading.value = true
        _indexLoadInFlight = true

        try {
            const userId = authStore.user.id
            const indexLoaded = await loadFromIndex(userId)

            if (!indexLoaded) {
                // No index exists — fallback to full load, build index in background
                console.info('[loadCollection] No card_index found, falling back to full load')
                await loadFromFullCards()

                // Build index in background for next time
                import('../services/cloudFunctions').then(({ buildCardIndex }) => {
                    buildCardIndex().then(result => {
                        console.info(`[loadCollection] Index built: ${result.totalCards} cards → ${result.chunks} chunks`)
                    }).catch((err: unknown) => {
                        logSanitizedError('[loadCollection] Background index build failed', err, 'warn')
                    })
                }).catch(() => {})
            }

            // TASK-219 HIGH-2: only now, having reached here without throwing, does
            // cardIndexRaw hold something real. Flip the gate and replay queued
            // mutations here — inside the success path — rather than unconditionally
            // in `finally`.
            _indexLoadInFlight = false
            // Whatever this load just put in cardIndexRaw predates any mutation
            // the user made while it was running — replay those now (TASK-185).
            applyPendingIndexMutations()
        } catch (error) {
            logSanitizedError('Error loading collection', error)
            toastStore.show(t('collection.messages.loadError'), 'error')
            // TASK-219 HIGH-2: `_indexLoadInFlight` is deliberately left `true`
            // here — both loadFromIndex and the loadFromFullCards fallback failed,
            // so cardIndexRaw is still empty/stale. Flipping the gate (like the
            // success path above) would do one of two things, both wrong:
            //   1. `applyPendingIndexMutations()` would persist that empty/stale
            //      state as the WHOLE index, overwriting real chunks — chunk_0's
            //      2000 real cards replaced by however many mutations queued.
            //   2. Any mutation that resolves right after this (e.g. a deleteCard
            //      whose Firestore await settles moments later) would see the gate
            //      down and persist immediately through `syncIndexOrQueue`, same
            //      corruption via a different door.
            // What results looks perfectly sane on disk — contiguous, no dupes,
            // not truncated — so nothing downstream flags it for a rebuild; the
            // cards just vanish from the index silently. Leaving the gate up
            // routes every mutation through the queue instead (chosen over
            // discarding it: the underlying card write already reached Firestore,
            // the source of truth, so replaying costs nothing once a load
            // succeeds). The queue only drains on a later loadCollection() that
            // reaches the success branch above — every caller (CollectionView,
            // SearchView, MarketView, DeckView, BinderView, SavedMatchesView) already
            // calls loadCollection() again on next mount/visit when cards.value is
            // still empty, so a failed load self-heals on the next natural retry
            // without any new retry mechanism here.
            if (_pendingIndexAdds.length > 0 || _pendingIndexDeletes.size > 0) {
                console.warn(`[IndexSync] loadCollection failed with ${_pendingIndexAdds.length} pending add(s) and ${_pendingIndexDeletes.size} pending delete(s) already queued — leaving them queued for the next successful load instead of persisting against a stale index (TASK-219).`)
            }
        } finally {
            loading.value = false
        }
    }

    // ------------------------------------------------------------------
    // TASK-185: mutations that land WHILE the collection is still loading
    // ------------------------------------------------------------------
    //
    // The grid is painted from `paginatedCards` (the server-side card_index
    // query), which returns in well under a second. `cards.value` and
    // `cardIndexRaw` are only assigned at the END of loadFromIndex, after all
    // ~30 chunks have been read and mapped — many seconds on a large account.
    // The user can see cards and act on them for that whole window.
    //
    // Two things must hold for a mutation that lands inside it:
    //  1. It must still happen. `deleteCard` used to bail out with a silent
    //     `return false` when the card wasn't in `cards.value` yet, so every
    //     delete in this window did nothing at all — no delete, no error, no
    //     toast. That was the reported bug.
    //  2. It must NOT derive card_index state from the not-yet-loaded index.
    //     `_runPersistLoop` writes `cardIndexRaw` as the WHOLE index; running
    //     it against an empty array overwrites chunk_0 (2000 real cards) with
    //     one entry, and the orphan-cleanup guard (TASK-168) does not protect
    //     against that — it only stops chunk DELETION, not chunk overwrite.
    //
    // So the mutation goes through to Firestore (the source of truth) and its
    // index effect is queued, then replayed against the real index the moment
    // the load finishes. The queue is intentionally id-based for deletes: an
    // id is all `syncIndexLocal('delete')` needs.
    let _indexLoadInFlight = false
    const _pendingIndexAdds: Card[] = []
    const _pendingIndexDeletes = new Set<string>()

    /**
     * Record a mutation's index effect, or apply it immediately when the index
     * is already loaded. Returns true if it was applied now (caller persists),
     * false if it was queued (persist happens after the load).
     */
    function syncIndexOrQueue(card: Card, action: 'add' | 'delete'): boolean {
        if (_indexLoadInFlight) {
            if (action === 'delete') {
                _pendingIndexDeletes.add(card.id)
                // A card added and then deleted inside the same window cancels out.
                const queuedAddIdx = _pendingIndexAdds.findIndex(c => c.id === card.id)
                if (queuedAddIdx > -1) _pendingIndexAdds.splice(queuedAddIdx, 1)
            } else {
                _pendingIndexAdds.push(card)
            }
            return false
        }
        syncIndexLocal(card, action)
        return true
    }

    /** Replay queued mutations against the freshly-loaded index, then persist. */
    function applyPendingIndexMutations() {
        if (_pendingIndexDeletes.size === 0 && _pendingIndexAdds.length === 0) return

        const deletes = new Set(_pendingIndexDeletes)
        const adds = [..._pendingIndexAdds]
        _pendingIndexDeletes.clear()
        _pendingIndexAdds.length = 0

        if (deletes.size > 0) {
            cardIndexRaw.value = cardIndexRaw.value.filter(ic => !deletes.has(ic.i))
            cards.value = cards.value.filter(c => !deletes.has(c.id))
            for (const id of deletes) cardsById.delete(id)
            paginatedCards.value = paginatedCards.value.filter(c => !deletes.has(c.id))
        }

        for (const card of adds) {
            if (cardIndexRaw.value.some(ic => ic.i === card.id)) continue
            cardIndexRaw.value = [...cardIndexRaw.value, cardToIndex(card)]
            cards.value = [...cards.value, card]
            cardsById.set(card.id, card)
        }

        console.info(`[IndexSync] Replayed ${deletes.size} deletion(s) and ${adds.length} addition(s) that landed while the collection was loading (TASK-185).`)
        // TASK-219: adds/deletes can shift array positions — full rewrite,
        // same as the equivalent syncIndexLocal branches below.
        markAllChunksDirty()
        persistIndexToFirestore()
    }

    /** Expected index version — bump in Cloud Function when format changes */
    const EXPECTED_INDEX_VERSION = 3

    /**
     * Cards per card_index chunk. Must match INDEX_CHUNK_SIZE in the
     * buildCardIndex Cloud Function — both the writer and the truncation check
     * below depend on the two agreeing.
     */
    const INDEX_CHUNK_SIZE = 2000

    /**
     * TASK-168: whether cardIndexRaw can be trusted as the COMPLETE membership
     * of the collection. Only a full card load, or a card_index read whose
     * chunks were contiguous 0..N-1 with no duplicates, earns `true`.
     *
     * The persist loop deletes every chunk numbered >= totalChunks as an
     * "orphan", where totalChunks comes from cardIndexRaw.length. That is only
     * sound if cardIndexRaw really is everything: a short read makes the cleanup
     * delete chunks holding real cards, widening the very hole it read. Starts
     * false so nothing deletes before a load has established the truth.
     */
    let indexKnownComplete = false

    /**
     * TASK-219 (paso 1 de TASK-176): chunk indices dirtied since the last
     * successful chunk write. `null` means "everything is dirty" — the same,
     * always-safe full-rewrite behavior this store had before TASK-219. It is
     * the default whenever a mutation can shift array positions (add/delete —
     * writing only the shifted-forward chunks is paso 2, deliberately out of
     * scope here) or whenever cardIndexRaw was just replaced wholesale by a
     * load/rebuild, so a fresh in-memory index is never compared position-
     * by-position against a persist plan computed before it existed.
     *
     * Narrowed to a concrete Set only by mutations that provably touch a
     * single known array position without changing length or order —
     * updateCard's single-field patch and batchUpdateCards' status-only
     * batch, both of which keep every card exactly where it already was.
     */
    let _dirtyChunks: Set<number> | null = new Set()

    /** Mark every chunk dirty (the pre-TASK-219 default). */
    function markAllChunksDirty(): void {
        _dirtyChunks = null
    }

    /** Mark only the chunk holding array position `position` dirty. No-op once everything is already dirty. */
    function markChunkDirty(position: number): void {
        if (_dirtyChunks === null) return
        _dirtyChunks.add(Math.floor(position / INDEX_CHUNK_SIZE))
    }

    /**
     * TASK-219 AC2: totalChunks as of the last chunk write that actually
     * completed. The orphan-cleanup getDocs (below) can only ever find
     * something to delete when the collection SHRANK — if totalChunks has
     * not gone down since this snapshot, the ~30MB read is pure waste.
     *
     * Reset to null by every fresh load (loadFromIndex / loadFromFullCards)
     * and by deleteAllCards, so the FIRST persist of a session (or after a
     * wholesale rebuild) always still runs the cleanup once — exactly the
     * pre-TASK-219 behavior — establishing real ground truth for whatever
     * orphans a previous, possibly-interrupted session may have left behind.
     * Only persists AFTER that baseline may skip the read.
     */
    let _lastWrittenTotalChunks: number | null = null

    /** Load from card_index chunks. Returns true if index was found and loaded. */
    const loadFromIndex = async (userId: string): Promise<boolean> => {
        try {
            const indexCol = collection(db, 'users', userId, 'card_index')
            const snapshot = await getDocs(indexCol)

            if (snapshot.empty) return false

            // TASK-168: chunks MUST be consumed in numeric order, and a card id
            // may only be taken once.
            //
            // getDocs returns documents in lexicographic id order, where
            // chunk_10 sorts before chunk_2 — so without an explicit numeric
            // sort a stale high-numbered chunk can shadow the fresh low-numbered
            // entry for the same card. And an orphan chunk (a persist whose
            // write loop or orphan cleanup was interrupted) repeats cards that
            // the surviving low chunks already carry: the old `push(...)`
            // concatenation added them a second time, inflating the collection
            // by up to INDEX_CHUNK_SIZE phantom cards. That inflated array was
            // then persisted by the next mutation, growing totalChunks so the
            // orphan cleanup (which only deletes indices >= totalChunks) stopped
            // deleting — the corruption compounded on itself.
            //
            // This is the read path on purpose: it is the only layer that can
            // defend against an index that is ALREADY corrupt on disk.
            const chunkNumberOf = (id: string | undefined): number => {
                if (typeof id !== 'string') return Number.MAX_SAFE_INTEGER
                const n = parseInt(id.replace('chunk_', ''), 10)
                return isNaN(n) ? Number.MAX_SAFE_INTEGER : n
            }
            const orderedDocs = [...snapshot.docs].sort(
                (a, b) => chunkNumberOf(a.id) - chunkNumberOf(b.id)
            )

            const allIndex: IndexCard[] = []
            const seenIds = new Set<string>()
            let duplicatesDropped = 0
            let indexVersion = 1 // default for chunks without version field
            for (const docSnap of orderedDocs) {
                const data = docSnap.data()
                if (data.cards && Array.isArray(data.cards)) {
                    for (const ic of data.cards as IndexCard[]) {
                        if (seenIds.has(ic.i)) {
                            duplicatesDropped++
                            continue
                        }
                        seenIds.add(ic.i)
                        allIndex.push(ic)
                    }
                }
                if (data.version) indexVersion = data.version as number
            }

            // TASK-168 (segunda vuelta): is this index COMPLETE, or did we just
            // read a hole?
            //
            // Measured live on the dev E2E account: card_index held chunk_0..9
            // and chunk_16..29 — six chunks simply missing — summing 47.093 cards
            // while users/{uid}/cards actually held 59.198. The index was 12.105
            // cards SHORT, not long. That gap is what the orphan cleanup leaves
            // when it is interrupted partway through deleting a trailing range.
            //
            // Why that matters here and not only as a curiosity: the next persist
            // derives totalChunks from cardIndexRaw.length, and then deletes every
            // chunk numbered >= totalChunks as an "orphan". Feed it a short read
            // and it deletes chunks that hold REAL cards — the hole widens itself.
            // So a load that is not provably complete must mark the in-memory
            // index untrustworthy, and the persist must refuse to delete anything
            // on the strength of it.
            const chunkNumbers = orderedDocs.map(d => chunkNumberOf(d.id))
            const isContiguousFromZero = chunkNumbers.every((n, idx) => n === idx)

            // ...and "contiguous from zero" is NOT enough on its own, because a
            // rebuild in flight looks exactly like that. buildCardIndex writes
            // chunk_0..chunk_N-1 SEQUENTIALLY, one awaited setDoc each — measured
            // at 81s for 30 chunks. For that whole window the subcollection holds
            // a contiguous PREFIX, which would sail past the contiguity check as
            // "complete" while being only a fraction of the collection. Then the
            // cleanup deletes everything above the prefix — and a 10-chunk prefix
            // is exactly the ~20.000-card state that must have started the dev
            // account's decay.
            //
            // What separates a prefix from a finished index: in a finished index
            // the LAST chunk is a remainder, so it is full only when the
            // collection size is an exact multiple of INDEX_CHUNK_SIZE. In a
            // prefix, the highest chunk read is always full — it is a middle
            // chunk with more still to come. So a completely full last chunk
            // means "assume there is more we did not see".
            //
            // The false positive (a collection that really is a multiple of 2000)
            // costs one skipped cleanup and one background rebuild. Cheap.
            const lastChunkSize = orderedDocs.length > 0
                ? ((orderedDocs[orderedDocs.length - 1]?.data()?.cards as IndexCard[] | undefined)?.length ?? 0)
                : 0
            const looksTruncated = lastChunkSize === INDEX_CHUNK_SIZE

            const indexLooksComplete = isContiguousFromZero && duplicatesDropped === 0 && !looksTruncated
            indexKnownComplete = indexLooksComplete

            const dfCount = allIndex.filter(ic => ic.df).length
            console.info(`[loadCollection] Loaded card_index: ${allIndex.length} cards from ${snapshot.docs.length} chunks (v${indexVersion}), ${dfCount} dual-faced`)
            if (duplicatesDropped > 0) {
                console.warn(`[loadCollection] card_index was corrupt: dropped ${duplicatesDropped} duplicate entries across ${snapshot.docs.length} chunks (TASK-168). Rebuilding in background.`)
            }
            if (!isContiguousFromZero) {
                console.warn(`[loadCollection] card_index has GAPS — chunks present: [${chunkNumbers.join(', ')}]. The loaded index is incomplete; orphan cleanup is disabled until a rebuild restores it (TASK-168).`)
            }
            if (looksTruncated) {
                console.warn(`[loadCollection] card_index looks TRUNCATED — the highest chunk read (chunk_${chunkNumbers[chunkNumbers.length - 1]}) is completely full, which usually means a rebuild is still writing. Orphan cleanup disabled (TASK-168).`)
            }

            cardIndexRaw.value = allIndex
            cards.value = allIndex.map(indexToCard)
            rebuildCardIndex()
            // collectionSummary auto-derives from cards via computed (NICE-09)

            // TASK-219: this load just became the new known-good baseline — it
            // matches disk by construction, so nothing is dirty yet (NOT
            // "everything dirty": a freshly loaded index needs no rewriting
            // until a mutation actually touches it). Any dirty-chunk tracking
            // from before this load no longer corresponds to real positions.
            // We also don't yet know the on-disk CHUNK COUNT is what we think
            // it is, so the next persist's cleanup still runs once regardless
            // of dirty-chunk narrowing (see indexKnownComplete guard below).
            _dirtyChunks = new Set()
            _lastWrittenTotalChunks = null

            // Auto-rebuild stale, corrupt OR incomplete index in background. The dedup above
            // makes this session correct; the rebuild is what repairs the stored
            // index so the duplicates stop being re-read (and re-persisted) on
            // every future load — including for real users who hit this, without
            // any manual intervention (TASK-168 AC5/AC6).
            if (indexVersion < EXPECTED_INDEX_VERSION || !indexLooksComplete) {
                const reason = indexVersion < EXPECTED_INDEX_VERSION
                    ? `stale (v${indexVersion}, expected v${EXPECTED_INDEX_VERSION})`
                    : duplicatesDropped > 0
                        ? `corrupt (${duplicatesDropped} duplicate entries)`
                        : 'incomplete (missing chunks)'
                console.info(`[loadCollection] Index is ${reason}, rebuilding in background...`)
                import('../services/cloudFunctions').then(({ buildCardIndex: rebuildIndex }) => {
                    rebuildIndex().then(result => {
                        console.info(`[loadCollection] Index rebuilt: ${result.totalCards} cards → ${result.chunks} chunks`)
                    }).catch((err: unknown) => {
                        logSanitizedError('[loadCollection] Background index rebuild failed', err, 'warn')
                    })
                }).catch(() => {})
            }

            return true
        } catch (error) {
            logSanitizedError('[loadFromIndex] card_index read failed, falling back to full load', error, 'warn')
            return false
        }
    }

    /** Fallback: load all cards via Cloud Function (120k reads). Used when no index exists. */
    const loadFromFullCards = async () => {
        const { loadCollectionChunk } = await import('../services/cloudFunctions')

        const all: Card[] = []
        let cursor: string | undefined = undefined
        let isFirstChunk = true

        while (true) {
            const chunk = await loadCollectionChunk(cursor, isFirstChunk, true)
            isFirstChunk = false

            // chunk.summary previously set collectionSummary manually (with totalValue=0, loadedCards=0)
            // Now collectionSummary auto-derives from cards via computed (NICE-09)

            for (const card of chunk.cards) {
                all.push({
                    ...card,
                    updatedAt: card.updatedAt && typeof (card.updatedAt as Record<string, unknown>)._seconds === 'number'
                        ? new Date((card.updatedAt as Record<string, unknown>)._seconds as number * 1000)
                        : new Date(),
                    createdAt: card.createdAt && typeof (card.createdAt as Record<string, unknown>)._seconds === 'number'
                        ? new Date((card.createdAt as Record<string, unknown>)._seconds as number * 1000)
                        : new Date(),
                } as Card)
            }

            if (chunk.hasMore) {
                await backgroundSafeDelay(0)
                cursor = chunk.lastId ?? undefined
            } else {
                break
            }
        }

        cards.value = all
        rebuildCardIndex()

        // Build cardIndexRaw from loaded cards
        cardIndexRaw.value = all.map(cardToIndex)
        // Read straight from the card documents themselves — complete by
        // construction, so orphan cleanup may trust it again (TASK-168).
        indexKnownComplete = true
        // TASK-219: same reasoning as loadFromIndex above — a wholesale
        // replacement invalidates any prior dirty-chunk tracking, and this
        // fresh copy needs no rewriting until something actually mutates it.
        _dirtyChunks = new Set()
        _lastWrittenTotalChunks = null

        if (!importing.value) {
            enrichCardsWithMissingMetadata().catch((err: unknown) => {
                logSanitizedError('[Enrichment] Background enrichment failed', err, 'warn')
            })
        }
    }

    /**
     * Fetch a full Card object (with image, oracle_text, etc.) for detail modals.
     * Uses cache to avoid re-fetching.
     */
    const getFullCard = async (cardId: string): Promise<Card | null> => {
        // Check cache first
        const cached = fullCardCache.get(cardId)
        if (cached) return cached

        try {
            const { loadCardPage } = await import('../services/cloudFunctions')
            const response = await loadCardPage([cardId])
            if (response.cards.length > 0) {
                const raw = response.cards[0] as unknown as Record<string, unknown>
                const card: Card = {
                    ...raw,
                    updatedAt: raw.updatedAt && typeof (raw.updatedAt as Record<string, unknown>)._seconds === 'number'
                        ? new Date((raw.updatedAt as Record<string, unknown>)._seconds as number * 1000)
                        : new Date(),
                    createdAt: raw.createdAt && typeof (raw.createdAt as Record<string, unknown>)._seconds === 'number'
                        ? new Date((raw.createdAt as Record<string, unknown>)._seconds as number * 1000)
                        : new Date(),
                } as Card
                fullCardCache.set(cardId, card)

                // Update the thin card in cards.value with full data
                const idx = cards.value.findIndex(c => c.id === cardId)
                if (idx > -1) {
                    const newCards = [...cards.value]
                    newCards[idx] = card
                    cards.value = newCards
                    cardsById.set(cardId, card)
                }

                return card
            }
        } catch (err) {
            logSanitizedError('[getFullCard] Failed to fetch full card', err, 'warn')
        }
        return cardsById.get(cardId) ?? null
    }

    /**
     * Persist enrichment updates: Scryfall metadata goes to scryfall_cache,
     * only user-specific fields (price) go to the user's card doc.
     */
    const persistEnrichmentBatches = async (updates: { card: Card; data: Partial<Card> }[], userId: string) => {
        const BATCH_SIZE = 400

        // Scryfall metadata fields that belong in the cache (not user docs)
        const CACHE_ONLY_FIELDS = new Set([
            'type_line', 'colors', 'rarity', 'oracle_text', 'keywords',
            'legalities', 'power', 'toughness', 'cmc', 'full_art', 'produced_mana',
            'setCode',
        ])

        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const chunk = updates.slice(i, i + BATCH_SIZE)
            const cacheBatch = writeBatch(db)
            const userBatch = writeBatch(db)
            let hasCacheWrites = false
            let hasUserWrites = false
            const writtenCacheIds = new Set<string>()

            for (const { card, data } of chunk) {
                // Split patch into cache fields and user fields
                const cacheData: Record<string, unknown> = {}
                const userData: Record<string, unknown> = {}

                for (const [key, value] of Object.entries(data)) {
                    if (CACHE_ONLY_FIELDS.has(key)) {
                        cacheData[key] = value
                    } else {
                        // price, image go to user doc
                        userData[key] = value
                    }
                }

                // Write Scryfall metadata to cache (dedup by scryfallId)
                if (Object.keys(cacheData).length > 0 && card.scryfallId && !writtenCacheIds.has(card.scryfallId)) {
                    const cacheRef = doc(db, 'scryfall_cache', card.scryfallId)
                    cacheBatch.set(cacheRef, { ...cacheData, _metadataUpdatedAt: Timestamp.now() }, { merge: true })
                    writtenCacheIds.add(card.scryfallId)
                    hasCacheWrites = true
                }

                // Write user-specific fields (price, image) to user doc
                if (Object.keys(userData).length > 0) {
                    const cardRef = doc(db, 'users', userId, 'cards', card.id)
                    userBatch.set(cardRef, { ...userData, updatedAt: Timestamp.now() }, { merge: true })
                    hasUserWrites = true
                }
            }

            try {
                const commits = []
                if (hasCacheWrites) commits.push(cacheBatch.commit())
                if (hasUserWrites) commits.push(userBatch.commit())
                await Promise.all(commits)
            } catch (err) {
                logSanitizedError(`[Enrichment] Batch ${i / BATCH_SIZE + 1} failed, skipping`, err, 'warn')
            }
        }
    }

    /**
     * Enrich cards missing type_line (and other Scryfall metadata) in background.
     * Fetches from Scryfall by scryfallId and updates both local state and Firestore.
     */
    const enrichCardsWithMissingMetadata = async () => {
        if (!authStore.user?.id) return

        const cardsToEnrich = cards.value.filter(c => c.scryfallId && (!c.type_line || c.produced_mana === undefined))
        if (cardsToEnrich.length === 0) return

        console.info(`[Enrichment] ${cardsToEnrich.length} cards missing metadata, fetching from Scryfall...`)

        const identifiers = cardsToEnrich.map(c => ({ id: c.scryfallId }))
        const scryfallCards = await getCardsByIds(identifiers)
        if (scryfallCards.length === 0) return

        const scryfallMap = new Map(scryfallCards.map(sc => [sc.id, sc]))
        const updates: { card: Card; data: Partial<Card> }[] = []

        const newCards = [...cards.value]
        for (const card of cardsToEnrich) {
            const sc = scryfallMap.get(card.scryfallId)
            if (!sc) continue

            const patch = buildEnrichmentPatch(card, sc as unknown as Record<string, unknown>)
            if (Object.keys(patch).length === 0) continue

            const enriched = { ...card, ...patch }
            const idx = newCards.findIndex(c => c.id === card.id)
            if (idx > -1) newCards[idx] = enriched
            updates.push({ card: enriched, data: patch })
        }

        if (updates.length === 0) return
        cards.value = newCards

        await persistEnrichmentBatches(updates, authStore.user.id)
        console.info(`[Enrichment] Updated ${updates.length} cards with Scryfall metadata`)
    }

    // ========================================================================
    // CARD INDEX SYNC — keeps card_index in sync with card mutations
    // ========================================================================

    /** Sync a single card add/update to the local cardIndexRaw */
    function syncIndexLocal(card: Card, action: 'add' | 'update' | 'delete') {
        const idx = cardIndexRaw.value.findIndex(ic => ic.i === card.id)
        const newIndex = [...cardIndexRaw.value]

        if (action === 'delete') {
            // splice shifts every following position back by one — every chunk
            // from here forward changes. Full rewrite (paso 2 of TASK-176 is
            // narrowing this; out of scope here).
            if (idx > -1) newIndex.splice(idx, 1)
            markAllChunksDirty()
        } else if (action === 'add') {
            // Appended at the END — could still land in a new trailing chunk,
            // and add/delete are explicitly scoped OUT of the narrowing for
            // this ticket (see file header). Full rewrite, same as delete.
            newIndex.push(cardToIndex(card))
            markAllChunksDirty()
        } else if (action === 'update' && idx > -1) {
            // Same length, same order, only this one position's content
            // changes — TASK-219: only its chunk needs to be rewritten.
            newIndex[idx] = cardToIndex(card)
            markChunkDirty(idx)
        }

        cardIndexRaw.value = newIndex
    }

    /**
     * Persist the current cardIndexRaw to Firestore card_index chunks.
     * Debounced (2s) to avoid flooding the Firestore Write channel —
     * rapid calls (e.g. addCard + allocateCardToDeck) coalesce into one persist.
     */
    let _indexPersistTimer: ReturnType<typeof setTimeout> | null = null

    /**
     * Set by addCard/deleteCard (TASK-116) when a mutation changes card_index
     * membership. _doPersistIndex checks this once the debounced persist above
     * has actually flushed, and only then re-queries the current page — an
     * immediate re-query (the pre-fix behavior) would hit the still-stale
     * server card_index and revert/miss the change, the same race TASK-113
     * fixed for updateCard's field-only patches.
     */
    let _pendingMembershipRefresh = false

    /**
     * Generation counter for _doPersistIndex (TASK-116 follow-up, reviewer HIGH
     * PEDIDO #2/#3). At 59k cards a persist is ~30 sequential setDoc calls — a
     * multi-second window. If a second mutation reschedules and its own persist
     * STARTS (enters _doPersistIndex) before the first one's writes finish, the
     * first (now-stale) persist's finally must not be the one to consume
     * _pendingMembershipRefresh: it would call refreshCurrentPage() reading back
     * its own stale snapshot (still containing whatever the second mutation just
     * removed/changed), and since the flag is already consumed, the second
     * (correct) persist's finally never issues the corrective re-query —
     * the wrong state then persists indefinitely. Each _doPersistIndex call
     * captures the post-increment counter; only the invocation whose captured
     * value still matches the live counter at finally-time is allowed to consume
     * the flag, guaranteeing it's always the MOST RECENTLY STARTED persist.
     *
     * That alone isn't sufficient (PEDIDO #3): "latest STARTED" isn't "latest
     * SCHEDULED" — _persistGen only increments when _doPersistIndex is actually
     * ENTERED (the timer firing), not when a newer mutation merely RESCHEDULES
     * the debounce timer. If the second mutation lands in the last <2s of
     * persist-1's writes, timer-2 is pending but hasn't fired yet when
     * persist-1's finally runs — gen still matches, so persist-1 would
     * incorrectly consume the flag. _indexPersistTimer !== null therefore also
     * supersedes a stale persist: a PENDING (not yet fired) timer means a newer
     * mutation is waiting, so no in-flight persist may consume the flag until
     * that timer has fired (see the timeout callback below, which nulls the
     * timer immediately before entering _doPersistIndex).
     */
    let _persistGen = 0

    /**
     * TASK-123 (reviewer MEDIUM from TASK-116): _doPersistIndex writes ~30
     * sequential chunks at 59k cards — a multi-second window. If the debounce
     * timer fires again and calls _doPersistIndex a SECOND time before the
     * first invocation's writes have settled, two write loops run
     * concurrently and their setDoc calls can resolve out of order on the
     * wire — a stale (older-snapshot) write landing AFTER a newer one would
     * silently clobber it, corrupting the persisted card_index.
     * _persistRunning + _persistRerunRequested serialize this: at most one
     * write loop is ever in flight. A call that arrives while one is running
     * is coalesced into a single rerun, which only re-snapshots cardIndexRaw
     * (and starts writing) once the in-flight loop has fully settled — so the
     * chunk writes are never concurrent, and the last loop to run always
     * reflects the newest state. The existing gen-token/_pendingMembershipRefresh
     * dance (TASK-116, PEDIDO #2/#3) is unchanged: it still only fires the
     * deferred grid re-query off the FINAL loop's completion.
     */
    let _persistRunning = false
    let _persistRerunRequested = false

    /**
     * TASK-155: card_index chunks used to be written with a strictly
     * sequential `for (...) { await setDoc(...) }` loop. Measured live
     * against the 41k-card dev account, each chunk setDoc took 4-9s (one
     * took 61s), and a 21-chunk collection could still be mid-loop (chunk
     * 18/21) after 150s of waiting. A page reload during that window loses
     * the index update entirely — the debounce timer and the in-flight
     * async chain both die with the JS context, even though the card
     * document itself already saved.
     *
     * Fix: a bounded-concurrency worker pool, not a single writeBatch.
     * writeBatch was ruled out — a prior attempt at batching 30 chunks
     * (TASK-116/120) failed 5 times in a row hitting Firestore's 10 MiB
     * per-batch limit, and 21 chunks of 2000 cards each don't fit in one
     * 10 MiB batch either (INDEX_CHUNK_SIZE=2000 was sized to keep each
     * chunk safely under the unrelated 1 MB per-document limit, not the
     * 10 MiB batch limit — packing several such chunks into one batch can
     * still blow past 10 MiB). Bounded concurrency writes each chunk as its
     * own independent setDoc (no batch, so no 10 MiB ceiling to hit) while
     * cutting the number of serial steps from `totalChunks` down to
     * `ceil(totalChunks / INDEX_WRITE_CONCURRENCY)`.
     */
    const INDEX_WRITE_CONCURRENCY = 5

    /** Bounded-concurrency worker pool: at most `concurrency` promises from `worker` in flight at once. */
    async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<unknown>, concurrency: number): Promise<void> {
        let nextIndex = 0
        async function runNext(): Promise<void> {
            while (nextIndex < items.length) {
                // eslint-disable-next-line security/detect-object-injection
                const item = items[nextIndex]
                nextIndex++
                // Bounds are already guaranteed by the while condition; the guard
                // exists only because noUncheckedIndexedAccess types this as
                // `T | undefined`. Skipping rather than asserting keeps the pool
                // honest if `items` is ever handed a sparse array.
                if (item === undefined) continue
                await worker(item)
            }
        }
        const workerCount = Math.min(concurrency, items.length)
        await Promise.all(Array.from({ length: workerCount }, () => runNext()))
    }

    /**
     * Write the given card_index chunk numbers with at most
     * INDEX_WRITE_CONCURRENCY setDoc calls in flight at once. TASK-219:
     * `chunkNumbers` is no longer always 0..totalChunks-1 — the caller passes
     * only the chunks that actually changed when it can prove the rest didn't.
     */
    async function writeChunksConcurrently(allIndex: IndexCard[], userId: string, chunkNumbers: number[], chunkSize: number): Promise<void> {
        await runWithConcurrency(chunkNumbers, async (c) => {
            const chunkCards = allIndex.slice(c * chunkSize, (c + 1) * chunkSize)
            const chunkRef = doc(db, 'users', userId, 'card_index', `chunk_${c}`)
            await setDoc(chunkRef, { cards: chunkCards, count: chunkCards.length, updatedAt: Timestamp.now() })
        }, INDEX_WRITE_CONCURRENCY)
    }

    function persistIndexToFirestore() {
        if (_indexPersistTimer) clearTimeout(_indexPersistTimer)
        _indexPersistTimer = setTimeout(() => {
            _indexPersistTimer = null
            _doPersistIndex()
        }, 2000)
    }

    // ------------------------------------------------------------------
    // TASK-232: card_index writes for status-change/delete mutations move
    // server-side (applyCardIndexDelta, functions/index.js) — the client's
    // fragile memoryLocalCache()-backed write queue (TASK-229's measured
    // root cause: under saturation, chunk-write promises never settle, so
    // no catch ever runs and the UI is left with an unreverted optimistic
    // patch and no error) is no longer in the path for these mutations at
    // all. addCard, the TASK-185 in-flight-load replay
    // (applyPendingIndexMutations), and deleteAllCards are OUT of this
    // ticket's scope and keep writing chunks the old way (see TASK-232
    // ticket for why).
    //
    // queueCardIndexDelta/scheduleCardIndexDeltaFlush debounce single-card
    // updateCard calls the same 2s window persistIndexToFirestore used, so
    // a burst of edits coalesces into one Cloud Function call instead of
    // one per card. Bulk paths (batchUpdateCards, deleteCard,
    // batchDeleteCards) already batch internally and call
    // applyCardIndexDelta directly — no debounce needed there.
    // ------------------------------------------------------------------
    const _pendingServerDeltas = new Map<string, 'update' | 'delete'>()
    let _serverDeltaTimer: ReturnType<typeof setTimeout> | null = null
    let _serverDeltaRunning = false
    let _serverDeltaRerunRequested = false
    // TASK-237 M-3: the batch a _runServerDeltaFlush call is currently
    // awaiting applyCardIndexDelta for — invisible to _pendingServerDeltas
    // (already pulled out) but still recoverable if the page tears down
    // before that call lands. See flushPendingCardIndexDeltasOnUnload.
    let _inFlightServerDeltas: Map<string, 'update' | 'delete'> | null = null

    // TASK-237 M-1: a cached reference to sendCardIndexDeltaBeacon, resolved
    // ahead of time by _preloadSendCardIndexDeltaBeacon so the unload
    // handler (flushPendingCardIndexDeltasOnUnload) never has to await a
    // dynamic import() on the critical unload path — a pagehide/
    // visibilitychange handler is not guaranteed to get scheduled time after
    // an await, so resolving this reference has to happen well before the
    // page starts tearing down, not during it.
    type SendBeaconFn = (mutations: CardIndexDeltaMutation[]) => boolean
    let _sendCardIndexDeltaBeaconRef: SendBeaconFn | null = null
    // The in-flight preload promise itself, kept around (not just a boolean
    // flag) so that if the unload handler runs BEFORE this settles, it can
    // chain off this exact same promise instead of starting a second,
    // concurrent import() of the same module — two independent import()
    // calls racing the same specifier is what caused a real, reproduced
    // failure in this ticket's own test suite (a duplicate in-flight import
    // resolved against the real un-mocked module instead of the test's
    // mock). One shared promise avoids that class of bug in tests and
    // avoids a redundant module fetch/eval in production.
    let _sendCardIndexDeltaBeaconPromise: Promise<SendBeaconFn | null> | null = null

    function _preloadSendCardIndexDeltaBeacon(): Promise<SendBeaconFn | null> {
        if (_sendCardIndexDeltaBeaconRef) return Promise.resolve(_sendCardIndexDeltaBeaconRef)
        if (_sendCardIndexDeltaBeaconPromise) return _sendCardIndexDeltaBeaconPromise
        _sendCardIndexDeltaBeaconPromise = import('../services/cloudFunctions')
            .then(({ sendCardIndexDeltaBeacon }) => {
                _sendCardIndexDeltaBeaconRef = sendCardIndexDeltaBeacon
                return sendCardIndexDeltaBeacon
            })
            .catch((err: unknown) => {
                logSanitizedError('[IndexSync] failed to preload sendCardIndexDeltaBeacon — unload flush will fall back to a just-in-time import()', err, 'warn')
                return null
            })
            .finally(() => {
                _sendCardIndexDeltaBeaconPromise = null
            })
        return _sendCardIndexDeltaBeaconPromise
    }

    function queueCardIndexDelta(cardId: string, action: 'update' | 'delete'): void {
        _pendingServerDeltas.set(cardId, action)
        // Kick off the beacon-reference preload the moment there's anything
        // worth flushing on unload — realistically seconds before any
        // conceivable pagehide/visibilitychange, so the reference is almost
        // always warm by the time it's needed.
        void _preloadSendCardIndexDeltaBeacon()
    }

    // TASK-237 AC3: 2000ms is unchanged. Its job is to coalesce a burst of
    // separate updateCard calls (the repro is exactly this — flipping the
    // status pill on 3 cards in a row in CollectionGridCardFull.vue, each a
    // standalone updateCard/queueCardIndexDelta call) into ONE
    // applyCardIndexDelta invocation instead of one per card. Now that AC2
    // below flushes on pagehide/visibilitychange regardless of where the
    // timer is in its countdown, the debounce no longer has any bearing on
    // whether a delta survives a reload — that risk is fully owned by AC2
    // (plus AC4's reconciliation as backstop). So there is no longer a
    // safety reason to shorten it, only a call-volume one, and shortening it
    // would trade call volume for nothing: a user tapping through several
    // cards at a normal skim pace (roughly 1/s) would blow through anything
    // under ~1000-1500ms and turn most bursts back into one call per card,
    // for zero reduction in loss risk. Left at 2000ms.
    function scheduleCardIndexDeltaFlush(): void {
        if (_serverDeltaTimer) clearTimeout(_serverDeltaTimer)
        _serverDeltaTimer = setTimeout(() => {
            _serverDeltaTimer = null
            _runServerDeltaFlush()
        }, 2000)
    }

    // TASK-237 AC2: last-chance delivery when the page is torn down
    // (reload/navigate/close) before the debounce above elapses. Without
    // this, "recargar inmediatamente" permanently loses the pending delta —
    // TASK-232 took the client out of the card_index write path entirely,
    // so nothing else is left to converge it (see the AC3 comment above and
    // the ticket for the measured Corpses of the Lost / Dreadmobile
    // control-negative pair).
    //
    // visibilitychange->hidden fires for tab switches, app backgrounding,
    // and unloads alike (not just unloads) — flushing early there is
    // harmless (idempotent re-application at worst) and is the ONLY
    // reliable signal on mobile Safari, which does not fire pagehide
    // reliably for all dismissal paths. pagehide is kept too as the
    // desktop-reload/navigate signal. A plain beforeunload + normal
    // httpsCallable was explicitly ruled out (TASK-237's known trap): the
    // browser cancels an in-flight fetch once unload starts, so the call
    // must be built by hand with keepalive (see
    // services/cloudFunctions.ts's sendCardIndexDeltaBeacon).
    function flushPendingCardIndexDeltasOnUnload(): void {
        // TASK-237 M-3: merge in whatever _runServerDeltaFlush currently has
        // in flight — it already pulled its batch out of
        // _pendingServerDeltas, which would otherwise make it invisible
        // here. If the page tears down while that call is still in the air,
        // the browser cancels the non-keepalive fetch httpsCallable built
        // for it (the same trap AC2 routes around for the debounce timer),
        // so without this merge that batch would be lost exactly like the
        // original bug, just on a narrower window (debounce elapsed, RTT
        // still pending — real seconds on slow 4G, the target market per
        // project_target_market_slow_4g). In-flight entries are merged
        // first so a newer edit to the same cardId already sitting in
        // _pendingServerDeltas (queued while the call was in flight)
        // overwrites it — last-mutation-wins, matching the server's own
        // dedup (functions/index.js applyCardIndexDelta's byId map).
        const merged = new Map<string, 'update' | 'delete'>()
        if (_inFlightServerDeltas) {
            for (const [cardId, action] of _inFlightServerDeltas) merged.set(cardId, action)
        }
        for (const [cardId, action] of _pendingServerDeltas) merged.set(cardId, action)
        if (merged.size === 0) return
        if (_serverDeltaTimer) {
            clearTimeout(_serverDeltaTimer)
            _serverDeltaTimer = null
        }
        const batch = [...merged.entries()].map(([cardId, action]) => ({ cardId, action }))
        _pendingServerDeltas.clear()
        // Deliberately NOT clearing _inFlightServerDeltas here: the original
        // in-flight applyCardIndexDelta call may still land successfully.
        // Resending its entries via the beacon risks, at worst, a harmless
        // duplicate re-application — applyCardIndexDelta dedupes by cardId
        // and re-reads each card's CURRENT document state rather than
        // replaying a client-supplied payload (functions/index.js, byId map
        // + db.getAll()), so applying the same delta twice is a no-op, not
        // corruption. Losing the entry outright by NOT resending it would
        // not be a no-op. Given that asymmetry (safe-to-duplicate vs.
        // unsafe-to-lose), resend-on-uncertainty is the chosen default.

        // TASK-237 LOW-1: the beacon is one fetch per call and the server
        // rejects a call outright above 500 mutations
        // (functions/index.js applyCardIndexDelta) — chunk the same way
        // _runServerDeltaFlush already does so an oversized pending batch
        // doesn't get dropped entirely. The chunks are NOT independently
        // subject to the browser's 64 KiB keepalive body budget — per the
        // Fetch spec that budget is SHARED across all in-flight keepalive
        // requests, and the loop below fires every chunk synchronously, so
        // they are concurrent, not sequential. At ~45-60 bytes per mutation,
        // two chunks (~1000 cards) already approach the limit; from the 3rd
        // chunk onward the fetch can be silently rejected by the browser
        // (swallowed by sendCardIndexDeltaBeacon's `.catch(() => {})`) —
        // see sendCardIndexDeltaBeacon's doc comment. That scenario is
        // tracked in TASK-238, not addressed here.
        const chunks = chunkArray(batch, 500)

        if (_sendCardIndexDeltaBeaconRef) {
            // M-1: the expected path — a delta was queued earlier in this
            // page's life, so _preloadSendCardIndexDeltaBeacon already
            // resolved this reference. The whole handler runs synchronously
            // through to fetch(), with no await/dynamic import() standing
            // between the unload signal and the network request.
            for (const chunk of chunks) _sendCardIndexDeltaBeaconRef(chunk)
            return
        }

        // Fallback only: the preload above hasn't resolved YET (or was never
        // triggered — defensive; queueCardIndexDelta is the only call site
        // today). Chains off the SAME in-flight promise
        // _preloadSendCardIndexDeltaBeacon already started rather than
        // calling import() a second time — see the doc comment on that
        // promise variable for why a second concurrent import() of the same
        // specifier is unsafe, not just wasteful.
        void _preloadSendCardIndexDeltaBeacon().then((send) => {
            if (!send) {
                // Preload itself already logged the failure.
                return
            }
            for (const chunk of chunks) send(chunk)
        })
    }

    const _handleVisibilityHidden = () => {
        if (document.visibilityState === 'hidden') flushPendingCardIndexDeltasOnUnload()
    }
    const _handlePageHide = () => { flushPendingCardIndexDeltasOnUnload() }
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        document.addEventListener('visibilitychange', _handleVisibilityHidden)
        window.addEventListener('pagehide', _handlePageHide)
        onScopeDispose(() => {
            document.removeEventListener('visibilitychange', _handleVisibilityHidden)
            window.removeEventListener('pagehide', _handlePageHide)
        })
    }

    function _runServerDeltaFlush(): void {
        if (_serverDeltaRunning) {
            _serverDeltaRerunRequested = true
            return
        }
        if (_pendingServerDeltas.size === 0) return
        _serverDeltaRunning = true
        // TASK-237 M-3: snapshot what's about to go in flight BEFORE
        // clearing _pendingServerDeltas, so flushPendingCardIndexDeltasOnUnload
        // can still recover it if the page tears down while this call is
        // awaiting applyCardIndexDelta.
        _inFlightServerDeltas = new Map(_pendingServerDeltas)
        const batch = [..._pendingServerDeltas.entries()].map(([cardId, action]) => ({ cardId, action }))
        _pendingServerDeltas.clear()

        void (async () => {
            try {
                const chunks = chunkArray(batch, 500)
                // URGENT PROD FIX (2026-08-18): applyCardIndexDelta can
                // resolve normally (no throw, HTTP 200) while reporting
                // `skipped > 0` — MEASURED live in prod, a single-card
                // status change returned { applied: 0, skipped: 1 }. Before
                // this fix that response was discarded entirely: the
                // document write had already succeeded, the caller had
                // already returned true, and nothing ever told the user the
                // grid was left showing the old status. A toast here is
                // best-effort visibility (this flush runs seconds after the
                // triggering updateCard call already returned) — it cannot
                // turn updateCard's own return value false in hindsight,
                // but it stops the failure from being completely silent.
                let anySkipped = false
                for (const chunk of chunks) {
                    // eslint-disable-next-line no-await-in-loop
                    const response = await applyCardIndexDelta(chunk)
                    if (response.skipped > 0) anySkipped = true
                }
                if (anySkipped) toastStore.show(t('collection.messages.indexSyncSkipped'), 'info')
            } catch (err) {
                // TASK-232: the card documents themselves are already correct —
                // updateCard already succeeded before queuing this. A failed
                // delta does NOT roll back the mutation and does NOT retry
                // (retrying here risks a loop against a persistently failing
                // call) — card_index is left to a later mutation or the next
                // buildCardIndex rebuild to correct.
                // TASK-232 dev finding, 2026-08-13: a rejection here does NOT
                // mean none of this batch applied. applyChunkTransactions
                // patches each chunk in its own independent transaction, so a
                // mid-batch crash (OOM/timeout) can leave SOME chunks
                // committed and others not — measured 10/29 applied on one
                // OOM'd call. There is no way to learn the real split from
                // here: a hard crash kills the invocation before it can
                // report progress. Logged at 'error' (not 'warn') and worded
                // as unknown-partial rather than uniformly "stale" — that
                // wording was actively misleading given the measurement.
                logSanitizedError(`[IndexSync] applyCardIndexDelta failed for a flush of ${batch.length} — outcome unknown, some or all of these card_index entries may be applied, stale, or mid-way; not retried (see TASK-232 comment above)`, err, 'error')
            } finally {
                // TASK-237 M-3: this call is no longer in flight (settled,
                // one way or another) — nothing left here for
                // flushPendingCardIndexDeltasOnUnload to recover.
                _inFlightServerDeltas = null
                _serverDeltaRunning = false
                if (_serverDeltaRerunRequested) {
                    _serverDeltaRerunRequested = false
                    _runServerDeltaFlush()
                }
            }
        })()
    }

    function _doPersistIndex() {
        if (_persistRunning) {
            // A write loop is already in flight — do not start a second one
            // (that's the interleaving race). Coalesce into a single rerun.
            _persistRerunRequested = true
            return
        }
        _runPersistLoop()
    }

    function _runPersistLoop() {
        const gen = ++_persistGen
        _persistRunning = true
        if (!authStore.user) {
            _persistRunning = false
            _persistRerunRequested = false
            if (gen === _persistGen && _indexPersistTimer === null) _pendingMembershipRefresh = false
            return
        }
        const userId = authStore.user.id

        const allIndex = cardIndexRaw.value
        const totalChunks = Math.ceil(allIndex.length / INDEX_CHUNK_SIZE) || 1

        // TASK-219: capture which chunks are actually dirty right now, then
        // reset the accumulator immediately — same "snapshot, then reset
        // before the async work starts" shape as `gen` above, so mutations
        // landing WHILE this write is in flight are captured cleanly for
        // whichever persist runs next (an organic re-trigger, or the
        // coalesced rerun in the `finally` below), never lost and never
        // double-counted against this run.
        const dirtySnapshot = _dirtyChunks
        _dirtyChunks = new Set()
        // Every call site above marks something dirty before ever scheduling
        // a persist, so a non-null-but-empty snapshot should not happen — but
        // an empty set is not a safe "nothing to write" here (unlike null,
        // which is an explicit "write everything"), so fall back to a full
        // rewrite rather than silently writing nothing.
        //
        // !indexKnownComplete also forces a full rewrite regardless of the
        // snapshot (TASK-168 territory, not touched otherwise): a corrupt or
        // incomplete load's in-memory index may not match what's on disk
        // chunk-for-chunk, and every persist rewriting every chunk was the
        // mechanism that self-healed that mismatch. Narrowing must wait until
        // a later load re-establishes indexKnownComplete = true.
        const chunkNumbers = dirtySnapshot === null || dirtySnapshot.size === 0 || !indexKnownComplete
            ? Array.from({ length: totalChunks }, (_, c) => c)
            : [...dirtySnapshot].filter(c => c < totalChunks)

        // Write chunks in background (fire-and-forget)
        void (async () => {
            try {
                // Delete orphaned chunks (e.g. collection shrank from 5 chunks to 2)
                // BEFORE writing, not after (TASK-168 AC3). This step used to run
                // after the write loop, which meant anything that killed the JS
                // context mid-write — closing the tab, losing wifi, the browser
                // reclaiming the tab — skipped it entirely and left an orphan
                // behind for loadFromIndex to concatenate on the next load.
                //
                // Deleting first is safe and strictly better: orphans are indices
                // >= totalChunks, so every card they hold is already covered by
                // the chunks 0..totalChunks-1 this loop is about to write from the
                // same in-memory array. If the write then dies, the worst outcome
                // is a stale-but-consistent index rather than an inflated one.
                //
                // ...but ONLY when the in-memory index is provably complete
                // (TASK-168, segunda vuelta). Deleting "orphans" off the back of
                // a short read is how chunks holding real cards get destroyed:
                // measured live, the dev account's index was missing chunk_10..15
                // and under-reported the collection by 12.105 cards. When we know
                // the index is incomplete we skip the cleanup entirely and let
                // the background rebuild restore the truth; leaving a genuine
                // orphan behind for one more cycle is harmless (the read path
                // dedups it), while deleting a real chunk is not recoverable
                // from the index alone.
                //
                // TASK-219 AC2: the getDocs read above only exists to find
                // chunks numbered >= totalChunks — which can only happen if
                // totalChunks went DOWN since the last write that actually
                // completed. If it did not, the read is guaranteed to come
                // back with nothing to delete, so skip it. `_lastWrittenTotalChunks
                // === null` (first persist after a load/rebuild, see its
                // reset sites) always falls through to running the check —
                // the one-time cost of establishing ground truth for whatever
                // a prior, possibly-interrupted session may have left behind.
                const totalChunksDidNotShrink = _lastWrittenTotalChunks !== null && totalChunks >= _lastWrittenTotalChunks
                if (indexKnownComplete && totalChunksDidNotShrink) {
                    // Nothing to do — totalChunks can't have shrunk, so no
                    // orphan can exist that this read would have found.
                } else if (indexKnownComplete) {
                    const indexCol = collection(db, 'users', userId, 'card_index')
                    const existingChunks = await getDocs(indexCol)
                    const orphans = existingChunks.docs
                        .map(chunkDoc => ({
                            chunkDoc,
                            num: parseInt(chunkDoc.id.replace('chunk_', ''), 10),
                        }))
                        .filter(({ num }) => !isNaN(num) && num >= totalChunks)
                        // HIGHEST NUMBER FIRST, one at a time (TASK-168). The
                        // deletion used to go in the order getDocs returned —
                        // which is LEXICOGRAPHIC, so chunk_10..chunk_19 come
                        // right after chunk_1 and long before chunk_2. That is
                        // exactly how the dev account lost chunk_10..15 and
                        // nothing else: with totalChunks=10 those six are the
                        // first six entries of the deletion list, and the loop
                        // died after six. An interrupted cleanup therefore
                        // punched a HOLE IN THE MIDDLE — the worst possible
                        // state, because the next read comes back short and
                        // (before the completeness guard above) fed an even
                        // smaller totalChunks back into this same deletion.
                        //
                        // Descending and serial makes an interrupted cleanup
                        // leave a contiguous PREFIX instead: stale, but sound.
                        // Concurrency is deliberately given up here — orphans
                        // are normally one or two documents, and the ordering
                        // guarantee is worth more than the round trips.
                        .sort((a, b) => b.num - a.num)

                    for (const { chunkDoc } of orphans) {
                        await deleteDoc(chunkDoc.ref)
                    }
                } else {
                    console.warn('[IndexSync] Skipping orphan-chunk cleanup: the loaded card_index was incomplete or corrupt, so its length cannot decide which chunks are orphans (TASK-168).')
                }

                await writeChunksConcurrently(allIndex, userId, chunkNumbers, INDEX_CHUNK_SIZE)
                // Only recorded once the write actually completes — a thrown
                // write below must NOT advance this, or a later persist could
                // wrongly conclude totalChunks already matches disk.
                _lastWrittenTotalChunks = totalChunks
            } catch (err) {
                logSanitizedError('[IndexSync] Failed to persist index', err, 'warn')
                // TASK-219 HIGH-1: `dirtySnapshot` was reset to a fresh, empty
                // `_dirtyChunks` before this write started (see above) — but the
                // write just threw, so none of those chunks actually reached
                // disk. Without this, the snapshot is gone for good: the next
                // persist only knows about whatever mutated AFTER this failure,
                // and card_index quietly drifts from the real cards until a
                // full rebuild — the exact class of bug TASK-208 was. Merge it
                // back (union with anything that landed mid-write); `null` on
                // either side means "everything dirty" and wins.
                if (dirtySnapshot === null || _dirtyChunks === null) {
                    _dirtyChunks = null
                } else {
                    for (const c of dirtySnapshot) _dirtyChunks.add(c)
                }
            } finally {
                _persistRunning = false
                if (_persistRerunRequested) {
                    // A newer mutation arrived mid-write — rerun immediately with
                    // a fresh cardIndexRaw snapshot instead of consuming the
                    // deferred-refresh flag here; the rerun (which reflects the
                    // truly newest state) is the one whose completion should.
                    _persistRerunRequested = false
                    _runPersistLoop()
                } else if (gen === _persistGen && _indexPersistTimer === null && _pendingMembershipRefresh) {
                    // TASK-116: run the deferred grid re-query only now that the
                    // write above has settled (success or failure), never immediately,
                    // and only if THIS persist is still the latest STARTED one (gen)
                    // AND no newer mutation has a persist SCHEDULED-but-not-yet-fired
                    // (_indexPersistTimer === null) — see PEDIDO #3 above.
                    _pendingMembershipRefresh = false
                    refreshCurrentPage().catch(() => {})
                }
            }
        })()
    }

    /**
     * TASK-223: remove a "ghost" card — one whose Firestore document no
     * longer exists — from every place it lives in memory (cards.value,
     * cardsById, paginatedCards.value) plus the persisted card_index. Only
     * ever called after a mutation's error resolves EXACT via isNotFoundError;
     * that is the one signal solid enough to justify deleting an entry from a
     * user's inventory without the user having asked for a delete.
     *
     * Reuses syncIndexOrQueue's existing 'delete' path (id-only, see its
     * TASK-185 doc comment) rather than duplicating the queue-vs-immediate
     * decision — a minimal fake Card carrying only `id` is all that path reads.
     *
     * TASK-232: when NOT queued (index already loaded), the server-side
     * removal goes through applyCardIndexDelta instead of the old
     * persistIndexToFirestore full-array client rewrite. The ghost's doc is
     * already gone (that's what makes it a ghost) — applyCardIndexDelta's
     * fallback scan (functions/index.js) locates and removes the entry by
     * id across every chunk instead of skipping, so this still cures the
     * server's card_index, not just the local one. Fire-and-forget, with
     * the deferred grid re-query chained off its OWN settlement (no
     * debounce/gen-token needed here — unlike the old mechanism, there is
     * only ever one ghost-cure delta in flight for a given call).
     * Queued (index load in flight, TASK-185): unchanged — replayed by
     * applyPendingIndexMutations() via the old full-rewrite path once the
     * real index lands; that narrow multi-second window is explicitly out
     * of this ticket's scope.
     */
    function cureGhostCard(cardId: string): void {
        cards.value = cards.value.filter(c => c.id !== cardId)
        cardsById.delete(cardId)
        paginatedCards.value = paginatedCards.value.filter(c => c.id !== cardId)
        if (syncIndexOrQueue({ id: cardId } as Card, 'delete')) {
            void applyCardIndexDelta([{ cardId, action: 'delete' }])
                .catch((err: unknown) => {
                    // TASK-232 dev finding, 2026-08-13: a crash can happen
                    // after the server-side transaction commits but before
                    // the response reaches this catch — "left stale" was an
                    // unverified assumption, not a known outcome.
                    logSanitizedError(`[IndexSync] applyCardIndexDelta failed curing ghost card ${cardId} — outcome unknown, may be applied or stale; not retried`, err, 'error')
                })
                .finally(() => {
                    refreshCurrentPage().catch(() => {})
                })
        }
    }

    /**
     * Add a new card to collection
     */
    const addCard = async (cardData: Omit<Card, 'id' | 'updatedAt'>): Promise<string | null> => {
        if (!authStore.user) return null
        loading.value = true

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const cleanData = stripUndefined(cardData as Record<string, unknown>)
            // TASK-230: sticky chunkId, written once at creation and never
            // recalculated — NOT read anywhere yet, see the ticket for why.
            // Deliberately queries the server's real doc count (matching the
            // bulkImportCards server path) instead of using
            // cards.value.length: cards.value is only fully populated at the
            // END of loadFromIndex (TASK-185's `_indexLoadInFlight` window —
            // see the comment above syncIndexOrQueue), so during that window
            // its .length undercounts and would write a wrong, permanently-
            // sticky chunkId. getCountFromServer sidesteps client load state
            // entirely — same pattern already used in
            // src/services/publicCards.ts and src/services/stats.ts.
            //
            // If the count query itself fails (offline, degraded network —
            // TASK-229 measured this app's central failure mode as writes
            // that don't land under exactly these conditions, and the target
            // market is slow 4G), chunkId is OMITTED rather than guessed or
            // defaulted: a missing field is safely backfillable later, but a
            // wrong sticky value never self-corrects. The add must not gain
            // a hard network dependency it didn't have before this ticket.
            let chunkId: number | undefined
            try {
                const cardCountSnap = await getCountFromServer(colRef)
                chunkId = Math.floor(cardCountSnap.data().count / INDEX_CHUNK_SIZE)
            } catch (countError) {
                logSanitizedError('[TASK-230] Could not read server card count, omitting chunkId', countError)
            }
            // TASK-255 AC1: same reasoning as deleteDoc's wrap below — the
            // raw Firestore write has no built-in timeout.
            const docRef = await withTimeout(addDoc(colRef, {
                ...cleanData,
                ...(chunkId !== undefined ? { chunkId } : {}),
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            }), CARD_WRITE_TIMEOUT_MS, 'addDoc')

            const newCard: Card = {
                id: docRef.id,
                ...cardData,
                updatedAt: new Date(),
                createdAt: new Date(),
            }
            cards.value = [...cards.value, newCard]
            cardsById.set(newCard.id, newCard)

            // Sync index — queued instead if the index is still loading. Without
            // this, persisting a 1-entry cardIndexRaw rewrites chunk_0 and wipes
            // the 2000 real cards stored there (TASK-185).
            if (syncIndexOrQueue(newCard, 'add')) {
                persistIndexToFirestore()
            }

            // TASK-255 AC3 decision: this client-side syncIndexOrQueue +
            // persistIndexToFirestore path above is a debounced, IN-MEMORY,
            // full-chunk rewrite — it is the ONLY path that used to put a
            // brand-new card into card_index, and measurement against the
            // production incident found it losing that race: two cards
            // created in the same session never showed up in either
            // rewritten chunk. Back it up with a single, synchronously
            // awaited, SERVER-authoritative insert — the same
            // allowInsert:true mechanism deleteCard's gap #1 compensation
            // already relies on (TASK-232), which re-reads the doc's real
            // chunkId from Firestore instead of trusting client-side
            // in-memory state or debounce timing. Best-effort: a failure
            // here does not fail the card creation itself (the document,
            // the source of truth, already exists) — mirrors every other
            // applyCardIndexDelta call site in this file. Only reachable
            // when chunkId was actually written above (getCountFromServer
            // succeeded) — the server cannot allowInsert a doc it can't
            // place in a chunk (functions/index.js applyCardIndexDelta);
            // the getCountFromServer failure branch already logs its own
            // reason and stays a pre-existing, out-of-scope gap (TASK-230).
            if (chunkId !== undefined) {
                try {
                    await applyCardIndexDelta([{ cardId: docRef.id, action: 'update', allowInsert: true }])
                } catch (indexError: unknown) {
                    logSanitizedError(`[IndexSync] applyCardIndexDelta allowInsert failed for new card ${docRef.id} — falling back to the debounced client persist above`, indexError, 'warn')
                }
            }

            // Sync to public collection (non-blocking, log-only on failure)
            const userInfo = getUserInfo()
            if (userInfo) {
                syncCardToPublic(newCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.avatarUrl)
                    .catch((err: unknown) => {
                        logSanitizedError('[PublicSync] Error syncing card', err)
                    })
            }

            // Optimistically patch the paginated grid (TASK-116) — CollectionView
            // renders paginatedCards, not cards.value. Only safe to guess
            // membership when on the first page with no active filters (the
            // common default view); otherwise wait for the deferred re-query
            // below rather than replicating the server's filter engine here.
            if (paginationMeta.value.page === 0 && hasNoActiveFilters(_lastQueryFilters)) {
                paginatedCards.value = [...paginatedCards.value, newCard]
            }

            // Re-query the server card_index for the definitive membership/order
            // (covers filtered/other-page cases, and corrects sort position for
            // the optimistic case above) — deferred until the debounced persist
            // above has actually written; an immediate call here would hit the
            // still-stale server index and revert/miss the new card (TASK-113's
            // race, recurring for addCard/deleteCard — see _doPersistIndex).
            _pendingMembershipRefresh = true

            return docRef.id
        } catch (error) {
            logSanitizedError('Error adding card', error)
            toastStore.show(t('collection.messages.addError'), 'error')
            return null
        } finally {
            loading.value = false
        }
    }

    /**
     * Update card details
     * Note: Decks reference cards by ID, so updates automatically reflect everywhere
     */
    const updateCard = async (cardId: string, updates: Partial<Card>): Promise<boolean> => {
        if (!authStore.user) return false

        // Optimistic update: apply to UI immediately
        const index = cards.value.findIndex((c) => c.id === cardId)
        // eslint-disable-next-line security/detect-object-injection
        const existingCard = cards.value[index]
        const snapshot = existingCard ? { ...existingCard } : null
        if (index > -1 && existingCard) {
            const updated = { ...existingCard, ...updates, updatedAt: new Date() }
            const newCards = [...cards.value]
            // eslint-disable-next-line security/detect-object-injection
            newCards[index] = updated
            cards.value = newCards
            cardsById.set(cardId, updated)
        }

        // Also patch the paginated grid — CollectionView renders paginatedCards
        // (fed by the server-side card_index), not cards.value directly.
        const paginatedIndex = paginatedCards.value.findIndex((c) => c.id === cardId)
        // eslint-disable-next-line security/detect-object-injection
        const existingPaginatedCard = paginatedCards.value[paginatedIndex]
        const paginatedSnapshot = existingPaginatedCard ? { ...existingPaginatedCard } : null
        if (paginatedIndex > -1 && existingPaginatedCard) {
            const updatedPaginated = { ...existingPaginatedCard, ...updates, updatedAt: new Date() }
            const newPaginated = [...paginatedCards.value]
            // eslint-disable-next-line security/detect-object-injection
            newPaginated[paginatedIndex] = updatedPaginated
            paginatedCards.value = newPaginated
        }

        try {
            // Strip undefined values — Firestore rejects them
            const cleanUpdates: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(updates)) {
                // eslint-disable-next-line security/detect-object-injection
                if (value !== undefined) cleanUpdates[key] = value
            }

            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            // TASK-255 AC1: same reasoning as deleteCard's wrap — the raw
            // Firestore write has no built-in timeout, and this is the same
            // "guardado" flow (CardDetailModal.handleSave) that hung in the
            // production incident. A timeout here lets this update fall
            // through to the existing rollback+toast branch below instead
            // of leaving the save button stuck forever.
            await withTimeout(updateDoc(cardRef, {
                ...cleanUpdates,
                updatedAt: Timestamp.now(),
            }), CARD_WRITE_TIMEOUT_MS, 'updateDoc')

            // Sync index — LOCAL in-memory only (syncIndexLocal). The
            // Firestore card_index chunk write moves server-side (TASK-232):
            // queue+debounce the same 2s window the old client persist used,
            // so a burst of edits coalesces into one applyCardIndexDelta call.
            // eslint-disable-next-line security/detect-object-injection
            const updatedCard = cards.value[index]
            if (updatedCard) {
                syncIndexLocal(updatedCard, 'update')
                queueCardIndexDelta(cardId, 'update')
                scheduleCardIndexDeltaFlush()

                // Sync to public collection (non-blocking, log-only on failure).
                // TASK-247 tanda 2c review round 3 (MED-A): only call
                // syncCardToPublic when the public set could actually
                // change — either the card WAS public before this update
                // (may need its public_cards doc deleted) or IS public
                // after it (may need one written/updated). Skipping the
                // call entirely when neither is true means publicCards.ts's
                // own reconcile trigger never fires for a private card's
                // ordinary edit either.
                // Round 4 (MEDIUM-1): uses the PERMISSIVE isPossiblyPublicCard
                // (`public !== false`), not publicCards.ts's strict
                // isPublicCard (`public === true`) — see that function's doc
                // comment. A strict guard here skipped this call for legacy
                // cards with no `public` field at all (measured: 7 of 7,374
                // real sale/trade cards), recreating the HIGH-2 ghost-card
                // bug this call exists to prevent.
                const userInfo = getUserInfo()
                if (userInfo && ((existingCard && isPossiblyPublicCard(existingCard)) || isPossiblyPublicCard(updatedCard))) {
                    syncCardToPublic(updatedCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.avatarUrl)
                        .catch((err: unknown) => {
                            logSanitizedError('[PublicSync] Error syncing card update', err)
                        })
                }
            }

            // NOTE: no refreshCurrentPage() here (removed — see TASK-113).
            // The optimistic patch above already keeps paginatedCards in sync;
            // a re-query before the server has caught up would read back the
            // pre-update value and revert the patch we just applied.

            return true
        } catch (error) {
            if (isNotFoundError(error)) {
                // TASK-223: the doc is gone — the optimistic patch above
                // applied a status this card will never actually carry.
                // Self-heal instead of reverting-then-erroring: remove the
                // ghost everywhere and persist, so it just vanishes from the
                // grid rather than flashing back with an error toast.
                // TASK-232: cureGhostCard now chains its own deferred
                // refreshCurrentPage() off the server delta call's
                // settlement — no need to set _pendingMembershipRefresh here
                // (that flag is only consumed by the OLD addCard/
                // applyPendingIndexMutations persist-loop mechanism).
                cureGhostCard(cardId)
                return true
            }
            // Rollback on failure
            if (index > -1 && snapshot) {
                const rollbackCards = [...cards.value]
                // eslint-disable-next-line security/detect-object-injection
                rollbackCards[index] = snapshot
                cards.value = rollbackCards
                cardsById.set(cardId, snapshot)
            }
            if (paginatedIndex > -1 && paginatedSnapshot) {
                const rollbackPaginated = [...paginatedCards.value]
                // eslint-disable-next-line security/detect-object-injection
                rollbackPaginated[paginatedIndex] = paginatedSnapshot
                paginatedCards.value = rollbackPaginated
            }
            logSanitizedError('Error updating card', error)
            toastStore.show(t('collection.messages.updateError'), 'error')
            return false
        }
    }

    /**
     * Batch update multiple cards at once (more efficient than individual updates)
     * Uses Firestore writeBatch for atomic operations (max 500 per batch)
     */
    const batchUpdateCards = async (cardIds: string[], updates: Partial<Card>, onProgress?: (percent: number) => void): Promise<boolean> => {
        if (!authStore.user || cardIds.length === 0) return false

        try {
            const chunks = chunkArray(cardIds, 500)
            const firestoreChunkCount = chunks.length
            const publicSyncChunkCount = Math.ceil(cardIds.length / 400)
            const totalSteps = firestoreChunkCount + publicSyncChunkCount
            let completedSteps = 0

            const cleanUpdates = stripUndefined(updates as Record<string, unknown>)

            // TASK-223: cards that turn out to be ghosts (Firestore doc gone)
            // inside this run — cured after the loop, excluded from the normal
            // "updated" bookkeeping below.
            const ghostCardIds = new Set<string>()

            // URGENT PROD FIX (2026-08-18): applyCardIndexDelta below can
            // resolve with skipped > 0 (index entry not patched) without
            // throwing — same silent-success shape measured in prod for the
            // single-card path. Tracked here so the user gets ONE toast at
            // the end of the bulk op instead of nothing.
            let indexSyncSkippedCount = 0

            for (const chunk of chunks) {
                const batch = writeBatch(db)
                for (const cardId of chunk) {
                    const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
                    batch.update(cardRef, { ...cleanUpdates, updatedAt: Timestamp.now() })
                }
                let chunkGhosts: Set<string> | null = null
                try {
                    await batch.commit()
                } catch (error: unknown) {
                    if (!isNotFoundError(error)) throw error
                    // TASK-223: a writeBatch is atomic — one ghost card in the
                    // chunk aborts the WHOLE chunk, and Firestore doesn't say
                    // which doc caused it. Retry the chunk one card at a time
                    // so the rest of the lot still lands instead of failing
                    // wholesale (AC3).
                    chunkGhosts = new Set<string>()
                    for (const cardId of chunk) {
                        const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await updateDoc(cardRef, { ...cleanUpdates, updatedAt: Timestamp.now() })
                        } catch (innerError: unknown) {
                            if (!isNotFoundError(innerError)) throw innerError
                            ghostCardIds.add(cardId)
                            chunkGhosts.add(cardId)
                        }
                    }
                }

                // TASK-232: patch card_index server-side for this chunk's
                // successfully-updated docs, right after their write lands —
                // same ≤500-per-call granularity as the writeBatch above, no
                // extra debounce needed since batchUpdateCards is already one
                // bulk operation. Ghosts (doc gone) are excluded here — they
                // go through the fallback-scan removal path below instead.
                const chunkSurvivors = chunkGhosts ? chunk.filter(id => !chunkGhosts.has(id)) : chunk
                if (chunkSurvivors.length > 0) {
                    try {
                        const deltaResponse = await applyCardIndexDelta(chunkSurvivors.map(cardId => ({ cardId, action: 'update' as const })))
                        indexSyncSkippedCount += deltaResponse.skipped
                    } catch (deltaError: unknown) {
                        // TASK-232 dev finding, 2026-08-13: outcome unknown on
                        // failure, not "left stale" — see _runServerDeltaFlush's
                        // comment for why (mid-batch crash can leave some
                        // chunks committed).
                        logSanitizedError(`[IndexSync] applyCardIndexDelta failed for a batchUpdateCards chunk of ${chunkSurvivors.length} — outcome unknown, some or all of these card_index entries may be applied, stale, or mid-way; not retried`, deltaError, 'error')
                    }
                }

                completedSteps++
                onProgress?.(Math.round((completedSteps / totalSteps) * 100))
            }

            const survivingCardIds = ghostCardIds.size > 0
                ? cardIds.filter(id => !ghostCardIds.has(id))
                : cardIds

            // Save which cards were previously public-eligible (sale/trade)
            // Only these could have public_cards docs that need cleanup
            const previouslyPublicIds = new Set<string>()
            for (const cardId of survivingCardIds) {
                const card = cards.value.find(c => c.id === cardId)
                if (card && (card.status === 'sale' || card.status === 'trade')) {
                    previouslyPublicIds.add(cardId)
                }
            }

            // Update local state
            const updatedCards = applyLocalCardUpdates(survivingCardIds, updates)

            // Also patch the paginated grid — CollectionView renders paginatedCards
            // (fed by the server-side card_index), not cards.value directly.
            applyPaginatedCardUpdates(survivingCardIds, updates)

            // Sync LOCAL in-memory cardIndexRaw only — the Firestore write for
            // these cards already happened above, per-chunk, via
            // applyCardIndexDelta (TASK-232). Single O(n+k) pass, not per-card
            // syncIndexLocal (O(n) findIndex + full-array copy EACH call —
            // with select-all on a 59k-card index that's a guaranteed
            // multi-second freeze / Mali crash).
            if (updatedCards.length > 0) {
                const updatedById = new Map(updatedCards.map(c => [c.id, c]))
                cardIndexRaw.value = cardIndexRaw.value.map((ic) => {
                    const updated = updatedById.get(ic.i)
                    return updated ? cardToIndex(updated) : ic
                })
            }

            // TASK-223: cure every ghost discovered in this run — removed from
            // every in-memory place. cards.value/cardsById/paginatedCards.value
            // are always safe to patch immediately (mirrors cureGhostCard /
            // deleteCard). The index itself is NOT touched directly here —
            // reviewer HIGH-1: during the TASK-185 in-flight-load window
            // cardIndexRaw is empty and indexKnownComplete is false, so writing
            // straight to cardIndexRaw.value would force a full rewrite with
            // totalChunks=1 and clobber chunk_0's real cards. Route each ghost
            // through the SAME _indexLoadInFlight gate cureGhostCard/deleteCard
            // already use (syncIndexOrQueue) instead of inventing a second
            // mechanism — queued ghosts are replayed by
            // applyPendingIndexMutations() once the load's real index lands.
            //
            // TASK-232: when NOT queued, removal goes through
            // applyCardIndexDelta (whose fallback scan locates a ghost by id
            // across every chunk, since its doc is already gone — same as
            // cureGhostCard) instead of the old full-array client rewrite.
            const ghostIdsAppliedNow: string[] = []
            if (ghostCardIds.size > 0) {
                cards.value = cards.value.filter(c => !ghostCardIds.has(c.id))
                for (const id of ghostCardIds) cardsById.delete(id)
                paginatedCards.value = paginatedCards.value.filter(c => !ghostCardIds.has(c.id))
                for (const id of ghostCardIds) {
                    // syncIndexOrQueue's 'delete' path only reads card.id — see
                    // its TASK-185 doc comment — a minimal fake Card is enough
                    // (same technique cureGhostCard already uses).
                    if (syncIndexOrQueue({ id } as Card, 'delete')) {
                        ghostIdsAppliedNow.push(id)
                    }
                }
                // Membership changed (a card is now gone) — defer a corrective
                // re-query the same way deleteCard/batchDeleteCards already do
                // (MEDIUM-1); status-only updates above intentionally do NOT do
                // this (TASK-120 AC4 precedent, unchanged), but removing a card
                // is a membership change, not a field patch.
                _pendingMembershipRefresh = true
            }

            if (ghostIdsAppliedNow.length > 0) {
                void applyCardIndexDelta(ghostIdsAppliedNow.map(cardId => ({ cardId, action: 'delete' as const })))
                    .catch((err: unknown) => {
                        logSanitizedError(`[IndexSync] applyCardIndexDelta failed curing ${ghostIdsAppliedNow.length} ghost card(s) in batchUpdateCards — outcome unknown, may be applied or stale; not retried`, err, 'error')
                    })
                    .finally(() => {
                        if (_pendingMembershipRefresh) {
                            _pendingMembershipRefresh = false
                            refreshCurrentPage().catch(() => {})
                        }
                    })
            }

            // Only sync cards that transition to/from public state
            const cardsToSync = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)

            // Batch sync to public_cards (non-fatal — card updates already succeeded)
            const userInfo = getUserInfo()
            if (userInfo && cardsToSync.length > 0) {
                const progressCb = onProgress
                    ? (completed: number) => { onProgress(Math.round(((firestoreChunkCount + completed) / totalSteps) * 100)) }
                    : undefined
                batchSyncCardsToPublic(cardsToSync, userInfo.userId, userInfo.username, userInfo.location, userInfo.avatarUrl, progressCb)
                    .catch((err: unknown) => { logSanitizedError('[PublicSync] Batch sync failed (non-fatal)', err) })
            }

            // URGENT PROD FIX (2026-08-18): see indexSyncSkippedCount above —
            // the Firestore documents are correct at this point (that's what
            // "return true" below means), but if the server reported any
            // card_index entries as skipped the grid can still show the old
            // state until a later mutation or rebuild corrects it. One toast
            // for the whole bulk op, not one per skipped card.
            if (indexSyncSkippedCount > 0) toastStore.show(t('collection.messages.indexSyncSkipped'), 'info')

            return true
        } catch (error) {
            logSanitizedError('Error batch updating cards', error)
            toastStore.show(t('collection.messages.batchUpdateError'), 'error')
            return false
        }
    }

    /** Apply updates to local card state and return the updated cards */
    const applyLocalCardUpdates = (cardIds: string[], updates: Partial<Card>): Card[] => {
        const updatedCards: Card[] = []
        const newCards = [...cards.value]
        for (const cardId of cardIds) {
            const index = newCards.findIndex((c) => c.id === cardId)
            // eslint-disable-next-line security/detect-object-injection
            const existingCard = newCards[index]
            if (index === -1 || !existingCard) continue
            const updatedCard = { ...existingCard, ...updates, updatedAt: new Date() }
            // eslint-disable-next-line security/detect-object-injection
            newCards[index] = updatedCard
            cardsById.set(cardId, updatedCard)
            updatedCards.push(updatedCard)
        }
        if (updatedCards.length > 0) cards.value = newCards
        return updatedCards
    }

    /**
     * Apply the same patch to matching cards in paginatedCards (the array the
     * collection grid actually renders). No-op for ids not on the current page.
     */
    const applyPaginatedCardUpdates = (cardIds: string[], updates: Partial<Card>): void => {
        if (paginatedCards.value.length === 0 || cardIds.length === 0) return
        const idSet = new Set(cardIds)
        let changed = false
        const newPaginated = paginatedCards.value.map((c) => {
            if (!idSet.has(c.id)) return c
            changed = true
            return { ...c, ...updates, updatedAt: new Date() }
        })
        if (changed) paginatedCards.value = newPaginated
    }

    /**
     * Delete a single card from collection (optimistic UI)
     * Removes from UI immediately, then syncs with Firebase in background
     * If Firebase fails, restores the card and shows error
     */
    const deleteCard = async (cardId: string): Promise<boolean> => {
        if (!authStore.user) return false

        // Find and remove card optimistically (immediate UI update).
        //
        // TASK-185: `cards.value` is NOT the only place the card can live. The
        // grid renders `paginatedCards`, which is populated seconds earlier by
        // the server-side index query, so during the initial load the user can
        // right-click a perfectly visible card that `cards.value` doesn't know
        // about yet. This used to `return false` and do nothing — no delete, no
        // error, no toast. Resolve the card from wherever it actually is; the
        // bulk path (batchDeleteCards) has always deleted by id without this
        // gate, which is why bulk delete worked and single delete didn't.
        const cardIndex = cards.value.findIndex(c => c.id === cardId)
        const deletedCard = cardIndex > -1
            // eslint-disable-next-line security/detect-object-injection
            ? cards.value[cardIndex]
            : (cardsById.get(cardId) ?? paginatedCards.value.find(c => c.id === cardId))
        // Still nothing anywhere: there is no card under this id to delete.
        if (!deletedCard) return false

        if (cardIndex > -1) {
            cards.value = cards.value.filter(c => c.id !== cardId)
        }
        cardsById.delete(cardId)

        // Also patch the paginated grid (TASK-116) — CollectionView renders
        // paginatedCards, not cards.value. No-op if the card isn't on this page.
        const paginatedIndex = paginatedCards.value.findIndex((c) => c.id === cardId)
        if (paginatedIndex > -1) {
            paginatedCards.value = paginatedCards.value.filter((c) => c.id !== cardId)
        }

        // Sync with Firebase in background
        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)

            // TASK-232: resolve+remove the card_index entry server-side BEFORE
            // deleting the card doc — applyCardIndexDelta reads chunkId off the
            // doc itself, so the doc must still exist when this runs. Best-effort:
            // a failure here does NOT block the actual delete below (the card
            // document, the source of truth, must still go away when the user
            // asks) — it just leaves that one entry stale in card_index until a
            // later mutation or rebuild touches it.
            try {
                await applyCardIndexDelta([{ cardId, action: 'delete' }])
            } catch (deltaError: unknown) {
                // TASK-232 dev finding, 2026-08-13: outcome unknown on
                // failure, not "left stale" — a crash can land after the
                // server-side transaction commits but before this catch runs.
                logSanitizedError(`[IndexSync] applyCardIndexDelta failed for delete of card ${cardId} — outcome unknown, may be applied or stale; not retried`, deltaError, 'error')
            }

            try {
                // TASK-255 AC1/AC2: withTimeout is the whole fix here. A
                // deleteDoc that HANGS (the measured production mechanism —
                // not a rejection) never used to reach this catch, so the
                // gap #1 compensation below never ran and the card_index
                // delete above was left standing with no matching doc
                // deletion — an invisible card. Wrapping the raw Firestore
                // write in a timeout converts a hang into a rejection after
                // CARD_WRITE_TIMEOUT_MS, which funnels into the SAME
                // compensation branch already proven for a genuine failure
                // (TASK-232 gap #1) — no new compensation logic needed, the
                // hang just needed a way to actually arrive here.
                await withTimeout(deleteDoc(cardRef), CARD_WRITE_TIMEOUT_MS, 'deleteDoc')
            } catch (error) {
                if (isNotFoundError(error)) {
                    // TASK-223: the doc is already gone — deleteCard's entire
                    // objective (the card not existing) is already true. Fall
                    // through to the same success path below instead of the
                    // restore-on-failure branch; there is nothing to roll back.
                } else {
                    // TASK-232 gap #1: the delta above may have already
                    // removed the card_index entry, but the doc delete itself
                    // just failed for real — the card still exists. Without
                    // this, it becomes an invisible card (document alive,
                    // index entry gone). Compensate: re-insert its entry
                    // (allowInsert:true — the doc still exists with its real
                    // chunkId, so this is grounded in a fresh server read,
                    // not a guess) before the outer catch restores the UI.
                    try {
                        await applyCardIndexDelta([{ cardId, action: 'update', allowInsert: true }])
                    } catch (restoreError: unknown) {
                        logSanitizedError('[IndexSync] Failed to restore card_index entry after a failed delete — card may be invisible until the next rebuild', restoreError)
                    }
                    throw error
                }
            }

            // Sync LOCAL in-memory index — queued instead if the index is still
            // loading (TASK-185). No Firestore write here: the call above
            // already patched (or best-effort attempted) the server's
            // card_index directly.
            syncIndexOrQueue(deletedCard, 'delete')

            // Remove from public collection (non-blocking, log-only on failure).
            // TASK-247 tanda 2c review round 3 (MED-A), permissive guard as
            // of round 4 (MEDIUM-1) — see updateCard's own isPossiblyPublicCard
            // guard above for the full rationale. A card that never had a
            // public_cards doc has nothing to delete and needs no reconcile.
            if (isPossiblyPublicCard(deletedCard)) {
                removeCardFromPublic(cardId, authStore.user.id)
                    .catch((err: unknown) => {
                        logSanitizedError('[PublicSync] Error removing card', err)
                    })
            }

            // Re-query the server card_index for the definitive membership/order
            // (fills the gap left by the deleted card, corrects total/hasMore).
            // Safe to call directly now — unlike the old debounced client
            // persist, applyCardIndexDelta above was already awaited, so the
            // server index has already caught up (or the failure was logged).
            refreshCurrentPage().catch(() => {})

            return true
        } catch (error) {
            // Restore card on failure
            logSanitizedError('Error deleting card', error)
            // Only put it back where it was actually removed from — with the
            // TASK-185 fix, `cards.value` may never have held it (splice(-1)
            // would insert it at the wrong end of the array).
            if (cardIndex > -1) {
                const restored = [...cards.value]
                restored.splice(cardIndex, 0, deletedCard)
                cards.value = restored
            }
            cardsById.set(cardId, deletedCard)
            if (paginatedIndex > -1) {
                const restoredPaginated = [...paginatedCards.value]
                restoredPaginated.splice(paginatedIndex, 0, deletedCard)
                paginatedCards.value = restoredPaginated
            }
            toastStore.show(t('collection.messages.deleteError'), 'error')
            return false
        }
    }

    /**
     * Delete ALL cards for current user
     */
    const deleteAllCards = async (): Promise<boolean> => {
        if (!authStore.user) return false

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const snapshot = await getDocs(colRef)

            // Optimistic: clear UI immediately so price fetch stops writing
            cards.value = []
            cardsById.clear()
            cardIndexRaw.value = []
            // Everything is gone and this path deletes every chunk itself, so
            // "empty" is the complete truth (TASK-168).
            indexKnownComplete = true
            // TASK-219: this path deletes every chunk itself below, bypassing
            // _runPersistLoop entirely — reset so a later persist this session
            // doesn't trust stale dirty/chunk-count bookkeeping from before the wipe.
            _dirtyChunks = new Set()
            _lastWrittenTotalChunks = null

            // Delete card_index chunks so deleted cards don't reappear on reload.
            // Use batches of 10 to avoid "Transaction too big" (each chunk is ~400KB).
            const indexCol = collection(db, 'users', authStore.user.id, 'card_index')
            const indexSnapshot = await getDocs(indexCol)
            if (!indexSnapshot.empty) {
                const IDX_BATCH = 10
                for (let idx = 0; idx < indexSnapshot.docs.length; idx += IDX_BATCH) {
                    const chunk = indexSnapshot.docs.slice(idx, idx + IDX_BATCH)
                    const batch = writeBatch(db)
                    for (const idxDoc of chunk) {
                        batch.delete(idxDoc.ref)
                    }
                    await batch.commit()
                }
            }

            const BATCH_SIZE = 500
            const docs = snapshot.docs
            for (let i = 0; i < docs.length; i += BATCH_SIZE) {
                const chunk = docs.slice(i, i + BATCH_SIZE)
                const batch = writeBatch(db)
                for (const d of chunk) {
                    batch.delete(doc(db, 'users', authStore.user.id, 'cards', d.id))
                }
                await batch.commit()
                if (i + BATCH_SIZE < docs.length) {
                    await backgroundSafeDelay(50)
                }
            }

            toastStore.show(t('collection.messages.allDeleted'), 'success')
            return true
        } catch (error) {
            logSanitizedError('Error deleting all cards', error)
            await loadCollection()
            toastStore.show(t('collection.messages.deleteAllError'), 'error')
            return false
        }
    }

    /**
     * Delete multiple cards efficiently using Firestore batch
     * Optimistic UI: removes from UI immediately, then syncs with Firebase
     */
    const batchDeleteCards = async (cardIds: string[], onProgress?: (percent: number) => void): Promise<{ success: boolean; deleted: number; failed: number }> => {
        if (!authStore.user || cardIds.length === 0) return { success: true, deleted: 0, failed: 0 }

        // Save cards for potential restore on error
        const idsToDelete = new Set(cardIds)

        // Remove from UI in ONE operation (single reactive trigger instead of N splices)
        const deletedCards = cards.value.filter(card => idsToDelete.has(card.id))
        cards.value = cards.value.filter(card => !idsToDelete.has(card.id))
        rebuildCardIndex()

        // Also patch the paginated grid (TASK-120, same class as TASK-113/116) —
        // CollectionView renders paginatedCards, not cards.value. Remember which
        // of the deleted ids were actually on the current page so a failed-delete
        // rollback (below) only restores entries that were visible to begin with.
        const paginatedIdsBeforeDelete = new Set(
            paginatedCards.value.filter(c => idsToDelete.has(c.id)).map(c => c.id)
        )
        paginatedCards.value = paginatedCards.value.filter(c => !idsToDelete.has(c.id))

        const BATCH_SIZE = 200
        const userId = authStore.user.id
        let totalDeleted = 0
        let totalFailed = 0
        const failedIds = new Set<string>()

        // Only sale/trade cards exist in public_cards
        const publicCardIds = deletedCards
            .filter(card => card.status === 'sale' || card.status === 'trade')
            .map(card => card.id)

        const totalBatches = Math.ceil(cardIds.length / BATCH_SIZE) + Math.ceil(publicCardIds.length / BATCH_SIZE)
        let completedBatches = 0

        // Phase 0 (TASK-232): resolve+remove card_index entries server-side
        // BEFORE deleting the card docs in Phase 1 — applyCardIndexDelta
        // reads each doc's own chunkId, so the docs must still exist when
        // this runs. Batched into groups of ≤500 mutations per call. If a
        // specific card's Phase 1 delete then fails for real, its entry is
        // restored below (gap #1 compensation) — same as deleteCard.
        for (const chunk of chunkArray(cardIds, 500)) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await applyCardIndexDelta(chunk.map(cardId => ({ cardId, action: 'delete' as const })))
            } catch (deltaError: unknown) {
                // TASK-232 dev finding, 2026-08-13: outcome unknown on
                // failure, not "left stale" — applyChunkTransactions commits
                // each affected chunk independently, so a mid-batch crash
                // (OOM/timeout) can leave some of this chunk's deletes
                // applied and others not.
                logSanitizedError(`[IndexSync] applyCardIndexDelta failed for a batchDeleteCards chunk of ${chunk.length} — outcome unknown, some or all of these card_index entries may be applied, stale, or mid-way; not retried`, deltaError, 'error')
            }
        }

        // Phase 1: Delete user cards in batches
        for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
            const chunk = cardIds.slice(i, i + BATCH_SIZE)

            const ok = await commitBatchWithRetry(() => {
                const batch = writeBatch(db)
                chunk.forEach(cardId => batch.delete(doc(db, 'users', userId, 'cards', cardId)))
                return batch
            })

            if (ok) {
                totalDeleted += chunk.length
            } else {
                totalFailed += chunk.length
                chunk.forEach(cardId => failedIds.add(cardId))
            }

            completedBatches++
            if (onProgress) onProgress(Math.round((completedBatches / totalBatches) * 100))

            if (i + BATCH_SIZE < cardIds.length) {
                await backgroundSafeDelay(200)
            }
        }

        // Phase 2: Delete from public_cards using writeBatch (only sale/trade).
        // Exclude ids whose Phase 1 collection delete permanently failed (TASK-125) —
        // the card was restored above, so its collection doc still exists in
        // Firestore and its public listing must not be torn down under it.
        const publicCardIdsToDelete = failedIds.size > 0
            ? publicCardIds.filter(id => !failedIds.has(id))
            : publicCardIds
        const progress = { completed: completedBatches, total: totalBatches, onProgress }
        await deletePublicCardBatches(publicCardIdsToDelete, userId, BATCH_SIZE, progress)

        // Symmetric rollback (TASK-120) — restore cards whose Firestore delete
        // permanently failed into BOTH cards.value and paginatedCards. Previously
        // a failed batch was only reported via totalFailed; the optimistic removal
        // at the top of this function was never undone, so the UI showed cards as
        // gone even though they still existed in Firestore.
        if (failedIds.size > 0) {
            const toRestore = deletedCards.filter(card => failedIds.has(card.id))
            cards.value = [...cards.value, ...toRestore]
            rebuildCardIndex()
            const paginatedToRestore = toRestore.filter(card => paginatedIdsBeforeDelete.has(card.id))
            if (paginatedToRestore.length > 0) {
                paginatedCards.value = [...paginatedCards.value, ...paginatedToRestore]
            }
        }

        if (totalFailed > 0) {
            console.warn(`Batch delete: ${totalDeleted} deleted, ${totalFailed} failed`)
        }

        // TASK-232 gap #1 compensation: any id whose Phase 1 doc delete
        // permanently failed still has its card document — but Phase 0 above
        // already removed its card_index entry. Re-insert it (allowInsert:
        // true — the doc still exists with its real chunkId, a fresh server
        // read, not a guess) so it doesn't become an invisible card.
        if (failedIds.size > 0) {
            for (const chunk of chunkArray([...failedIds], 500)) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await applyCardIndexDelta(chunk.map(cardId => ({ cardId, action: 'update' as const, allowInsert: true })))
                } catch (restoreError: unknown) {
                    logSanitizedError('[IndexSync] Failed to restore card_index entries after a partially-failed batch delete — those cards may be invisible until the next rebuild', restoreError)
                }
            }
        }

        // Sync LOCAL in-memory index only — no Firestore write here, Phase 0
        // above already patched the server's card_index directly.
        const survivingDeletedIds = failedIds.size > 0
            ? [...idsToDelete].filter(id => !failedIds.has(id))
            : [...idsToDelete]
        if (survivingDeletedIds.length > 0) {
            const survivingSet = new Set(survivingDeletedIds)
            cardIndexRaw.value = cardIndexRaw.value.filter(ic => !survivingSet.has(ic.i))
        }

        // Re-query the server card_index for the definitive membership/order
        // — only when membership actually changed (totalDeleted > 0). A
        // batch that failed entirely (all ids restored above) has nothing
        // to correct; querying anyway would be a wasted round trip. Safe to
        // call directly now — unlike the old debounced client persist, the
        // Phase 0 delta calls above were already awaited, so the server
        // index has already caught up (or the failure was logged) by the
        // time we get here.
        if (totalDeleted > 0) {
            refreshCurrentPage().catch(() => {})
        }

        return { success: totalFailed === 0, deleted: totalDeleted, failed: totalFailed }
    }

    // ========================================================================
    // SEARCH / FIND OPERATIONS
    // ========================================================================

    /**
     * Find a card by ID
     */
    const getCardById = (cardId: string): Card | undefined => {
        return cardsById.get(cardId)
    }

    // ========================================================================
    // WISHLIST SYNC (Collection ↔ Deck)
    // ========================================================================

    /**
     * Ensure a wishlist card exists in collection for deck sync.
     * If a matching wishlist card exists (same scryfallId + edition + condition + foil),
     * increments its quantity. Otherwise creates a new card with status='wishlist'.
     * Returns the card ID.
     */
    const ensureCollectionWishlistCard = async (cardData: {
        scryfallId: string
        name: string
        edition: string
        setCode?: string
        quantity: number
        condition: CardCondition
        foil: boolean
        price: number
        image: string
        cmc?: number
        type_line?: string
        colors?: string[]
    }): Promise<string | null> => {
        // Look for existing wishlist card with same identity
        const existing = cards.value.find(c =>
            c.status === 'wishlist' &&
            c.scryfallId === cardData.scryfallId &&
            c.edition === cardData.edition &&
            c.condition === cardData.condition &&
            c.foil === cardData.foil
        )

        if (existing) {
            // Increment quantity on existing wishlist card
            const ok = await updateCard(existing.id, {
                quantity: existing.quantity + cardData.quantity,
            })
            return ok ? existing.id : null
        }

        // Create new wishlist card — strip undefined fields (Firestore rejects them)
        const newCard: Omit<Card, 'id' | 'updatedAt'> = {
            scryfallId: cardData.scryfallId,
            name: cardData.name,
            edition: cardData.edition,
            quantity: cardData.quantity,
            condition: cardData.condition,
            foil: cardData.foil,
            price: cardData.price,
            image: cardData.image,
            status: 'wishlist' as CardStatus,
        }
        if (cardData.setCode !== undefined) newCard.setCode = cardData.setCode
        if (cardData.cmc !== undefined) newCard.cmc = cardData.cmc
        if (cardData.type_line !== undefined) newCard.type_line = cardData.type_line
        if (cardData.colors !== undefined) newCard.colors = cardData.colors
        return addCard(newCard)
    }

    // ========================================================================
    // IMPORT OPERATIONS (Legacy - simplified)
    // ========================================================================

    /**
     * Batch import cards - returns array of created card IDs
     */
    const confirmImport = async (cardsToSave: Omit<Card, 'id'>[], silent = false, onProgress?: (current: number, total: number) => void): Promise<string[]> => {
        if (!authStore.user) return []

        try {
            const { bulkImportCards } = await import('../services/cloudFunctions')
            const CHUNK_SIZE = 500
            const createdIds: string[] = []

            for (let i = 0; i < cardsToSave.length; i += CHUNK_SIZE) {
                const chunk = cardsToSave.slice(i, i + CHUNK_SIZE)
                const cleanChunk = chunk.map(card => {
                    const record = card as Record<string, unknown>
                    const { id: _id, ...rest } = record
                    return stripUndefined(rest)
                })

                try {
                    const result = await bulkImportCards(cleanChunk)
                    createdIds.push(...result.cardIds)
                } catch (chunkError) {
                    logSanitizedError(`[Import] Chunk ${i} failed`, chunkError)
                }

                onProgress?.(Math.min(i + CHUNK_SIZE, cardsToSave.length), cardsToSave.length)
            }

            // Push in-place so getCardById works for deck allocation
            // shallowRef does NOT detect push — zero reactive cascade
            for (let k = 0; k < createdIds.length; k++) {
                // eslint-disable-next-line security/detect-object-injection
                const cardId = createdIds[k]
                // eslint-disable-next-line security/detect-object-injection
                const card = cardsToSave[k]
                if (cardId && card) {
                    const newCard = { ...card, id: cardId, updatedAt: new Date(), createdAt: new Date() } as Card
                    cards.value.push(newCard)
                    cardsById.set(cardId, newCard)
                }
            }

            // Rebuild index after bulk import (more efficient than individual syncs)
            import('../services/cloudFunctions').then(({ buildCardIndex }) => {
                buildCardIndex().then(result => {
                    console.info(`[Import] Index rebuilt: ${result.totalCards} cards → ${result.chunks} chunks`)
                }).catch((err: unknown) => {
                    logSanitizedError('[Import] Index rebuild failed', err, 'warn')
                })
            }).catch(() => {})

            if (!silent) {
                toastStore.show(t('collection.messages.imported', { count: createdIds.length }), 'success')
            }
            return createdIds
        } catch (error) {
            logSanitizedError('Error importing cards', error)
            toastStore.show(t('collection.messages.importError'), 'error')
            return []
        }
    }

    // ========================================================================
    // PUBLIC SYNC OPERATIONS
    // ========================================================================

    /**
     * Bulk sync all cards to public collection
     * - sale/trade cards → public_cards (lo que VENDO)
     * - wishlist cards → public_preferences (lo que BUSCO)
     */
    const syncAllToPublic = async (): Promise<void> => {
        const userInfo = getUserInfo()
        if (!userInfo) return

        try {
            // Reload collection first to get latest statuses
            await loadCollection()

            // Sync sale/trade cards to public_cards
            await syncAllUserCards(
                cards.value,
                userInfo.userId,
                userInfo.username,
                userInfo.location,
                userInfo.avatarUrl
            )

            // Sync wishlist cards to public_preferences (lo que BUSCO)
            const wishlistCards = cards.value.filter(c => c.status === 'wishlist')

            // Convert wishlist cards to preference format
            const wishlistAsPrefs = wishlistCards.map(c => ({
                id: c.id,
                cardName: c.name,
                scryfallId: c.scryfallId,
                name: c.name,
            }))

            await syncAllUserPreferences(
                wishlistAsPrefs,
                userInfo.userId,
                userInfo.username,
                userInfo.location,
                userInfo.avatarUrl
            )

            lastSyncAt.value = new Date()
            toastStore.show(t('collection.messages.synced'), 'success')
        } catch (error) {
            logSanitizedError('[PublicSync] Error bulk syncing cards', error)
            toastStore.show(t('collection.messages.syncError'), 'error')
        }
    }

    // ========================================================================
    // SELECT ALL — returns matching card IDs for bulk selection
    // ========================================================================

    /**
     * Return all card IDs from the loaded collection, optionally filtered by status.
     * Currently works off the local cards array. When server-side pagination is added,
     * this can be swapped to call a Cloud Function with mode='ids'.
     *
     * @param filters.status - 'all' | 'owned' | 'available' | CardStatus
     */
    const selectAllFilteredIds = (filters?: { status?: string }): string[] => {
        let filtered = cards.value
        const status = filters?.status

        if (status && status !== 'all') {
            if (status === 'owned') {
                filtered = filtered.filter(c => c.status !== 'wishlist')
            } else if (status === 'available') {
                filtered = filtered.filter(c => c.status === 'sale' || c.status === 'trade')
            } else {
                filtered = filtered.filter(c => c.status === status)
            }
        }

        return filtered.map(c => c.id)
    }

    // ========================================================================
    // COMPUTED
    // ========================================================================

    const totalCards = computed(() => cards.value.length)

    const totalValue = computed(() =>
        cards.value.reduce((sum, card) => sum + (card.price * card.quantity), 0)
    )

    // ========================================================================
    // CLEANUP
    // ========================================================================

    const clear = () => {
        cards.value = []
        cardsById.clear()
    }

    /** Force a new array reference so Vue computeds re-evaluate. Call AFTER import completes + deck allocation. */
    const refreshCards = () => {
        cards.value = [...cards.value]
        rebuildCardIndex()
    }

    // ========================================================================
    // SERVER-SIDE PAGINATION
    // ========================================================================

    const paginatedCards = shallowRef<Card[]>([])
    const paginationMeta = ref({
        page: 0,
        pageSize: 50,
        total: 0,
        hasMore: false,
        loading: false,
        loadingMore: false,
    })

    const _defaultFilters: QueryCardIndexRequest['filters'] = {}
    const _defaultSort: QueryCardIndexRequest['sort'] = { field: 'name', direction: 'asc' }

    /** Track the last query params so loadNextPage can re-use them */
    let _lastQueryFilters: QueryCardIndexRequest['filters'] = _defaultFilters
    let _lastQuerySort: QueryCardIndexRequest['sort'] = _defaultSort

    /** Generation counter: each queryPage call increments this.
     *  When the response arrives, it's only applied if the generation hasn't changed,
     *  preventing stale responses from overwriting newer results. */
    let _queryGeneration = 0

    /**
     * Query a page of cards from the server-side card_index.
     * Replaces paginatedCards with the results.
     * Uses a generation counter to discard stale responses from overlapping calls.
     */
    const queryPage = async (
        filters?: QueryCardIndexRequest['filters'],
        sort?: QueryCardIndexRequest['sort'],
        page = 0,
    ) => {
        if (!authStore.user) return

        const generation = ++_queryGeneration

        _lastQueryFilters = filters ?? _defaultFilters
        _lastQuerySort = sort ?? _defaultSort

        paginationMeta.value.loading = true
        // A loadNextPage left in flight now belongs to a superseded generation and
        // will skip its own finally, so clear its spinner here — otherwise the
        // orphaned "loading more" state sticks until the next successful append.
        paginationMeta.value.loadingMore = false

        try {
            const { queryCardIndex } = await import('../services/cloudFunctions')
            const response = await queryCardIndex({
                userId: authStore.user.id,
                filters: _lastQueryFilters,
                sort: _lastQuerySort,
                page,
                pageSize: paginationMeta.value.pageSize,
            })

            // Discard stale response — a newer queryPage call was made while we were waiting
            if (generation !== _queryGeneration) return

            // Map CF response records to Card objects via indexToCard
            paginatedCards.value = response.cards.map(rec => indexToCard(rec as unknown as IndexCard))

            paginationMeta.value.page = response.page
            paginationMeta.value.total = response.total
            paginationMeta.value.pageSize = response.pageSize
            paginationMeta.value.hasMore = response.hasMore
        } catch (error) {
            logSanitizedError('[queryPage] Error querying card index', error)
        } finally {
            // Only clear loading if this is still the latest generation
            if (generation === _queryGeneration) {
                paginationMeta.value.loading = false
            }
        }
    }

    /**
     * Load the next page of results and APPEND to paginatedCards.
     * Guards against duplicate calls and no-more-pages.
     */
    const loadNextPage = async () => {
        if (paginationMeta.value.loadingMore || paginationMeta.value.loading) return
        if (!paginationMeta.value.hasMore) return
        if (!authStore.user) return

        // Same generation guard queryPage uses. Without it, a page still in flight
        // when the user changed the search appended the PREVIOUS filter's cards onto
        // the new result set and overwrote page/total/hasMore with the old query's
        // values — the "search stops working correctly" half of the 2026-08-07 report.
        const generation = _queryGeneration

        paginationMeta.value.loadingMore = true

        try {
            const nextPage = paginationMeta.value.page + 1
            const { queryCardIndex } = await import('../services/cloudFunctions')
            const response = await queryCardIndex({
                userId: authStore.user.id,
                filters: _lastQueryFilters,
                sort: _lastQuerySort,
                page: nextPage,
                pageSize: paginationMeta.value.pageSize,
            })

            // Discard stale response — a queryPage call replaced the result set while
            // we were waiting, so this page belongs to filters nobody is looking at.
            if (generation !== _queryGeneration) return

            // Append new cards to existing array
            const newCards = response.cards.map(rec => indexToCard(rec as unknown as IndexCard))
            paginatedCards.value = [...paginatedCards.value, ...newCards]

            paginationMeta.value.page = response.page
            paginationMeta.value.total = response.total
            paginationMeta.value.pageSize = response.pageSize
            paginationMeta.value.hasMore = response.hasMore
        } catch (error) {
            if (generation !== _queryGeneration) return
            logSanitizedError('[loadNextPage] Error loading next page', error)
        } finally {
            // Only the current generation owns the flag — a superseded page must not
            // clear a spinner that now belongs to a newer request.
            if (generation === _queryGeneration) {
                paginationMeta.value.loadingMore = false
            }
        }
    }

    /** Reset pagination state to defaults */
    const resetPagination = () => {
        paginatedCards.value = []
        paginationMeta.value = {
            page: 0,
            pageSize: 50,
            total: 0,
            hasMore: false,
            loading: false,
            loadingMore: false,
        }
        _lastQueryFilters = _defaultFilters
        _lastQuerySort = _defaultSort
    }

    /**
     * Re-query the current page with the last-used filters and sort.
     * Called after card mutations (add/edit/delete) so paginatedCards
     * reflects the latest data without requiring a manual refresh.
     */
    const refreshCurrentPage = () => {
        return queryPage(_lastQueryFilters, _lastQuerySort, paginationMeta.value.page)
    }

    return {
        // State
        cards,
        loading,
        importing,
        lastSyncAt,
        collectionSummary,

        // Core operations
        loadCollection,
        addCard,
        updateCard,
        batchUpdateCards,
        deleteCard,
        deleteAllCards,
        batchDeleteCards,

        // Search
        getCardById,
        getFullCard,

        // Bulk selection
        selectAllFilteredIds,

        // Wishlist sync
        ensureCollectionWishlistCard,

        // Import
        confirmImport,
        enrichCardsWithMissingMetadata,
        refreshCards,

        // Public sync
        syncAllToPublic,

        // Computed
        totalCards,
        totalValue,

        // Server-side pagination
        paginatedCards,
        paginationMeta,
        queryPage,
        loadNextPage,
        resetPagination,
        refreshCurrentPage,

        // Cleanup
        clear,
    }
})
