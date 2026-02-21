<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { translateCategory as baseTranslateCategory, colorOrder, getCardColorCategory, getCardManaCategory, getCardRarityCategory, getCardTypeCategory, manaOrder, rarityOrder, typeOrder } from '../../composables/useCardFilter'
import type { DisplayDeckCard, HydratedWishlistCard } from '../../types/deck'

const props = defineProps<{
  cards: DisplayDeckCard[]
  deckId: string
  commanderNames?: string[]
  groupBy?: 'none' | 'type' | 'mana' | 'color'
  sortBy?: 'recent' | 'name' | 'price'
  selectedColors?: Set<string>
  selectedManaValues?: Set<string>
  selectedTypes?: Set<string>
  selectedRarities?: Set<string>
}>()

const emit = defineEmits<{
  edit: [card: DisplayDeckCard]
  remove: [card: DisplayDeckCard]
  updateQuantity: [card: DisplayDeckCard, newQuantity: number]
  addToWishlist: [card: DisplayDeckCard]
  toggleCommander: [card: DisplayDeckCard]
}>()

const { t } = useI18n()

// Preview state
const hoveredCard = ref<DisplayDeckCard | null>(null)
const previewCard = computed(() => hoveredCard.value || props.cards[0] || null)
let hoverTimeout: ReturnType<typeof setTimeout> | null = null

// Type guard
const isWishlistCard = (card: DisplayDeckCard): card is HydratedWishlistCard => {
  return card.isWishlist
}

const getQuantity = (card: DisplayDeckCard): number => {
  if (isWishlistCard(card)) return card.requestedQuantity
  return (card).allocatedQuantity
}

// Check if card is a commander
const isCommander = (card: DisplayDeckCard): boolean => {
  if (!props.commanderNames || props.commanderNames.length === 0) return false
  const cardNameLower = card.name.toLowerCase()
  return props.commanderNames.some(name => name.toLowerCase() === cardNameLower)
}

// Commander-aware category wrappers (delegate to shared helpers)
const getTypeCategory = (card: DisplayDeckCard): string => {
  if (isCommander(card)) return 'Commander'
  return getCardTypeCategory(card)
}

const getManaCategory = (card: DisplayDeckCard): string => {
  if (isCommander(card)) return 'Commander'
  return getCardManaCategory(card)
}

const getColorCategory = (card: DisplayDeckCard): string => {
  if (isCommander(card)) return 'Commander'
  return getCardColorCategory(card)
}

// Extended orders with Commander prepended
const deckTypeOrder = ['Commander', ...typeOrder]
const deckManaOrder = ['Commander', ...manaOrder]
const deckColorOrder = ['Commander', ...colorOrder]

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
    case 'mana': return deckManaOrder
    case 'color': return deckColorOrder
    default: return deckTypeOrder
  }
}

// Translate category name
const translateCategoryLabel = (category: string): string => {
  return baseTranslateCategory(category, t)
}

// Sort function based on sortBy prop
const sortCards = (cards: DisplayDeckCard[]): DisplayDeckCard[] => {
  const sorted = [...cards]
  switch (props.sortBy) {
    case 'recent':
      sorted.sort((a, b) => {
        const dateA = (a as any).addedAt ? new Date((a as any).addedAt).getTime() : 0
        const dateB = (b as any).addedAt ? new Date((b as any).addedAt).getTime() : 0
        return dateB - dateA
      })
      break
    case 'price':
      sorted.sort((a, b) => (b.price || 0) - (a.price || 0))
      break
    case 'name':
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name))
      break
  }
  return sorted
}

// Check if a card passes all three cross-filters
const passesFilters = (card: DisplayDeckCard): boolean => {
  if (props.selectedColors && props.selectedColors.size < deckColorOrder.length) {
    const color = getColorCategory(card)
    if (!props.selectedColors.has(color)) return false
  }
  if (props.selectedManaValues && props.selectedManaValues.size < deckManaOrder.length) {
    const mana = getManaCategory(card)
    if (!props.selectedManaValues.has(mana)) return false
  }
  if (props.selectedTypes && props.selectedTypes.size < deckTypeOrder.length) {
    const type = getTypeCategory(card)
    if (!props.selectedTypes.has(type)) return false
  }
  if (props.selectedRarities && props.selectedRarities.size < rarityOrder.length) {
    const rarity = getCardRarityCategory(card)
    if (!props.selectedRarities.has(rarity)) return false
  }
  return true
}

