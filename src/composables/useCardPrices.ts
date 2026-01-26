/**
 * Composable for fetching and displaying card prices from multiple sources
 */
import { ref, computed } from 'vue'
import { getCardPrices, formatPrice, type CardPrices } from '../services/mtgjson'
import { getCardById } from '../services/scryfall'

export interface PriceDisplay {
  source: string
  label: string
  price: string
  priceValue: number | null
  type: 'retail' | 'buylist'
  foil: boolean
}

// Cache for scryfallId -> setCode mapping
const setCodeCache = new Map<string, string>()

export function useCardPrices(scryfallId: () => string | undefined, setCode: () => string | undefined) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const prices = ref<CardPrices | null>(null)

  // Fetch prices when scryfallId changes
  const fetchPrices = async () => {
    const id = scryfallId()
    let set = setCode()

    if (!id) {
      prices.value = null
      return
    }

    loading.value = true
    error.value = null

    try {
      // If setCode is missing, try to get it from cache or Scryfall
      if (!set) {
        // Check cache first
        if (setCodeCache.has(id)) {
          set = setCodeCache.get(id)
        } else {
          // Fetch from Scryfall
          const card = await getCardById(id)
          if (card?.set) {
            set = card.set
            setCodeCache.set(id, set)
          }
        }
      }

      prices.value = await getCardPrices(id, set)
    } catch (e) {
      console.error('Error fetching prices:', e)
      error.value = 'Failed to load prices'
      prices.value = null
    } finally {
      loading.value = false
    }
  }

  // Card Kingdom prices
  const cardKingdomRetail = computed(() => prices.value?.cardKingdom?.retail ?? null)
  const cardKingdomRetailFoil = computed(() => prices.value?.cardKingdom?.retailFoil ?? null)
  const cardKingdomBuylist = computed(() => prices.value?.cardKingdom?.buylist ?? null)
  const cardKingdomBuylistFoil = computed(() => prices.value?.cardKingdom?.buylistFoil ?? null)

  // TCGPlayer prices (from MTGJSON)
  const tcgplayerRetail = computed(() => prices.value?.tcgplayer?.retail ?? null)
  const tcgplayerRetailFoil = computed(() => prices.value?.tcgplayer?.retailFoil ?? null)

  // Cardmarket prices
  const cardmarketRetail = computed(() => prices.value?.cardmarket?.retail ?? null)
  const cardmarketRetailFoil = computed(() => prices.value?.cardmarket?.retailFoil ?? null)

  // Has any Card Kingdom prices
  const hasCardKingdomPrices = computed(() =>
    prices.value?.cardKingdom && (
      prices.value.cardKingdom.retail != null ||
      prices.value.cardKingdom.buylist != null
    )
  )

  // All prices as a flat list for display
  const allPrices = computed((): PriceDisplay[] => {
    const result: PriceDisplay[] = []

    if (prices.value?.cardKingdom) {
      if (prices.value.cardKingdom.retail != null) {
        result.push({
          source: 'cardkingdom',
          label: 'Card Kingdom',
          price: formatPrice(prices.value.cardKingdom.retail),
          priceValue: prices.value.cardKingdom.retail,
          type: 'retail',
          foil: false,
        })
      }
      if (prices.value.cardKingdom.retailFoil != null) {
        result.push({
          source: 'cardkingdom',
          label: 'CK Foil',
          price: formatPrice(prices.value.cardKingdom.retailFoil),
          priceValue: prices.value.cardKingdom.retailFoil,
          type: 'retail',
          foil: true,
        })
      }
      if (prices.value.cardKingdom.buylist != null) {
        result.push({
          source: 'cardkingdom',
          label: 'CK Buylist',
          price: formatPrice(prices.value.cardKingdom.buylist),
          priceValue: prices.value.cardKingdom.buylist,
          type: 'buylist',
          foil: false,
        })
      }
    }

    return result
  })

  return {
    loading,
    error,
    prices,
    fetchPrices,

    // Individual prices
    cardKingdomRetail,
    cardKingdomRetailFoil,
    cardKingdomBuylist,
    cardKingdomBuylistFoil,
    tcgplayerRetail,
    tcgplayerRetailFoil,
    cardmarketRetail,
    cardmarketRetailFoil,

    // Helpers
    hasCardKingdomPrices,
    allPrices,
    formatPrice,
  }
}
