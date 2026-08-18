<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import { isDisplayableImageUrl, scryfallFallbackUrl } from '../../utils/cardImageUrl'
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

const { t } = useI18n()

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

// TASK-241 AC7: if our own image proxy (relative /img/... URL) fails to
// load, fall back to hitting Scryfall directly so the card still renders
// instead of going blank. Reset whenever the underlying image/face changes.
const fallbackSrc = ref<string | null>(null)
watch(() => props.card.image, () => { fallbackSrc.value = null })
watch(cardFaceIndex, () => { fallbackSrc.value = null })
const effectiveCardImage = computed(() => fallbackSrc.value ?? getCardImage(props.card))

// True when card has a real image URL (not empty, not whitespace). Our own
// proxy URLs are same-origin relative paths (/img/...), not absolute http(s)
// URLs, so both shapes are accepted here.
const hasImage = computed(() => isDisplayableImageUrl(effectiveCardImage.value))

// v2 redesign — status badge (dot + pill, DESIGN-DIRECTION.md §5). Pure CSS dot
// (span, not svg) per the Mali GPU rule: this card is rendered inside a virtualized grid.
// Semantics unchanged: sale/trade/wishlist get a badge, plain `collection` gets none.
// Opaque dark base (not just a color tint) — the proto's 12-14% tint only reads on its
// own flat placeholder background; over real card art/name-bars it was unreadable.
const badgeMap: Record<string, { labelKey: string; classes: string }> = {
  sale: { labelKey: 'collection.badges.vendo', classes: 'bg-[rgba(13,13,15,.85)] text-[#C4553F]' },
  trade: { labelKey: 'collection.badges.cambio', classes: 'bg-[rgba(13,13,15,.85)] text-[#60A5FA]' },
  wishlist: { labelKey: 'collection.badges.deseado', classes: 'bg-[rgba(13,13,15,.85)] text-gold' },
}
const badgeInfo = computed(() => {
  // eslint-disable-next-line security/detect-object-injection
  const entry = badgeMap[props.card.status]
  if (!entry) return null
  return { label: t(entry.labelKey), classes: entry.classes }
})

// Track image loading state for showing spinner overlay
const imageLoaded = ref(false)
const onImageLoad = () => { imageLoaded.value = true }
// TASK-241 AC7: first failure on our own proxy URL swaps to the Scryfall
// direct-fallback URL (via fallbackSrc/effectiveCardImage above) instead of
// giving up — only marks the card as failed-to-load if the fallback ALSO
// fails, or if the URL wasn't one of ours to begin with.
const onImageError = () => {
  if (fallbackSrc.value === null) {
    const fb = scryfallFallbackUrl(getCardImage(props.card))
    if (fb) {
      fallbackSrc.value = fb
      return
    }
  }
  imageLoaded.value = false
}
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
  <div ref="compactCardRef" data-testid="collection-card" class="group cursor-pointer min-h-[180px]" @click="emit('cardClick', card)">
    <!-- TASK-175: bg-primary (not bg-secondary) — same color as the loading
         overlay below (`v-if="!imageLoaded"` / the !hasImage branch), so
         there is no visual difference between "container background showing
         through" and "loading overlay visible": the transition is invisible
         regardless of paint-order timing, instead of depending on the
         overlay always winning a race. -->
    <div class="relative aspect-[3/4] bg-primary border border-silver-30 overflow-hidden group-hover:border-neon transition-all rounded-lg">
      <!-- Status badge (v2 dot pill, DESIGN-DIRECTION.md §5) — sale/trade/wishlist only -->
      <span
          v-if="badgeInfo"
          class="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-[0_1px_5px_rgba(0,0,0,.45)]"
          :class="badgeInfo.classes"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0"></span>
        {{ badgeInfo.label }}
      </span>
      <template v-if="hasImage">
        <img
            :src="effectiveCardImage"
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

      <!-- Quantity plate (v2, DESIGN-DIRECTION.md §5) -->
      <span class="absolute bottom-1.5 right-1.5 z-10 px-2 py-0.5 rounded bg-black/70 border border-line-strong font-display font-tnum text-[11px] font-bold text-silver">
        x{{ card.quantity }}
      </span>
    </div>

    <!-- Minimal Card Info -->
    <div class="mt-1 min-h-[50px]">
      <p class="text-[14px] font-bold text-silver line-clamp-2 group-hover:text-neon transition-colors leading-tight">
        {{ card.name }}
      </p>
      <p v-if="hasCardKingdomPrices" class="font-display font-tnum text-[14px] text-neon">{{ formatPrice(cardKingdomRetail) }} c/u</p>
      <p v-else class="font-display font-tnum text-[14px] text-silver-70">${{ card.price ? card.price.toFixed(2) : 'N/A' }} c/u</p>
      <p v-if="hasCardKingdomPrices" class="font-display font-tnum text-[14px] text-neon font-bold">{{ formatPrice((cardKingdomRetail ?? 0) * card.quantity) }}</p>
      <p v-else class="font-display font-tnum text-[14px] text-neon font-bold">${{ card.price ? (card.price * card.quantity).toFixed(2) : 'N/A' }}</p>
    </div>
  </div>
</template>
