<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { DisplayDeckCard, HydratedDeckCard, HydratedWishlistCard } from '../../types/deck'
import BaseButton from '../ui/BaseButton.vue'

const props = defineProps<{
  cards: DisplayDeckCard[]
  deckId: string
  commanderNames?: string[]
  groupBy?: 'type' | 'mana' | 'color'
}>()

const emit = defineEmits<{
  edit: [card: DisplayDeckCard]
  remove: [card: DisplayDeckCard]
  updateQuantity: [card: DisplayDeckCard, newQuantity: number]
  addToWishlist: [card: DisplayDeckCard]
  toggleCommander: [card: DisplayDeckCard]
}>()

// Preview state
const hoveredCard = ref<DisplayDeckCard | null>(null)
const previewCard = computed(() => hoveredCard.value || props.cards[0] || null)
let hoverTimeout: ReturnType<typeof setTimeout> | null = null

// Popup state
const showPopup = ref(false)
const popupCard = ref<DisplayDeckCard | null>(null)
const popupPosition = ref({ x: 0, y: 0 })

// Check if mobile (for popup positioning)
const isMobile = computed(() => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
})

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

// Get mana value category for grouping
const getManaCategory = (card: DisplayDeckCard): string => {
  if (isCommander(card)) return 'Commander'

  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('land')) return 'Lands'

  const cmc = card.cmc ?? 0
  if (cmc >= 7) return '7+'
  return String(cmc)
}

// Get color category for grouping
const getColorCategory = (card: DisplayDeckCard): string => {
  if (isCommander(card)) return 'Commander'

  const typeLine = card.type_line?.toLowerCase() || ''

  // Lands are always in their own category (at the end)
  if (typeLine.includes('land')) return 'Lands'

  // Get colors from the card - colors array only contains actual colors (W, U, B, R, G)
  // Colorless mana doesn't count as a color
  const cardAny = card as any
  const colors = cardAny.colors || cardAny.color_identity || []

  // Filter to only actual colors (in case there's any invalid data)
  const validColors = colors.filter((c: string) => ['W', 'U', 'B', 'R', 'G'].includes(c?.toUpperCase()))

  // No colors = colorless (artifacts, eldrazi, etc.)
  if (validColors.length === 0) return 'Colorless'

  // 2+ colors = multicolor
  if (validColors.length >= 2) return 'Multicolor'

  // Single color
  const color = validColors[0]?.toUpperCase()
  if (color === 'W') return 'White'
  if (color === 'U') return 'Blue'
  if (color === 'B') return 'Black'
  if (color === 'R') return 'Red'
  if (color === 'G') return 'Green'

  return 'Colorless'
}

// Category orders for different grouping modes
const typeOrder = ['Commander', 'Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other']
const manaOrder = ['Commander', '0', '1', '2', '3', '4', '5', '6', '7+', 'Lands']
const colorOrder = ['Commander', 'White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Lands']

// Get category based on current grouping mode
const getCategory = (card: DisplayDeckCard): string => {
  switch (props.groupBy) {
    case 'mana': return getManaCategory(card)
    case 'color': return getColorCategory(card)
    default: return getTypeCategory(card)
  }
}

// Get order based on current grouping mode
const getCategoryOrder = (): string[] => {
  switch (props.groupBy) {
    case 'mana': return manaOrder
    case 'color': return colorOrder
    default: return typeOrder
  }
}

// Group cards by selected mode
const groupedCards = computed(() => {
  const groups: Record<string, DisplayDeckCard[]> = {}
  const order = getCategoryOrder()

  for (const card of props.cards) {
    const category = getCategory(card)
    if (!groups[category]) groups[category] = []
    groups[category].push(card)
  }

  // Sort cards within each group by name
  for (const category in groups) {
    groups[category].sort((a, b) => a.name.localeCompare(b.name))
  }

  // Build sorted groups array
  const sortedGroups: Array<{ type: string; cards: DisplayDeckCard[] }> = []

  for (const category of order) {
    if (groups[category] && groups[category].length > 0) {
      sortedGroups.push({ type: category, cards: groups[category] })
    }
  }

  // Add any categories not in the order
  for (const category in groups) {
    if (!order.includes(category) && groups[category].length > 0) {
      sortedGroups.push({ type: category, cards: groups[category] })
    }
  }

  return sortedGroups
})

