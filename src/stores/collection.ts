import { computed, ref, shallowRef } from 'vue'
import { backgroundSafeDelay } from '../utils/backgroundSafeDelay'
import { defineStore } from 'pinia'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
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

export const useCollectionStore = defineStore('collection', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    const cards = shallowRef<Card[]>([])
    const cardsById = new Map<string, Card>()
    const loading = ref(false)
    const importing = ref(false)
    const collectionSummary = ref<{ totalCards: number; totalValue: number; statusCounts: Record<string, number>; loadedCards: number } | null>(null)
    const lastSyncAt = ref<Date | null>(null)

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
     * Load all cards for current user
     */
    /** Transform a Firestore SDK doc into a Card */
    const transformDoc = (d: { id: string; data: () => Record<string, unknown> }): Card => {
        const data = d.data()
        const firestoreData = data as Record<string, unknown> & {
            updatedAt?: { toDate: () => Date };
            createdAt?: { toDate: () => Date };
        }
        return {
            ...data,
            id: d.id,
            updatedAt: firestoreData.updatedAt?.toDate() ?? new Date(),
            createdAt: firestoreData.createdAt?.toDate() ?? new Date(),
        } as Card
    }

    const loadCollection = async () => {
        if (!authStore.user) return
        loading.value = true

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const snapshot = await getDocs(colRef)

            // Map in chunks, yielding to keep UI responsive
            const CHUNK = 2000
            const docs = snapshot.docs
            const all: Card[] = []
            for (let i = 0; i < docs.length; i += CHUNK) {
                const chunk = docs.slice(i, i + CHUNK).map(transformDoc)
                all.push(...chunk)
                if (i + CHUNK < docs.length) {
                    await backgroundSafeDelay(0)
                }
            }

            cards.value = all
            rebuildCardIndex()

            // Enrich cards missing metadata (non-blocking, skip during import)
            if (!importing.value) {
                enrichCardsWithMissingMetadata().catch((err: unknown) => {
                    console.warn('[Enrichment] Background enrichment failed:', err)
                })
            }
        } catch (error) {
            console.error('Error loading collection:', error)
            toastStore.show(t('collection.messages.loadError'), 'error')
        } finally {
            loading.value = false
        }
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
     * Persist enrichment updates to Firestore in batches.
     */
    const persistEnrichmentBatches = async (updates: { card: Card; data: Partial<Card> }[], userId: string) => {
        const BATCH_SIZE = 400
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const chunk = updates.slice(i, i + BATCH_SIZE)
            const batch = writeBatch(db)
            for (const { card, data } of chunk) {
                const cardRef = doc(db, 'users', userId, 'cards', card.id)
                batch.set(cardRef, { ...data, updatedAt: Timestamp.now() }, { merge: true })
            }
            try {
                await batch.commit()
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

            // Sync to public collection (non-blocking, log-only on failure)
            const userInfo = getUserInfo()
            if (userInfo) {
                syncCardToPublic(newCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                    .catch((err: unknown) => {
                        console.error('[PublicSync] Error syncing card:', err)
                    })
            }

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

            // Sync to public collection (non-blocking, log-only on failure)
            // eslint-disable-next-line security/detect-object-injection
            const updatedCard = cards.value[index]
            if (updatedCard) {
                const userInfo = getUserInfo()
                if (userInfo) {
                    syncCardToPublic(updatedCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                        .catch((err: unknown) => {
                            console.error('[PublicSync] Error syncing card update:', err)
                        })
                }
            }

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

            // Remove from public collection (non-blocking, log-only on failure)
            removeCardFromPublic(cardId, authStore.user.id)
                .catch((err: unknown) => {
                    console.error('[PublicSync] Error removing card:', err)
                })

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

        // Cleanup
        clear,
    }
})