const hasActiveFilters = computed(() => {
  return (props.selectedColors && props.selectedColors.size < deckColorOrder.length)
    || (props.selectedManaValues && props.selectedManaValues.size < deckManaOrder.length)
    || (props.selectedTypes && props.selectedTypes.size < deckTypeOrder.length)
    || (props.selectedRarities && props.selectedRarities.size < rarityOrder.length)
})

// Group cards by selected mode
const groupedCards = computed(() => {
  const source = hasActiveFilters.value ? props.cards.filter(passesFilters) : props.cards

  // If groupBy is 'none', return flat sorted list
  if (props.groupBy === 'none') {
    const sortedCards = sortCards(source)
    return [{ type: 'all', cards: sortedCards }]
  }

  const groups: Record<string, DisplayDeckCard[]> = {}
  const order = getCategoryOrder()

  for (const card of source) {
    const category = getCategory(card)
    if (!groups[category]) groups[category] = []
    groups[category].push(card)
  }

  // Sort cards within each group using sortBy
  for (const category in groups) {
    const group = groups[category]
    if (group) {
      groups[category] = sortCards(group)
    }
  }

  const sortedGroups: { type: string; cards: DisplayDeckCard[] }[] = []

  for (const category of order) {
    const group = groups[category]
    if (group && group.length > 0) {
      sortedGroups.push({ type: category, cards: group })
    }
  }

  // Add any categories not in the order
  for (const category in groups) {
    const group = groups[category]
    if (!order.includes(category) && group && group.length > 0) {
      sortedGroups.push({ type: category, cards: group })
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

// Click handler - open card detail directly
const handleCardClick = (card: DisplayDeckCard) => {
  emit('edit', card)
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

</script>

<template>
  <div class="flex flex-col md:flex-row gap-4 md:gap-6 relative">
    <!-- Left Panel: Card Preview (Sticky) - Hidden on mobile -->
    <div class="hidden md:block w-[280px] flex-shrink-0 sticky top-[88px] self-start">
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
            {{ t('decks.editorGrid.noImage') }}
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
              <span class="text-silver-70">{{ t('decks.editorGrid.tcg') }}</span>
              <span class="text-neon font-bold">${{ previewCard.price?.toFixed(2) || 'N/A' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-silver-70">{{ t('decks.editorGrid.total') }}</span>
              <span class="text-neon font-bold">${{ (previewCard.price * getQuantity(previewCard)).toFixed(2) }}</span>
            </div>
          </div>

          <!-- Commander indicator -->
          <div v-if="isCommander(previewCard)" class="bg-purple-400/10 border border-purple-400 p-2 text-tiny text-purple-400">
            {{ t('decks.editorGrid.categories.Commander') }}
          </div>

          <!-- Wishlist indicator -->
          <div v-if="previewCard.isWishlist" class="bg-amber/10 border border-amber p-2 text-tiny text-amber">
            {{ t('decks.editorGrid.noCardsInCollection') }}
          </div>
        </div>
      </div>

      <div v-else class="aspect-[3/4] bg-secondary border border-silver-30 flex items-center justify-center">
        <p class="text-tiny text-silver-50">{{ t('decks.editorGrid.noCards') }}</p>
      </div>
    </div>

    <!-- Right Panel: Cards Grid -->
    <div class="flex-1 space-y-4 md:space-y-6 min-w-0">
      <!-- Empty state -->
      <div v-if="cards.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">{{ t('decks.editorGrid.emptyBoard') }}</p>
      </div>

      <!-- Grouped cards -->
      <div v-for="group in groupedCards" :key="group.type" class="space-y-2">
        <!-- Category Header (hidden when groupBy is 'none') -->
        <h3
          v-if="group.type !== 'all'"
          class="text-tiny font-bold uppercase"
          :class="group.type === 'Commander' ? 'text-purple-400' : 'text-silver-70'"
        >
          {{ translateCategoryLabel(group.type) }} ({{ getTypeCount(group.type) }})
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
            @click="handleCardClick(card)"
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

  </div>
</template>

<style scoped>
.group-hover\:scale-105:hover {
  transform: scale(1.05);
}
</style>
