/**
 * Composable for calculating collection totals with multi-source prices
 */
import { computed, ref } from 'vue'
import { type CardPrices, formatPrice, getCardPrices } from '../services/mtgjson'
import { getCardById, searchCards } from '../services/scryfall'
import { useCollectionStore } from '../stores/collection'
import { cleanCardName } from '../utils/cardHelpers'
import type { Card } from '../types/card'

// Cache for prices by scryfallId
const pricesCache = new Map<string, CardPrices | null>()
const setCodeCache = new Map<string, string>()

// Track cards we've already tried to fix (to avoid repeated attempts)
const fixAttemptedCache = new Set<string>()

// Shared card prices map (by card ID) — shared across all composable instances
const sharedCardPrices = ref<Map<string, CardPrices | null>>(new Map())

export interface CollectionTotals {
  // TCGPlayer totals
  tcgCollection: number
  tcgWishlist: number
  tcgSale: number
  tcgTrade: number
  tcgTotal: number

  // Card Kingdom totals
  ckCollection: number
  ckWishlist: number
  ckSale: number
  ckTrade: number
  ckTotal: number

  // Card Kingdom Buylist totals
  ckBuylistCollection: number
  ckBuylistSale: number
  ckBuylistTrade: number
  ckBuylistTotal: number
}

export function useCollectionTotals(cards: () => Card[]) {
  const loading = ref(false)
  const progress = ref(0)
  const totalCards = ref(0)
  const processedCards = ref(0)

  // Use shared prices map
  const cardPrices = sharedCardPrices

  // Auto-fix card with missing scryfallId by searching Scryfall
  const autoFixCard = async (card: Card): Promise<string | null> => {
    // Only try once per card
    if (fixAttemptedCache.has(card.id)) {
      return null
    }
    fixAttemptedCache.add(card.id)

    try {
      const cleanName = cleanCardName(card.name)
      const results = await searchCards(`!"${cleanName}"`)

      if (results.length > 0) {
        // Find print with price, preferring one with image
        const printWithPrice = results.find(r =>
          r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
          (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
        ) || results.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0) || results[0]

        if (!printWithPrice) return null

        const scryfallId = printWithPrice.id
        const setCode = printWithPrice.set?.toUpperCase()
        const edition = printWithPrice.set_name
        const price = printWithPrice.prices?.usd ? Number.parseFloat(printWithPrice.prices.usd) : 0
        let image = printWithPrice.image_uris?.normal || ''
        const firstFace = printWithPrice.card_faces?.[0]
        if (!image && firstFace) {
          image = firstFace.image_uris?.normal || ''
        }

        // Update card in collection store (background, don't await)
        const collectionStore = useCollectionStore()
        collectionStore.updateCard(card.id, {
          scryfallId,
          setCode,
          edition,
          price,
          image: image || card.image,
        }).then(() => {
          console.log(`✅ Auto-fixed card: ${card.name}`)
        }).catch((e: unknown) => {
          console.warn(`Failed to auto-fix ${card.name}:`, e)
        })

        return scryfallId
      }
    } catch (e) {
      console.warn(`Error auto-fixing ${card.name}:`, e)
    }

    return null
  }

  // Fetch price for a single card
  const fetchCardPrice = async (card: Card): Promise<CardPrices | null> => {
    let scryfallId = card.scryfallId

    // If no scryfallId, try to auto-fix the card
    if (!scryfallId) {
      scryfallId = await autoFixCard(card) || ''
      if (!scryfallId) {
        return null
      }
    }

    // Check cache first
    if (pricesCache.has(scryfallId)) {
      return pricesCache.get(scryfallId) || null
    }

    let setCode = card.setCode

    // If no setCode, try to get from Scryfall
    if (!setCode) {
      if (setCodeCache.has(scryfallId)) {
        setCode = setCodeCache.get(scryfallId)
      } else {
        try {
          const scryfallCard = await getCardById(scryfallId)
          if (scryfallCard?.set) {
            setCode = scryfallCard.set
            setCodeCache.set(scryfallId, setCode)
          }
        } catch {
          console.warn('Error fetching setCode for', card.name)
        }
      }
    }

    try {
      const prices = await getCardPrices(scryfallId, setCode)
      pricesCache.set(scryfallId, prices)
      return prices
    } catch {
      console.warn('Error fetching prices for', card.name)
      pricesCache.set(scryfallId, null)
      return null
    }
  }

  // Fetch all prices
  const fetchAllPrices = async () => {
    const cardList = cards()
    if (cardList.length === 0) return

    loading.value = true
    totalCards.value = cardList.length
    processedCards.value = 0
    progress.value = 0

    // Process in batches to avoid overwhelming the browser
    const batchSize = 5
    for (let i = 0; i < cardList.length; i += batchSize) {
      const batch = cardList.slice(i, i + batchSize)

      await Promise.all(batch.map(async (card) => {
        const prices = await fetchCardPrice(card)
        cardPrices.value.set(card.id, prices)
        processedCards.value++
        progress.value = Math.round((processedCards.value / totalCards.value) * 100)
      }))

      // Small delay between batches to not block UI
      if (i + batchSize < cardList.length) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    loading.value = false
  }

  // Calculate totals
  const totals = computed((): CollectionTotals => {
    const cardList = cards()

    const result: CollectionTotals = {
      tcgCollection: 0,
      tcgWishlist: 0,
      tcgSale: 0,
      tcgTrade: 0,
      tcgTotal: 0,
      ckCollection: 0,
      ckWishlist: 0,
      ckSale: 0,
      ckTrade: 0,
      ckTotal: 0,
      ckBuylistCollection: 0,
      ckBuylistSale: 0,
      ckBuylistTrade: 0,
      ckBuylistTotal: 0,
    }

    for (const card of cardList) {
      const tcgPrice = (card.price || 0) * card.quantity
      const ckPrices = cardPrices.value.get(card.id)
      const ckRetail = (ckPrices?.cardKingdom?.retail || 0) * card.quantity
      const ckBuylist = (ckPrices?.cardKingdom?.buylist || 0) * card.quantity

      // By status
      switch (card.status) {
        case 'collection':
          result.tcgCollection += tcgPrice
          result.ckCollection += ckRetail
          result.ckBuylistCollection += ckBuylist
          // Add to total (owned cards)
          result.tcgTotal += tcgPrice
          result.ckTotal += ckRetail
          result.ckBuylistTotal += ckBuylist
          break
        case 'wishlist':
          // Wishlist does NOT count towards total (not owned)
          result.tcgWishlist += tcgPrice
          result.ckWishlist += ckRetail
          break
        case 'sale':
          result.tcgSale += tcgPrice
          result.ckSale += ckRetail
          result.ckBuylistSale += ckBuylist
          // Add to total (owned cards)
          result.tcgTotal += tcgPrice
          result.ckTotal += ckRetail
          result.ckBuylistTotal += ckBuylist
          break
        case 'trade':
          result.tcgTrade += tcgPrice
          result.ckTrade += ckRetail
          result.ckBuylistTrade += ckBuylist
          // Add to total (owned cards)
          result.tcgTotal += tcgPrice
          result.ckTotal += ckRetail
          result.ckBuylistTotal += ckBuylist
          break
      }
    }

    return result
  })

  return {
    loading,
    progress,
    totalCards,
    processedCards,
    totals,
    cardPrices,
    fetchAllPrices,
    formatPrice,
  }
}