// Count total cards by category
const getTypeCount = (type: string): number => {
  const group = groupedCards.value.find(g => g.type === type)
  if (!group) return 0
  return group.cards.reduce((sum, c) => sum + getQuantity(c), 0)
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
  <div class="flex flex-col md:flex-row gap-4 md:gap-6 relative" @click.self="closePopup">
    <!-- Left Panel: Card Preview (Sticky) - Hidden on mobile -->
    <div class="hidden md:block w-[280px] flex-shrink-0 sticky top-4 self-start">
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

          <div class="border-t border-silver-20 pt-2 mt-2 space-y-1">
            <div class="flex justify-between">
              <span class="text-silver-70">TCG:</span>
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
    <div class="flex-1 space-y-4 md:space-y-6 min-w-0">
      <!-- Empty state -->
      <div v-if="cards.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">No hay cartas en este board</p>
      </div>

      <!-- Grouped cards -->
      <div v-for="group in groupedCards" :key="group.type" class="space-y-2">
        <!-- Category Header -->
        <h3
          class="text-tiny font-bold uppercase"
          :class="group.type === 'Commander' ? 'text-purple-400' : 'text-silver-70'"
        >
          {{ group.type }} ({{ getTypeCount(group.type) }})
        </h3>

        <!-- All cards in this category -->
        <div class="grid grid-cols-3 sm:grid-cols-4 md:flex md:flex-wrap gap-1.5 md:gap-2">
          <div
            v-for="card in group.cards"
            :key="card.scryfallId + (isWishlistCard(card) ? '-wish' : '')"
            class="relative cursor-pointer group"
            :class="{ 'opacity-60': card.isWishlist }"
            @mouseenter="handleMouseEnter(card)"
            @mouseleave="handleMouseLeave"
            @click="handleCardClick(card, $event)"
          >
            <!-- Card miniature - ONLY image -->
            <div
              class="w-full md:w-[145px] aspect-[3/4] bg-secondary border-2 overflow-hidden transition-all duration-150"
              :class="[
                card.isWishlist ? 'border-amber' : isCommander(card) ? 'border-purple-400' : 'border-transparent',
                'md:group-hover:border-neon md:group-hover:scale-105 md:group-hover:z-10'
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

            <!-- Quantity badge -->
            <div class="absolute bottom-0.5 left-0.5 md:bottom-1 md:left-1 bg-primary/90 border border-neon px-1 md:px-2 py-0.5 md:py-1">
              <span class="text-tiny md:text-small font-bold text-neon">x{{ getQuantity(card) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quantity Popup -->
    <Teleport to="body">
      <div
        v-if="showPopup && popupCard"
        class="fixed inset-0 z-50 flex items-center justify-center md:items-start md:justify-start p-4 md:p-0"
        :style="isMobile ? {} : {
          left: `${popupPosition.x}px`,
          top: `${popupPosition.y}px`,
          transform: 'translateX(-50%)',
          position: 'fixed',
          inset: 'auto'
        }"
      >
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-primary/50 md:bg-transparent" @click="closePopup"></div>

        <!-- Popup content -->
        <div class="relative bg-primary border border-silver-30 p-4 md:p-3 shadow-lg w-full max-w-[280px] md:min-w-[200px]">
          <!-- Mobile: Show card image -->
          <div class="md:hidden mb-3">
            <img
              v-if="getCardImageSmall(popupCard)"
              :src="getCardImageSmall(popupCard)"
              :alt="popupCard.name"
              class="w-24 h-auto mx-auto border border-silver-30"
            />
          </div>

          <p class="text-small md:text-tiny font-bold text-silver mb-3 md:mb-2 text-center md:text-left truncate">{{ popupCard.name }}</p>

          <!-- Quantity controls -->
          <div class="flex items-center justify-center gap-4 md:gap-3 mb-4 md:mb-3">
            <button
              @click="adjustQuantity(-1)"
              class="w-12 h-12 md:w-8 md:h-8 bg-rust/20 border border-rust text-rust font-bold text-h3 md:text-body hover:bg-rust/40 transition-all"
            >
              -
            </button>
            <span class="text-h2 md:text-h3 font-bold text-neon min-w-[50px] md:min-w-[40px] text-center">
              {{ getQuantity(popupCard) }}
            </span>
            <button
              @click="adjustQuantity(1)"
              class="w-12 h-12 md:w-8 md:h-8 bg-neon/20 border border-neon text-neon font-bold text-h3 md:text-body hover:bg-neon/40 transition-all"
            >
              +
            </button>
          </div>

          <!-- Commander toggle button -->
          <BaseButton
            size="small"
            :variant="isCommander(popupCard) ? 'primary' : 'secondary'"
            class="w-full text-tiny mb-2"
            :class="isCommander(popupCard) ? 'bg-purple-400/20 border-purple-400 text-purple-400' : ''"
            @click="emit('toggleCommander', popupCard); closePopup()"
          >
            {{ isCommander(popupCard) ? '★ QUITAR COMMANDER' : '☆ HACER COMMANDER' }}
          </BaseButton>

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

          <!-- Close button for mobile -->
          <button
            class="md:hidden absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-silver-50 hover:text-silver"
            @click="closePopup"
          >
            ✕
          </button>
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
