<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCardPrices } from '../../composables/useCardPrices'
import type { Card } from '../../types/card'

const props = withDefaults(defineProps<{
  card: Card
  compact?: boolean
  readonly?: boolean
  showInterest?: boolean
  isInterested?: boolean
  showCart?: boolean
  isInCart?: boolean
  isBeingDeleted?: boolean
  selectionMode?: boolean
  isSelected?: boolean
}>(), {
  compact: false,
  readonly: false,
  showInterest: false,
  isInterested: false,
  showCart: false,
  isInCart: false,
  isBeingDeleted: false,
  selectionMode: false,
  isSelected: false,
})

const emit = defineEmits<{
  cardClick: [card: Card]
  delete: [card: Card]
  interest: [card: Card]
  addToCart: [card: Card]
  toggleSelect: [cardId: string]
}>()

// Ref for IntersectionObserver
const compactCardRef = ref<HTMLElement | null>(null)

interface ParsedCardImage {
  card_faces?: { image_uris?: { normal?: string; small?: string } }[]
}

// Card Kingdom prices
const {
  cardKingdomRetail,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => props.card.scryfallId,
  () => props.card.setCode
)

// Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref(0)

// Cache parsed image JSON to avoid repeated JSON.parse calls
const parsedImage = computed((): ParsedCardImage | null => {
  if (props.card.image && typeof props.card.image === 'string') {
    try {
      const parsed = JSON.parse(props.card.image) as ParsedCardImage
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
      return faces[cardFaceIndex.value]?.image_uris?.normal ?? faces[0]?.image_uris?.normal ?? ''
    }
  }
  return card.image ?? ''
}

// True when card has a real image URL (not empty, not whitespace)
const hasImage = computed(() => {
  const img = getCardImage(props.card)
  return img.length > 0 && img.startsWith('http')
})

// Track image loading state for showing spinner overlay
const imageLoaded = ref(false)
const onImageLoad = () => { imageLoaded.value = true }
const onImageError = () => { imageLoaded.value = false }
watch(() => props.card.image, () => { imageLoaded.value = false })

// Lazy fetch CK prices when card scrolls into viewport
let priceObserver: IntersectionObserver | null = null

onMounted(() => {
  if (!props.card.scryfallId) return
  const el = compactCardRef.value
  if (!el) {
    void fetchCKPrices()
    return
  }
  priceObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) {
      void fetchCKPrices()
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
</script>

<template>
  <div ref="compactCardRef" class="group cursor-pointer min-h-[180px]" @click="emit('cardClick', card)">
    <div class="relative aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-all rounded">
      <template v-if="hasImage">
        <img
            :src="getCardImage(card)"
            :alt="card.name"
            loading="lazy"
            class="w-full h-full object-cover"
            @load="onImageLoad"
            @error="onImageError"
        />
        <div v-if="!imageLoaded" class="absolute inset-0 flex flex-col items-center justify-center bg-primary gap-2">
          <div class="w-8 h-8 border-2 border-silver-30 border-t-neon rounded-full animate-spin"></div>
        </div>
      </template>
      <div v-else class="w-full h-full flex flex-col items-center justify-center bg-primary gap-2">
        <div class="w-8 h-8 border-2 border-silver-30 border-t-neon rounded-full animate-spin"></div>
        <span class="text-[12px] text-silver-30 text-center px-1 line-clamp-2">{{ card.name }}</span>
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
      <p v-if="hasCardKingdomPrices" class="text-[14px] text-neon">{{ formatPrice(cardKingdomRetail) }} c/u</p>
      <p v-else class="text-[14px] text-silver-70">${{ card.price ? card.price.toFixed(2) : 'N/A' }} c/u</p>
      <p v-if="hasCardKingdomPrices" class="text-[14px] text-neon font-bold">{{ formatPrice((cardKingdomRetail ?? 0) * card.quantity) }}</p>
      <p v-else class="text-[14px] text-neon font-bold">${{ card.price ? (card.price * card.quantity).toFixed(2) : 'N/A' }}</p>
    </div>
  </div>
</template>
