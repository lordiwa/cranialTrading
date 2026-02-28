<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { type CardHistoryPoint, usePriceHistory } from '../../composables/usePriceHistory'
import { useCollectionStore } from '../../stores/collection'
import { useMarketStore } from '../../stores/market'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../composables/useI18n'
import SvgIcon from '../ui/SvgIcon.vue'
import type { Card, CardStatus } from '../../types/card'

const props = withDefaults(defineProps<{
  card: Card
  compact?: boolean
  readonly?: boolean
  showInterest?: boolean
  isInterested?: boolean
  isBeingDeleted?: boolean
  selectionMode?: boolean
  isSelected?: boolean
}>(), {
  compact: false,
  readonly: false,
  showInterest: false,
  isInterested: false,
  isBeingDeleted: false,
  selectionMode: false,
  isSelected: false,
})

const emit = defineEmits<{
  cardClick: [card: Card]
  delete: [card: Card]
  interest: [card: Card]
  toggleSelect: [cardId: string]
}>()

const { t } = useI18n()

const collectionStore = useCollectionStore()
const marketStore = useMarketStore()
const toastStore = useToastStore()
const togglingPublic = ref(false)

// Refs for IntersectionObserver
const compactCardRef = ref<HTMLElement | null>(null)

// Swipe state
const cardRef = ref<HTMLElement | null>(null)
const swipeOffset = ref(0)
const isSwiping = ref(false)
const startX = ref(0)
const SWIPE_THRESHOLD = 80

// Status cycle order
const STATUS_ORDER: CardStatus[] = ['collection', 'trade', 'sale', 'wishlist']

const setStatus = (status: CardStatus) => {
  if (props.readonly || props.isBeingDeleted || status === props.card.status) return
  collectionStore.updateCard(props.card.id, { status })
    .then(ok => { if (ok) toastStore.show(t('cards.grid.statusChanged', { status }), 'success') })
    .catch(() => { toastStore.show(t('cards.grid.statusError'), 'error') })
}

const handleTouchStart = (e: TouchEvent) => {
  if (props.readonly || props.isBeingDeleted) return
  const touch = e.touches[0]
  if (!touch) return
  startX.value = touch.clientX
  isSwiping.value = true
}

const handleTouchMove = (e: TouchEvent) => {
  if (!isSwiping.value) return
  const touch = e.touches[0]
  if (!touch) return
  const currentX = touch.clientX
  swipeOffset.value = currentX - startX.value
  // Limit swipe distance
  swipeOffset.value = Math.max(-120, Math.min(120, swipeOffset.value))
}

const handleTouchEnd = async () => {
  if (!isSwiping.value) return

  if (swipeOffset.value < -SWIPE_THRESHOLD) {
    // Swipe left = delete
    emit('delete', props.card)
  } else if (swipeOffset.value > SWIPE_THRESHOLD) {
    // Swipe right = cycle status
    const currentIndex = STATUS_ORDER.indexOf(props.card.status)
    const nextIndex = (currentIndex + 1) % STATUS_ORDER.length
    const nextStatus = STATUS_ORDER[nextIndex] ?? 'collection'
    try {
      await collectionStore.updateCard(props.card.id, { status: nextStatus })
      toastStore.show(t('cards.grid.statusChanged', { status: nextStatus ?? '' }), 'success')
    } catch {
      toastStore.show(t('cards.grid.statusError'), 'error')
    }
  }

  // Reset
  isSwiping.value = false
  swipeOffset.value = 0
}

// Swipe visual indicator
const swipeStyle = computed(() => {
  if (!isSwiping.value || swipeOffset.value === 0) return {}
  return {
    transform: `translateX(${swipeOffset.value}px)`,
    transition: isSwiping.value ? 'none' : 'transform 0.2s ease-out'
  }
})

const swipeIndicator = computed(() => {
  if (swipeOffset.value < -40) return 'delete'
  if (swipeOffset.value > 40) return 'status'
  return null
})

const togglePublic = async () => {
  if (togglingPublic.value || props.readonly || props.isBeingDeleted) return
  togglingPublic.value = true
  try {
    const newPublicValue = !props.card.public
    await collectionStore.updateCard(props.card.id, { public: newPublicValue })
    toastStore.show(newPublicValue ? t('cards.grid.visibleInProfile') : t('cards.grid.hiddenFromProfile'), 'success')
  } catch {
    toastStore.show(t('cards.grid.visibilityError'), 'error')
  } finally {
    togglingPublic.value = false
  }
}

const { getTotalAllocated, getAvailableQuantity, getAllocationsForCard } = useCardAllocation()

// Card Kingdom prices
const {
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => props.card.scryfallId,
  () => props.card.setCode
)

// Per-card price history sparkline
const { loadCardHistory } = usePriceHistory()
const cardHistory = ref<CardHistoryPoint[]>([])

