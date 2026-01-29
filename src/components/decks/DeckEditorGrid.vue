<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { DisplayDeckCard, HydratedDeckCard, HydratedWishlistCard } from '../../types/deck'
import BaseButton from '../ui/BaseButton.vue'

const props = defineProps<{
  cards: DisplayDeckCard[]
  deckId: string
  commanderNames?: string[]
}>()

const emit = defineEmits<{
  edit: [card: DisplayDeckCard]
  remove: [card: DisplayDeckCard]
  updateQuantity: [card: DisplayDeckCard, newQuantity: number]
  addToWishlist: [card: DisplayDeckCard]
}>()

// Preview state
const hoveredCard = ref<DisplayDeckCard | null>(null)
const previewCard = computed(() => hoveredCard.value || props.cards[0] || null)
let hoverTimeout: ReturnType<typeof setTimeout> | null = null

// Popup state
const showPopup = ref(false)
const popupCard = ref<DisplayDeckCard | null>(null)
const popupPosition = ref({ x: 0, y: 0 })

// Type guard
const isWishlistCard = (card: DisplayDeckCard): card is HydratedWishlistCard => {
  return card.isWishlist === true
}

const getQuantity = (card: DisplayDeckCard): number => {
  if (isWishlistCard(card)) return card.requestedQuantity
  return (card as HydratedDeckCard).allocatedQuantity
}

// Check if card is a commander
const isCommander = (card: DisplayDeckCard): boolean => {
  if (!props.commanderNames || props.commanderNames.length === 0) return false
  const cardNameLower = card.name.toLowerCase()
  return props.commanderNames.some(name => name.toLowerCase() === cardNameLower)
}

// Get card type category for grouping
const getTypeCategory = (card: DisplayDeckCard): string => {
  // Check for commander first
  if (isCommander(card)) return 'Commander'

  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('creature')) return 'Creatures'
  if (typeLine.includes('instant')) return 'Instants'
  if (typeLine.includes('sorcery')) return 'Sorceries'
  if (typeLine.includes('enchantment')) return 'Enchantments'
  if (typeLine.includes('artifact')) return 'Artifacts'
  if (typeLine.includes('planeswalker')) return 'Planeswalkers'
  if (typeLine.includes('land')) return 'Lands'
  return 'Other'
}

// Type order for sorting (Commander first)
const typeOrder = ['Commander', 'Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other']

// Group cards by type, then by cmc within each type
const groupedCards = computed(() => {
  const groups: Record<string, Record<number, DisplayDeckCard[]>> = {}

  for (const card of props.cards) {
    const type = getTypeCategory(card)
    const cmc = card.cmc ?? 0

    if (!groups[type]) groups[type] = {}
    if (!groups[type][cmc]) groups[type][cmc] = []
    groups[type][cmc].push(card)
  }

  // Sort by type order
  const sortedGroups: Array<{ type: string; cmcGroups: Array<{ cmc: number; cards: DisplayDeckCard[] }> }> = []

  for (const type of typeOrder) {
    if (groups[type]) {
      const cmcGroups = Object.entries(groups[type])
        .map(([cmc, cards]) => ({ cmc: parseInt(cmc), cards }))
        .sort((a, b) => a.cmc - b.cmc)
      sortedGroups.push({ type, cmcGroups })
    }
  }

  return sortedGroups
})

// Count total cards by type
const getTypeCount = (type: string): number => {
  const group = groupedCards.value.find(g => g.type === type)
  if (!group) return 0
  return group.cmcGroups.reduce((sum, cg) =>
    sum + cg.cards.reduce((s, c) => s + getQuantity(c), 0), 0)
}

// Hover handlers with delay
const handleMouseEnter = (card: DisplayDeckCard) => {
  if (hoverTimeout) clearTimeout(hoverTimeout)
  hoverTimeout = setTimeout(() => {
    hoveredCard.value = card
  }, 150)
}

const handleMouseLeave = () => {
  if (hoverTimeout) clearTimeout(hoverTimeout)
  hoverTimeout = null
}

