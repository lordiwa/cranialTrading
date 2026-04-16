import { computed, ref, shallowRef } from 'vue'
import { backgroundSafeDelay } from '../utils/backgroundSafeDelay'
import { defineStore } from 'pinia'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    setDoc,
    Timestamp,
    updateDoc,
    writeBatch,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { type Card, type CardCondition, type CardStatus } from '../types/card'
import {
    batchSyncCardsToPublic,
    removeCardFromPublic,
    syncAllUserCards,
    syncAllUserPreferences,
    syncCardToPublic,
} from '../services/publicCards'
import { t } from '../composables/useI18n'
import { getCardsByIds } from '../services/scryfallCache'
import { getCardsNeedingPublicSync } from '../utils/publicSyncFilter'
import type { QueryCardIndexRequest } from '../services/cloudFunctions'

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
            console.warn(`Batch commit failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error)
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

const deletePublicCardBatches = async (
    publicCardIds: string[],
    userId: string,
    batchSize: number,
    progress: { completed: number; total: number; onProgress?: (percent: number) => void },
): Promise<void> => {
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
    sc: string     // setCode
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
        edition: ic.sc?.toUpperCase() || '',
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
        // Construct image from scryfallId — dual-faced cards get card_faces JSON
        image: ic.s
          ? (ic.df
            ? JSON.stringify({ card_faces: [
                { image_uris: { normal: `https://cards.scryfall.io/normal/front/${ic.s.charAt(0)}/${ic.s.charAt(1)}/${ic.s}.jpg`, small: `https://cards.scryfall.io/small/front/${ic.s.charAt(0)}/${ic.s.charAt(1)}/${ic.s}.jpg` } },
                { image_uris: { normal: `https://cards.scryfall.io/normal/back/${ic.s.charAt(0)}/${ic.s.charAt(1)}/${ic.s}.jpg`, small: `https://cards.scryfall.io/small/back/${ic.s.charAt(0)}/${ic.s.charAt(1)}/${ic.s}.jpg` } },
              ] })
            : `https://cards.scryfall.io/normal/front/${ic.s.charAt(0)}/${ic.s.charAt(1)}/${ic.s}.jpg`)
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
                        console.warn('[loadCollection] Background index build failed:', err)
                    })
                }).catch(() => {})
            }
        } catch (error) {
            console.error('Error loading collection:', error)
            toastStore.show(t('collection.messages.loadError'), 'error')
        } finally {
            loading.value = false
        }
    }

    /** Expected index version — bump in Cloud Function when format changes */
    const EXPECTED_INDEX_VERSION = 2

    /** Load from card_index chunks. Returns true if index was found and loaded. */
    const loadFromIndex = async (userId: string): Promise<boolean> => {
        try {
            const indexCol = collection(db, 'users', userId, 'card_index')
            const snapshot = await getDocs(indexCol)

            if (snapshot.empty) return false

            const allIndex: IndexCard[] = []
            let indexVersion = 1 // default for chunks without version field
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data()
                if (data.cards && Array.isArray(data.cards)) {
                    allIndex.push(...(data.cards as IndexCard[]))
                }
                if (data.version) indexVersion = data.version as number
            }

            const dfCount = allIndex.filter(ic => ic.df).length
            console.info(`[loadCollection] Loaded card_index: ${allIndex.length} cards from ${snapshot.docs.length} chunks (v${indexVersion}), ${dfCount} dual-faced`)

            cardIndexRaw.value = allIndex
            cards.value = allIndex.map(indexToCard)
            rebuildCardIndex()
            // collectionSummary auto-derives from cards via computed (NICE-09)

            // Auto-rebuild stale index in background
            if (indexVersion < EXPECTED_INDEX_VERSION) {
                console.info(`[loadCollection] Index v${indexVersion} is stale (expected v${EXPECTED_INDEX_VERSION}), rebuilding in background...`)
                import('../services/cloudFunctions').then(({ buildCardIndex: rebuildIndex }) => {
                    rebuildIndex().then(result => {
                        console.info(`[loadCollection] Index rebuilt: ${result.totalCards} cards → ${result.chunks} chunks`)
                    }).catch((err: unknown) => {
                        console.warn('[loadCollection] Background index rebuild failed:', err)
                    })
                }).catch(() => {})
            }

            return true
        } catch (error) {
            console.warn('[loadFromIndex] card_index read failed, falling back to full load:', error)
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

        if (!importing.value) {
            enrichCardsWithMissingMetadata().catch((err: unknown) => {
                console.warn('[Enrichment] Background enrichment failed:', err)
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
            console.warn('[getFullCard] Failed to fetch full card:', err)
        }
        return cardsById.get(cardId) ?? null
    }

    /**
     * Build a patch of missing metadata fields from a Scryfall card.
     * Returns an empty object if nothing needs updating.
     */
    const buildEnrichmentPatch = (card: Card, sc: Record<string, unknown>): Partial<Card> => {
        const patch: Record<string, unknown> = {}
        // Fields where falsy means missing
        const falsyFields = ['type_line', 'colors', 'rarity', 'oracle_text', 'keywords', 'legalities', 'power', 'toughness'] as const
        for (const field of falsyFields) {
            // eslint-disable-next-line security/detect-object-injection
            if (!card[field] && sc[field]) patch[field] = sc[field]
        }
        // Fields where undefined means missing
        const undefinedFields = ['cmc', 'full_art', 'produced_mana'] as const
        for (const field of undefinedFields) {
            // eslint-disable-next-line security/detect-object-injection
            if (card[field] === undefined && sc[field] !== undefined) patch[field] = sc[field]
        }
        // Image: extract from Scryfall's nested image_uris or card_faces
        if (!card.image) {
            const imageUris = sc.image_uris as Record<string, string> | undefined
            const cardFaces = sc.card_faces as { image_uris?: Record<string, string> }[] | undefined
            const image = imageUris?.normal ?? cardFaces?.[0]?.image_uris?.normal ?? ''
            if (image) patch.image = image
        }

        // Price: extract from Scryfall's nested prices object
        if (!card.price || card.price === 0) {
            const prices = sc.prices as Record<string, string | null> | undefined
            const usd = prices?.usd
            if (usd) patch.price = Number.parseFloat(usd)
        }

        return patch as Partial<Card>
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
                console.warn(`[Enrichment] Batch ${i / BATCH_SIZE + 1} failed, skipping:`, err)
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
            if (idx > -1) newIndex.splice(idx, 1)
        } else if (action === 'add') {
            newIndex.push(cardToIndex(card))
        } else if (action === 'update' && idx > -1) {
            newIndex[idx] = cardToIndex(card)
        }

        cardIndexRaw.value = newIndex
    }

    /**
     * Persist the current cardIndexRaw to Firestore card_index chunks.
     * Debounced (2s) to avoid flooding the Firestore Write channel —
     * rapid calls (e.g. addCard + allocateCardToDeck) coalesce into one persist.
     */
    let _indexPersistTimer: ReturnType<typeof setTimeout> | null = null

    function persistIndexToFirestore() {
        if (_indexPersistTimer) clearTimeout(_indexPersistTimer)
        _indexPersistTimer = setTimeout(() => { _doPersistIndex() }, 2000)
    }

    function _doPersistIndex() {
        if (!authStore.user) return
        const userId = authStore.user.id
        const INDEX_CHUNK_SIZE = 2000

        const allIndex = cardIndexRaw.value
        const totalChunks = Math.ceil(allIndex.length / INDEX_CHUNK_SIZE) || 1

        // Write chunks in background (fire-and-forget)
        void (async () => {
            try {
                for (let c = 0; c < totalChunks; c++) {
                    const chunkCards = allIndex.slice(c * INDEX_CHUNK_SIZE, (c + 1) * INDEX_CHUNK_SIZE)
                    const chunkRef = doc(db, 'users', userId, 'card_index', `chunk_${c}`)
                    await setDoc(chunkRef, { cards: chunkCards, count: chunkCards.length, updatedAt: Timestamp.now() })
                }

                // Delete orphaned chunks (e.g., collection shrank from 5 chunks to 2)
                const indexCol = collection(db, 'users', userId, 'card_index')
                const existingChunks = await getDocs(indexCol)
                for (const chunkDoc of existingChunks.docs) {
                    const chunkNum = parseInt(chunkDoc.id.replace('chunk_', ''), 10)
                    if (!isNaN(chunkNum) && chunkNum >= totalChunks) {
                        await deleteDoc(chunkDoc.ref)
                    }
                }
            } catch (err) {
                console.warn('[IndexSync] Failed to persist index:', err)
            }
        })()
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
            const docRef = await addDoc(colRef, {
                ...cleanData,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            })

            const newCard: Card = {
                id: docRef.id,
                ...cardData,
                updatedAt: new Date(),
                createdAt: new Date(),
            }
            cards.value = [...cards.value, newCard]
            cardsById.set(newCard.id, newCard)

            // Sync index
            syncIndexLocal(newCard, 'add')
            persistIndexToFirestore()

            // Sync to public collection (non-blocking, log-only on failure)
            const userInfo = getUserInfo()
            if (userInfo) {
                syncCardToPublic(newCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                    .catch((err: unknown) => {
                        console.error('[PublicSync] Error syncing card:', err)
                    })
            }

            // Refresh paginated view so the new card appears in the grid
            refreshCurrentPage().catch(() => {})

            return docRef.id
        } catch (error) {
            console.error('Error adding card:', error)
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

        try {
            // Strip undefined values — Firestore rejects them
            const cleanUpdates: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(updates)) {
                // eslint-disable-next-line security/detect-object-injection
                if (value !== undefined) cleanUpdates[key] = value
            }

            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await updateDoc(cardRef, {
                ...cleanUpdates,
                updatedAt: Timestamp.now(),
            })

            // Sync index
            // eslint-disable-next-line security/detect-object-injection
            const updatedCard = cards.value[index]
            if (updatedCard) {
                syncIndexLocal(updatedCard, 'update')
                persistIndexToFirestore()

                // Sync to public collection (non-blocking, log-only on failure)
                const userInfo = getUserInfo()
                if (userInfo) {
                    syncCardToPublic(updatedCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                        .catch((err: unknown) => {
                            console.error('[PublicSync] Error syncing card update:', err)
                        })
                }
            }

            // Refresh paginated view so the updated card reflects in the grid
            refreshCurrentPage().catch(() => {})

            return true
        } catch (error) {
            // Rollback on failure
            if (index > -1 && snapshot) {
                const rollbackCards = [...cards.value]
                // eslint-disable-next-line security/detect-object-injection
                rollbackCards[index] = snapshot
                cards.value = rollbackCards
                cardsById.set(cardId, snapshot)
            }
            console.error('Error updating card:', error)
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

            for (const chunk of chunks) {
                const batch = writeBatch(db)
                for (const cardId of chunk) {
                    const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
                    batch.update(cardRef, { ...cleanUpdates, updatedAt: Timestamp.now() })
                }
                await batch.commit()
                completedSteps++
                onProgress?.(Math.round((completedSteps / totalSteps) * 100))
            }

            // Save which cards were previously public-eligible (sale/trade)
            // Only these could have public_cards docs that need cleanup
            const previouslyPublicIds = new Set<string>()
            for (const cardId of cardIds) {
                const card = cards.value.find(c => c.id === cardId)
                if (card && (card.status === 'sale' || card.status === 'trade')) {
                    previouslyPublicIds.add(cardId)
                }
            }

            // Update local state
            const updatedCards = applyLocalCardUpdates(cardIds, updates)

            // Only sync cards that transition to/from public state
            const cardsToSync = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)

            // Batch sync to public_cards (non-fatal — card updates already succeeded)
            const userInfo = getUserInfo()
            if (userInfo && cardsToSync.length > 0) {
                const progressCb = onProgress
                    ? (completed: number) => { onProgress(Math.round(((firestoreChunkCount + completed) / totalSteps) * 100)) }
                    : undefined
                batchSyncCardsToPublic(cardsToSync, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl, progressCb)
                    .catch((err: unknown) => { console.error('[PublicSync] Batch sync failed (non-fatal):', err) })
            }

            return true
        } catch (error) {
            console.error('Error batch updating cards:', error)
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
     * Delete a single card from collection (optimistic UI)
     * Removes from UI immediately, then syncs with Firebase in background
     * If Firebase fails, restores the card and shows error
     */
    const deleteCard = async (cardId: string): Promise<boolean> => {
        if (!authStore.user) return false

        // Find and remove card optimistically (immediate UI update)
        const cardIndex = cards.value.findIndex(c => c.id === cardId)
        // eslint-disable-next-line security/detect-object-injection
        const deletedCard = cards.value[cardIndex]
        if (cardIndex === -1 || !deletedCard) return false

        cards.value = cards.value.filter(c => c.id !== cardId)
        cardsById.delete(cardId)

        // Sync with Firebase in background
        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await deleteDoc(cardRef)

            // Sync index
            syncIndexLocal(deletedCard, 'delete')
            persistIndexToFirestore()

            // Remove from public collection (non-blocking, log-only on failure)
            removeCardFromPublic(cardId, authStore.user.id)
                .catch((err: unknown) => {
                    console.error('[PublicSync] Error removing card:', err)
                })

            // Refresh paginated view so the deleted card disappears from the grid
            refreshCurrentPage().catch(() => {})

            return true
        } catch (error) {
            // Restore card on failure
            console.error('Error deleting card:', error)
            const restored = [...cards.value]
            restored.splice(cardIndex, 0, deletedCard)
            cards.value = restored
            cardsById.set(cardId, deletedCard)
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
            console.error('Error deleting all cards:', error)
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

        const BATCH_SIZE = 200
        const userId = authStore.user.id
        let totalDeleted = 0
        let totalFailed = 0

        // Only sale/trade cards exist in public_cards
        const publicCardIds = deletedCards
            .filter(card => card.status === 'sale' || card.status === 'trade')
            .map(card => card.id)

        const totalBatches = Math.ceil(cardIds.length / BATCH_SIZE) + Math.ceil(publicCardIds.length / BATCH_SIZE)
        let completedBatches = 0

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
            }

            completedBatches++
            if (onProgress) onProgress(Math.round((completedBatches / totalBatches) * 100))

            if (i + BATCH_SIZE < cardIds.length) {
                await backgroundSafeDelay(200)
            }
        }

        // Phase 2: Delete from public_cards using writeBatch (only sale/trade)
        const progress = { completed: completedBatches, total: totalBatches, onProgress }
        await deletePublicCardBatches(publicCardIds, userId, BATCH_SIZE, progress)

        if (totalFailed > 0) {
            console.warn(`Batch delete: ${totalDeleted} deleted, ${totalFailed} failed`)
        }

        // Delete ALL card_index chunks so deleted cards don't reappear on reload.
        // Use batches of 10 to avoid "Transaction too big" (each chunk is ~400KB).
        cardIndexRaw.value = cards.value.map(cardToIndex)
        try {
            const indexCol = collection(db, 'users', userId, 'card_index')
            const indexSnap = await getDocs(indexCol)
            if (!indexSnap.empty) {
                const IDX_BATCH = 10
                for (let idx = 0; idx < indexSnap.docs.length; idx += IDX_BATCH) {
                    const chunk = indexSnap.docs.slice(idx, idx + IDX_BATCH)
                    const batch = writeBatch(db)
                    for (const idxDoc of chunk) {
                        batch.delete(idxDoc.ref)
                    }
                    await batch.commit()
                }
            }
        } catch (err) {
            console.warn('[batchDelete] Failed to clean card_index:', err)
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
                    console.error(`[Import] Chunk ${i} failed:`, chunkError)
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
                    console.warn('[Import] Index rebuild failed:', err)
                })
            }).catch(() => {})

            if (!silent) {
                toastStore.show(t('collection.messages.imported', { count: createdIds.length }), 'success')
            }
            return createdIds
        } catch (error) {
            console.error('Error importing cards:', error)
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
                userInfo.email,
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
                userInfo.email,
                userInfo.avatarUrl
            )

            lastSyncAt.value = new Date()
            toastStore.show(t('collection.messages.synced'), 'success')
        } catch (error) {
            console.error('[PublicSync] Error bulk syncing cards:', error)
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
            console.error('[queryPage] Error querying card index:', error)
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

            // Append new cards to existing array
            const newCards = response.cards.map(rec => indexToCard(rec as unknown as IndexCard))
            paginatedCards.value = [...paginatedCards.value, ...newCards]

            paginationMeta.value.page = response.page
            paginationMeta.value.total = response.total
            paginationMeta.value.pageSize = response.pageSize
            paginationMeta.value.hasMore = response.hasMore
        } catch (error) {
            console.error('[loadNextPage] Error loading next page:', error)
        } finally {
            paginationMeta.value.loadingMore = false
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