const sparklinePoints = computed(() => {
  if (cardHistory.value.length < 2) return ''
  const values = cardHistory.value.map(p => p.tcg)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100
  const h = 24
  return cardHistory.value.map((_, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - (((values[i] ?? 0) - min) / range) * (h - 2) - 1
    return `${x},${y}`
  }).join(' ')
})

// Lazy fetch CK prices when card scrolls into viewport
let priceObserver: IntersectionObserver | null = null

onMounted(() => {
  if (!props.card.scryfallId) return
  const el = cardRef.value || compactCardRef.value
  if (!el) {
    fetchCKPrices()
    if (!props.compact) {
      loadCardHistory(props.card.scryfallId).then(h => { cardHistory.value = h }).catch(() => {})
    }
    return
  }
  priceObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) {
      fetchCKPrices()
      if (!props.compact && props.card.scryfallId) {
        loadCardHistory(props.card.scryfallId).then(h => { cardHistory.value = h }).catch(() => {})
      }
      priceObserver?.disconnect()
      priceObserver = null
    }
  }, { rootMargin: '200px' })
  priceObserver.observe(el)
})

onUnmounted(() => {
  priceObserver?.disconnect()
  priceObserver = null
})

// Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref(0)

// Cache parsed image JSON to avoid repeated JSON.parse calls
const parsedImage = computed(() => {
  if (props.card.image && typeof props.card.image === 'string') {
    try {
      const parsed = JSON.parse(props.card.image)
      if (parsed.card_faces) return parsed
    } catch {
      // Not valid JSON — plain URL string
    }
  }
  return null
})

const getCardImage = (card: Card): string => {
  if (parsedImage.value) {
    const faces = parsedImage.value.card_faces
    if (faces && faces.length > 0) {
      return faces[cardFaceIndex.value]?.image_uris?.normal || faces[0]?.image_uris?.normal || ''
    }
  }
  return card.image || ''
}

const isSplitCard = computed((): boolean => {
  const parsed = parsedImage.value
  return !!(parsed?.card_faces && parsed.card_faces.length > 1)
})

const toggleCardFace = () => {
  if (isSplitCard.value) {
    cardFaceIndex.value = cardFaceIndex.value === 0 ? 1 : 0
  }
}

// Get allocation info for a card
const allocationInfo = computed(() => {
  const allocated = getTotalAllocated(props.card.id)
  const available = getAvailableQuantity(props.card.id)
  const allocations = getAllocationsForCard(props.card.id)
  return { allocated, available, allocations }
})

// Check if card is used in any deck
const isCardAllocated = computed((): boolean => {
  return getTotalAllocated(props.card.id) > 0
})

const getStatusColor = (status: string) => {
  const colors = {
    collection: 'text-neon',
    sale: 'text-yellow-400',
    trade: 'text-blue-400',
    wishlist: 'text-red-400',
  }
  return colors[status as keyof typeof colors] || 'text-silver-70'
}

const getStatusIconName = (status: string) => {
  const icons = {
    collection: 'check',
    sale: 'money',
    trade: 'flip',
    wishlist: 'star',
  }
  return icons[status as keyof typeof icons] || 'check'
}

// Price mover badge
const priceChangeData = computed(() => {
  if (!marketStore.movers) return null
  const movers = marketStore.moverLookup.get(props.card.name.toLowerCase())
  if (!movers?.length) return null
  const isFoilType = marketStore.selectedMoverType.includes('foil')
  if (isFoilType !== props.card.foil) return null
  return { percentChange: movers[0]!.percentChange, isPositive: movers[0]!.percentChange > 0 }
})
</script>