// Click handler for popup
const handleCardClick = (card: DisplayDeckCard, event: MouseEvent) => {
  popupCard.value = card

  // Position popup near the click - check if near bottom of screen
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const popupHeight = 180 // Approximate popup height
  const viewportHeight = window.innerHeight
  const spaceBelow = viewportHeight - rect.bottom
  const showAbove = spaceBelow < popupHeight + 20

  popupPosition.value = {
    x: rect.left + rect.width / 2,
    y: showAbove ? rect.top - popupHeight - 8 : rect.bottom + 8
  }
  showPopup.value = true
}

// Close popup when clicking outside
const closePopup = () => {
  showPopup.value = false
  popupCard.value = null
}

// Quantity adjustment
const adjustQuantity = (delta: number) => {
  if (!popupCard.value) return
  const currentQty = getQuantity(popupCard.value)
  const newQty = Math.max(0, currentQty + delta)

  if (newQty === 0) {
    emit('remove', popupCard.value)
    closePopup()
  } else if (!popupCard.value.isWishlist && delta > 0) {
    // Check if exceeding available in collection
    const hydratedCard = popupCard.value as HydratedDeckCard
    const maxAvailable = hydratedCard.totalInCollection

    if (newQty > maxAvailable) {
      // Open advanced panel instead
      emit('edit', popupCard.value)
      closePopup()
    } else {
      emit('updateQuantity', popupCard.value, newQty)
    }
  } else {
    emit('updateQuantity', popupCard.value, newQty)
  }
}

// Get card image
const getCardImage = (card: DisplayDeckCard): string => {
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image)
      if (parsed.card_faces && parsed.card_faces.length > 0) {
        return parsed.card_faces[0]?.image_uris?.normal || ''
      }
    } catch {
      return card.image
    }
  }
  return card.image || ''
}

const getCardImageSmall = (card: DisplayDeckCard): string => {
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image)
      if (parsed.card_faces && parsed.card_faces.length > 0) {
        return parsed.card_faces[0]?.image_uris?.small || ''
      }
    } catch {
      return card.image.replace('/normal/', '/small/')
    }
  }
  return card.image?.replace('/normal/', '/small/') || ''
}

// Close popup on scroll
watch(() => props.cards, () => {
  closePopup()
})
</script>