<template>
  <!-- COMPACT MODE: For deck view -->
  <div v-if="compact" ref="compactCardRef" class="group cursor-pointer min-h-[180px]" @click="emit('cardClick', card)">
    <div class="relative aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-all rounded">
      <img
          v-if="getCardImage(card)"
          :src="getCardImage(card)"
          :alt="card.name"
          loading="lazy"
          class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center bg-primary">
        <span class="text-[14px] text-silver-50">{{ t('cards.grid.noImg') }}</span>
      </div>

      <!-- Qty Badge - BIGGER for compact -->
      <div class="absolute bottom-1 left-1 bg-primary/90 border border-neon px-2 py-1 rounded">
        <p class="text-small font-bold text-neon">x{{ card.quantity }}</p>
      </div>
    </div>

    <!-- Minimal Card Info -->
    <div class="mt-1 min-h-[50px]">
      <p class="text-[14px] font-bold text-silver line-clamp-2 group-hover:text-neon transition-colors leading-tight">
        {{ card.name }}
      </p>
      <p class="text-[14px] text-silver-70">${{ card.price ? card.price.toFixed(2) : 'N/A' }} c/u</p>
      <p class="text-[14px] text-neon font-bold">${{ card.price ? (card.price * card.quantity).toFixed(2) : 'N/A' }}</p>
    </div>
  </div>

  <!-- FULL MODE: For collection view -->
  <div
      v-else
      ref="cardRef"
      class="group relative"
      :class="isBeingDeleted ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
  >
    <!-- Swipe background indicators (mobile only) -->
    <div v-if="isSwiping && !readonly" class="absolute inset-0 md:hidden flex">
      <!-- Left side (delete) -->
      <div
          class="flex-1 flex items-center justify-start pl-4 rounded-l transition-colors"
          :class="swipeIndicator === 'delete' ? 'bg-rust/30' : 'bg-transparent'"
      >
        <SvgIcon v-if="swipeOffset < -20" name="trash" size="medium" class="text-rust" />
      </div>
      <!-- Right side (status change) -->
      <div
          class="flex-1 flex items-center justify-end pr-4 rounded-r transition-colors"
          :class="swipeIndicator === 'status' ? 'bg-neon/20' : 'bg-transparent'"
      >
        <SvgIcon v-if="swipeOffset > 20" name="flip" size="medium" class="text-neon" />
      </div>
    </div>

    <!-- Row 1: Status Bar -->
    <div class="flex items-center gap-1.5 px-1 py-1">
      <!-- Public/Eye toggle -->
      <button
          v-if="!readonly && !isBeingDeleted"
          @click.stop="togglePublic"
          :disabled="togglingPublic"
          class="flex items-center justify-center transition-all"
          :class="card.public ? 'text-neon' : 'text-silver-50'"
          :title="card.public ? t('cards.grid.visibleTitle') : t('cards.grid.hiddenTitle')"
      >
        <SvgIcon :name="card.public ? 'eye-open' : 'eye-closed'" size="tiny" />
      </button>
      <span v-else class="w-4"></span>

      <!-- All status icons -->
      <template v-for="status in STATUS_ORDER" :key="status">
        <button
            v-if="!readonly && !isBeingDeleted"
            @click.stop="setStatus(status)"
            class="flex items-center transition-all"
            :class="card.status === status
              ? getStatusColor(status)
              : 'text-silver-30 hover:text-silver-50'"
        >
          <SvgIcon :name="getStatusIconName(status)" size="tiny" />
        </button>
        <SvgIcon
            v-else
            :name="getStatusIconName(status)"
            size="tiny"
            :class="card.status === status ? getStatusColor(status) : 'text-silver-30'"
        />
      </template>

      <!-- Status label (right-aligned) -->
      <span class="ml-auto text-tiny font-bold uppercase" :class="getStatusColor(card.status)">
        {{ card.status }}
      </span>
    </div>

    <!-- Row 2: Card Image -->
    <div
        class="relative aspect-[3/4] bg-secondary border-x border-b overflow-hidden transition-all"
        :class="[
          selectionMode && isSelected ? 'border-neon border-2' : '',
          !selectionMode && isBeingDeleted ? 'border-rust animate-pulse' : '',
          !selectionMode && !isBeingDeleted ? (isCardAllocated ? 'border-neon-30' : 'border-silver-30 group-hover:border-neon') : '',
          selectionMode && !isSelected ? 'border-silver-30' : '',
        ]"
        :style="swipeStyle"
        @click="selectionMode ? emit('toggleSelect', card.id) : (!isBeingDeleted && !isSwiping && emit('cardClick', card))"
    >
      <!-- Selection checkbox overlay -->
      <div
          v-if="selectionMode"
          class="absolute top-2 left-2 z-20"
          @click.stop="emit('toggleSelect', card.id)"
      >
        <div
            class="w-6 h-6 rounded border-2 flex items-center justify-center transition-all"
            :class="isSelected ? 'bg-neon border-neon' : 'bg-primary/80 border-silver-50'"
        >
          <svg v-if="isSelected" class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <img
          v-if="getCardImage(card)"
          :src="getCardImage(card)"
          :alt="card.name"
          loading="lazy"
          class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center bg-primary">
        <span class="text-tiny text-silver-50">{{ t('cards.grid.noImage') }}</span>
      </div>

      <!-- Toggle button for split cards (always visible if split) -->
      <button
          v-if="isSplitCard"
          @click.stop="toggleCardFace"
          class="absolute top-2 left-2 bg-primary/95 border border-neon px-2 py-1 hover:bg-neon/20 transition-all flex items-center justify-center z-10 rounded"
          :title="t('cards.grid.flipTitle')"
      >
        <SvgIcon name="flip" size="tiny" />
      </button>

      <!-- Deleting overlay -->
      <div
          v-if="isBeingDeleted"
          class="absolute inset-0 bg-primary/80 flex flex-col items-center justify-center"
      >
        <svg class="w-6 h-6 animate-spin text-rust mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p class="text-tiny font-bold text-rust">{{ t('cards.grid.deleting') }}</p>
      </div>
    </div>

    <!-- Row 3: Deck Allocation -->
    <div class="mt-1 text-tiny font-bold truncate">
      <template v-if="isCardAllocated">
        <span class="text-neon">x{{ card.quantity }}</span>
        <span class="text-silver-50"> | </span>
        <template v-for="(alloc, idx) in allocationInfo.allocations.slice(0, 3)" :key="alloc.deckId">
          <span class="text-silver-70">{{ t('cards.grid.inDeck', { qty: alloc.quantity, deckName: alloc.deckName }) }}</span>
          <span v-if="idx < Math.min(allocationInfo.allocations.length, 3) - 1" class="text-silver-50">, </span>
        </template>
        <span v-if="allocationInfo.allocations.length > 3" class="text-silver-50"> +{{ allocationInfo.allocations.length - 3 }}</span>
      </template>
      <template v-else>
        <span class="text-neon">x{{ card.quantity }}</span>
      </template>
    </div>

    <!-- Row 4: Card Name (fixed 2-line height: 14px * 1.5 lh * 2 = 42px) -->
    <p class="text-small font-bold text-silver line-clamp-2 group-hover:text-neon transition-colors mt-1 h-[42px]">
      {{ card.name }}
    </p>

    <!-- Row 5: Edition / Type (fixed 2-line height: 14px * 1.4 lh * 2 ≈ 40px) -->
    <div class="mt-1 h-[40px]">
      <p class="text-tiny text-silver-70 truncate">
        {{ card.edition }} - {{ card.condition }}
        <span v-if="card.foil" class="text-neon">FOIL</span>
      </p>
      <p class="text-tiny text-silver-30 truncate">{{ card.type_line || '&nbsp;' }}</p>
    </div>

    <!-- Row 6: Prices -->
    <div class="mt-1 space-y-0.5">
      <!-- TCGPlayer Price -->
      <div class="flex items-center gap-1">
        <p class="text-tiny font-bold text-neon">
          TCG: ${{ card.price ? card.price.toFixed(2) : 'N/A' }}
        </p>
        <span
            v-if="priceChangeData"
            class="text-[14px] font-bold px-1 rounded"
            :class="priceChangeData.isPositive ? 'text-neon bg-neon/10' : 'text-rust bg-rust/10'"
        >
          {{ priceChangeData.isPositive ? '&#x25B2;' : '&#x25BC;' }} {{ Math.abs(priceChangeData.percentChange).toFixed(1) }}%
        </span>
      </div>
      <!-- Card Kingdom Price -->
      <p v-if="hasCardKingdomPrices" class="text-tiny font-bold text-[#4CAF50]">
        CK: {{ formatPrice(cardKingdomRetail) }}
      </p>
      <p v-else class="text-tiny text-silver-50">CK: -</p>
      <!-- CK Buylist -->
      <p v-if="cardKingdomBuylist" class="text-tiny text-[#FF9800]">
        BL: {{ formatPrice(cardKingdomBuylist) }}
      </p>
      <p v-else class="text-tiny text-silver-50">BL: -</p>
    </div>

    <!-- Row 7: Sparkline (always reserve space) -->
    <div class="h-[24px] mt-1">
      <svg
        v-if="cardHistory.length >= 2"
        :viewBox="`0 0 100 24`"
        class="w-full h-full"
        preserveAspectRatio="none"
      >
        <polyline
          :points="sparklinePoints"
          fill="none"
          stroke="#CCFF00"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    </div>

    <!-- Row 8: ELIMINAR Button -->
    <button
        v-if="!readonly && !isBeingDeleted"
        @click.stop="emit('delete', card)"
        class="w-full mt-2 border border-silver-30 px-2 py-1 text-tiny font-bold text-silver-70 flex items-center justify-center gap-1 hover:border-rust hover:text-rust transition-colors rounded"
    >
      <SvgIcon name="trash" size="tiny" />
      {{ t('cards.grid.delete') }}
    </button>

    <!-- Interest Button (only when readonly and showInterest) -->
    <div v-if="readonly && showInterest && (card.status === 'sale' || card.status === 'trade')" class="mt-3">
      <button
          v-if="isInterested"
          disabled
          class="w-full px-2 py-1 bg-silver-10 border border-silver-30 text-silver-50 text-tiny font-bold cursor-not-allowed rounded"
      >
        {{ t('cards.grid.interestSent') }}
      </button>
      <button
          v-else
          @click="emit('interest', card)"
          class="w-full px-2 py-1 bg-neon-10 border border-neon text-neon text-tiny font-bold hover:bg-neon-20 transition-150 rounded"
      >
        {{ t('cards.grid.interested') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.border-neon-30 {
  border-color: rgba(90, 193, 104, 0.3);
}
</style>