<template>
  <div class="flex gap-6 relative" @click.self="closePopup">
    <!-- Left Panel: Card Preview (Sticky) -->
    <div class="w-[280px] flex-shrink-0 sticky top-4 self-start">
      <div v-if="previewCard" class="space-y-3">
        <!-- Card Image -->
        <div class="aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden">
          <img
            v-if="getCardImage(previewCard)"
            :src="getCardImage(previewCard)"
            :alt="previewCard.name"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-tiny text-silver-50">
            No image
          </div>
        </div>

        <!-- Card Info -->
        <div class="space-y-2 text-small">
          <p class="font-bold text-silver text-body">{{ previewCard.name }}</p>
          <p class="text-silver-70">{{ previewCard.edition }} - {{ previewCard.condition }}</p>
          <p v-if="previewCard.foil" class="text-neon">FOIL</p>
          <p v-if="previewCard.type_line" class="text-silver-50 text-tiny">{{ previewCard.type_line }}</p>

          <div class="border-t border-silver-20 pt-2 mt-2">
            <div class="flex justify-between">
              <span class="text-silver-70">Precio:</span>
              <span class="text-neon font-bold">${{ previewCard.price?.toFixed(2) || 'N/A' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-silver-70">Total:</span>
              <span class="text-neon font-bold">${{ (previewCard.price * getQuantity(previewCard)).toFixed(2) }}</span>
            </div>
          </div>

          <!-- Commander indicator -->
          <div v-if="isCommander(previewCard)" class="bg-purple-400/10 border border-purple-400 p-2 text-tiny text-purple-400">
            Commander
          </div>

          <!-- Wishlist indicator -->
          <div v-if="previewCard.isWishlist" class="bg-amber/10 border border-amber p-2 text-tiny text-amber">
            No tienes esta carta en colección
          </div>
        </div>
      </div>

      <div v-else class="aspect-[3/4] bg-secondary border border-silver-30 flex items-center justify-center">
        <p class="text-tiny text-silver-50">Sin cartas</p>
      </div>
    </div>

    <!-- Right Panel: Cards Grid -->
    <div class="flex-1 space-y-6 min-w-0">
      <!-- Empty state -->
      <div v-if="cards.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">No hay cartas en este board</p>
      </div>

      <!-- Grouped cards -->
      <div v-for="group in groupedCards" :key="group.type" class="space-y-2">
        <!-- Type Header -->
        <h3
          class="text-tiny font-bold uppercase"
          :class="group.type === 'Commander' ? 'text-purple-400' : 'text-silver-70'"
        >
          {{ group.type }} ({{ getTypeCount(group.type) }})
        </h3>

        <!-- All cards in this type (flat, no CMC subgroups) -->
        <div class="flex flex-wrap gap-2">
          <template v-for="cmcGroup in group.cmcGroups" :key="`${group.type}-${cmcGroup.cmc}`">
            <div
              v-for="card in cmcGroup.cards"
              :key="card.scryfallId + (isWishlistCard(card) ? '-wish' : '')"
              class="relative cursor-pointer group"
              :class="{ 'opacity-60': card.isWishlist }"
              @mouseenter="handleMouseEnter(card)"
              @mouseleave="handleMouseLeave"
              @click="handleCardClick(card, $event)"
            >
              <!-- Card miniature - ONLY image -->
              <div
                class="w-[145px] aspect-[3/4] bg-secondary border-2 overflow-hidden transition-all duration-150"
                :class="[
                  card.isWishlist ? 'border-amber' : isCommander(card) ? 'border-purple-400' : 'border-transparent',
                  'group-hover:border-neon group-hover:scale-105 group-hover:z-10'
                ]"
              >
                <img
                  v-if="getCardImageSmall(card)"
                  :src="getCardImageSmall(card)"
                  :alt="card.name"
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
              </div>

              <!-- Quantity badge (only if > 1) -->
              <div v-if="getQuantity(card) > 1" class="absolute bottom-1 left-1 bg-primary/90 border border-neon px-2 py-1">
                <span class="text-small font-bold text-neon">x{{ getQuantity(card) }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Quantity Popup -->
    <Teleport to="body">
      <div
        v-if="showPopup && popupCard"
        class="fixed z-50"
        :style="{
          left: `${popupPosition.x}px`,
          top: `${popupPosition.y}px`,
          transform: 'translateX(-50%)'
        }"
      >
        <!-- Backdrop -->
        <div class="fixed inset-0" @click="closePopup"></div>

        <!-- Popup content -->
        <div class="relative bg-primary border border-silver-30 p-3 shadow-lg min-w-[200px]">
          <p class="text-tiny font-bold text-silver mb-2 truncate">{{ popupCard.name }}</p>

          <!-- Quantity controls -->
          <div class="flex items-center justify-center gap-3 mb-3">
            <button
              @click="adjustQuantity(-1)"
              class="w-8 h-8 bg-rust/20 border border-rust text-rust font-bold hover:bg-rust/40 transition-all"
            >
              -
            </button>
            <span class="text-h3 font-bold text-neon min-w-[40px] text-center">
              {{ getQuantity(popupCard) }}
            </span>
            <button
              @click="adjustQuantity(1)"
              class="w-8 h-8 bg-neon/20 border border-neon text-neon font-bold hover:bg-neon/40 transition-all"
            >
              +
            </button>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-2">
            <BaseButton
              v-if="popupCard.isWishlist"
              size="small"
              variant="secondary"
              class="flex-1 text-tiny"
              @click="emit('addToWishlist', popupCard); closePopup()"
            >
              + WISHLIST
            </BaseButton>
            <BaseButton
              size="small"
              variant="secondary"
              class="flex-1 text-tiny"
              @click="emit('edit', popupCard); closePopup()"
            >
              AVANZADO
            </BaseButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.group-hover\:scale-105:hover {
  transform: scale(1.05);
}
</style>
