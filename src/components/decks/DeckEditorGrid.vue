<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { useContextMenu } from '../../composables/useContextMenu'
import { useCollectionStore } from '../../stores/collection'
import { sharedCardPrices } from '../../composables/useCollectionTotals'
import { formatPrice } from '../../services/mtgjson'
import { translateCategory as baseTranslateCategory, colorOrder, getCardColorCategory, getCardManaCategory, getCardRarityCategory, getCardTypeCategory, manaOrder, passesColorFilter, rarityOrder, typeOrder } from '../../composables/useCardFilter'
import { useVirtualGrid } from '../../composables/useVirtualGrid'
import ContextMenu from '../ui/ContextMenu.vue'
import type { ContextMenuItem } from '../../types/contextMenu'
import type { DisplayDeckCard, HydratedWishlistCard } from '../../types/deck'

const props = defineProps<{
  cards: DisplayDeckCard[]
  deckId: string
  commanderNames?: string[]
  binderMode?: boolean
  groupBy?: 'none' | 'type' | 'mana' | 'color' | 'name'
  sortBy?: 'recent' | 'name' | 'price'
  selectedColors?: Set<string>
  exactColorMode?: boolean
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
  moveBoard: [card: DisplayDeckCard]
  setStatus: [card: DisplayDeckCard, status: string]
  toggleFoil: [card: DisplayDeckCard]
  togglePublic: [card: DisplayDeckCard]
  addCard: []
}>()

const { t } = useI18n()

// Preview state
const hoveredCard = ref<DisplayDeckCard | null>(null)
const previewCard = computed(() => hoveredCard.value)

// Price lookup from shared collection prices
const previewPrices = computed(() => {
  const card = previewCard.value
  if (!card) return null
  return sharedCardPrices.value.get(card.cardId) ?? null
})

const previewCKRetail = computed(() => previewPrices.value?.cardKingdom?.retail ?? null)
const previewCKBuylist = computed(() => previewPrices.value?.cardKingdom?.buylist ?? null)
let hoverTimeout: ReturnType<typeof setTimeout> | null = null

// Type guard
const isWishlistCard = (card: DisplayDeckCard): card is HydratedWishlistCard => {
  return card.isWishlist
}

// Proxy detection: wishlist card but user owns copies allocated elsewhere
const isProxy = (card: DisplayDeckCard): boolean => {
  return card.isWishlist && card.totalInCollection > 0
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
    case 'name': return card.name ?? 'Unknown'
    default: return getTypeCategory(card)
  }
}

// Get order based on current grouping mode
const getCategoryOrder = (): string[] => {
  switch (props.groupBy) {
    case 'mana': return deckManaOrder
    case 'color': return deckColorOrder
    case 'name': return []
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
        const aRecord = a as unknown as Record<string, unknown>
        const bRecord = b as unknown as Record<string, unknown>
        const dateA = aRecord.addedAt ? new Date(aRecord.addedAt as string).getTime() : 0
        const dateB = bRecord.addedAt ? new Date(bRecord.addedAt as string).getTime() : 0
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

// Generic filter check: if a filter set is active and the card's value isn't in it, reject
const passesFilterSet = (selected: Set<string> | undefined, maxSize: number, value: string): boolean => {
  return !selected || selected.size >= maxSize || selected.has(value)
}

// Check if a card passes all cross-filters
const passesFilters = (card: DisplayDeckCard): boolean => {
  // Color filter: lands with produced_mana match if ANY produced color is selected
  const colorOk = !props.selectedColors || props.selectedColors.size >= deckColorOrder.length || passesColorFilter(card, props.selectedColors, props.exactColorMode)
  return colorOk
    && passesFilterSet(props.selectedManaValues, deckManaOrder.length, getManaCategory(card))
    && passesFilterSet(props.selectedTypes, deckTypeOrder.length, getTypeCategory(card))
    && passesFilterSet(props.selectedRarities, rarityOrder.length, getCardRarityCategory(card))
}

const hasActiveFilters = computed(() => {
  return (props.selectedColors && props.selectedColors.size < deckColorOrder.length)
    ?? (props.selectedManaValues && props.selectedManaValues.size < deckManaOrder.length)
    ?? (props.selectedTypes && props.selectedTypes.size < deckTypeOrder.length)
    ?? (props.selectedRarities && props.selectedRarities.size < rarityOrder.length)
})

// Build ordered groups from source cards
const buildGroups = (source: DisplayDeckCard[], getCategoryFn: (card: DisplayDeckCard) => string, order: string[]): { type: string; cards: DisplayDeckCard[] }[] => {
  const groups: Record<string, DisplayDeckCard[]> = {}
  for (const card of source) {
    const category = getCategoryFn(card)
    // eslint-disable-next-line security/detect-object-injection
    groups[category] ??= []
    // eslint-disable-next-line security/detect-object-injection
    groups[category].push(card)
  }
  for (const category in groups) {
    // eslint-disable-next-line security/detect-object-injection
    const group = groups[category]
    // eslint-disable-next-line security/detect-object-injection
    if (group) groups[category] = sortCards(group)
  }
  const result: { type: string; cards: DisplayDeckCard[] }[] = []
  for (const category of order) {
    // eslint-disable-next-line security/detect-object-injection
    const g = groups[category]
    if (g?.length) result.push({ type: category, cards: g })
  }
  for (const category in groups) {
    // eslint-disable-next-line security/detect-object-injection
    const g = groups[category]
    if (!order.includes(category) && g?.length) result.push({ type: category, cards: g })
  }
  return result
}

// Filtered source shared by groupedCards and remaining count
const filteredSource = computed(() => {
  return hasActiveFilters.value ? props.cards.filter(passesFilters) : props.cards
})

// Group cards by selected mode
const groupedCards = computed(() => {
  const source = filteredSource.value
  if (props.groupBy === 'none') return [{ type: 'all', cards: sortCards(source) }]
  return buildGroups(source, getCategory, getCategoryOrder())
})

// Virtual scroll for binder mode with no grouping — only for large binders (200+ cards)
// Small binders render with the regular grid to avoid estimateRowHeight gaps
const useBinderVirtualScroll = computed(() => {
  if (!props.binderMode || props.groupBy !== 'none') return false
  const group = groupedCards.value[0]
  return (group?.cards.length ?? 0) > 200
})

const binderFlatCards = computed(() => {
  if (!useBinderVirtualScroll.value) return []
  const group = groupedCards.value[0]
  return group ? group.cards : []
})

/** Column count for binder flex-wrap layout based on card widths */
const BREAKPOINTS_2XL = 1536
const getBinderColumns = (width: number): number => {
  // Card widths + gap-2 (8px): 85(md), 105(lg), 130(xl), 182(2xl)
  if (width >= BREAKPOINTS_2XL) return Math.max(1, Math.floor((width + 8) / (182 + 8)))
  if (width >= 1280) return Math.max(1, Math.floor((width + 8) / (130 + 8)))
  if (width >= 1024) return Math.max(1, Math.floor((width + 8) / (105 + 8)))
  if (width >= 768) return Math.max(1, Math.floor((width + 8) / (85 + 8)))
  if (width >= 640) return 4 // sm: grid-cols-4
  return 3 // grid-cols-3
}

const {
  containerRef: binderContainerRef,
  virtualRows: binderVirtualRows,
  totalSize: binderTotalSize,
  virtualizer: binderVirtualizer,
} = useVirtualGrid({
  items: binderFlatCards,
  estimateRowHeight: 180,
  overscan: 5,
  getColumns: getBinderColumns,
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

onUnmounted(() => {
  if (hoverTimeout) clearTimeout(hoverTimeout)
})

// Click handler - open card detail directly
const handleCardClick = (card: DisplayDeckCard) => {
  emit('edit', card)
}

// Get card image
interface ParsedCardImage {
  card_faces?: { image_uris?: { normal?: string; small?: string } }[]
}

const getCardImage = (card: DisplayDeckCard): string => {
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image) as ParsedCardImage
      if (parsed.card_faces && parsed.card_faces.length > 0) {
        return parsed.card_faces[0]?.image_uris?.normal ?? ''
      }
    } catch {
      return card.image
    }
  }
  return card.image ?? ''
}

const getCardImageSmall = (card: DisplayDeckCard): string => {
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image) as ParsedCardImage
      if (parsed.card_faces && parsed.card_faces.length > 0) {
        return parsed.card_faces[0]?.image_uris?.small ?? ''
      }
    } catch {
      return card.image.replace('/normal/', '/small/')
    }
  }
  return card.image?.replace('/normal/', '/small/') ?? ''
}

// ── Context Menu ──
const isTouchDevice = 'ontouchstart' in window
const {
  isVisible: ctxVisible,
  position: ctxPosition,
  targetData: ctxCard,
  open: ctxOpen,
  close: ctxClose,
} = useContextMenu<DisplayDeckCard>()

const handleContextMenu = (e: MouseEvent, card: DisplayDeckCard) => {
  if (isTouchDevice) return
  ctxOpen(e, card)
}

const deckContextMenuItems = computed((): ContextMenuItem[] => {
  const card = ctxCard.value
  if (!card) return []

  const items: ContextMenuItem[] = [
    { id: 'plus', label: t('decks.contextMenu.plusOne'), icon: 'plus' },
    { id: 'minus', label: t('decks.contextMenu.minusOne'), icon: 'x-mark', dividerAfter: true },
  ]

  if (props.binderMode) {
    // Binder: status, foil, public (like collection cards)
    const collectionStore = useCollectionStore()
    const sourceCard = collectionStore.getCardById(card.cardId)
    const currentStatus = sourceCard?.status ?? 'collection'
    const isPublic = sourceCard?.public ?? false
    items.push(
      { id: 'status-collection', label: t('cards.contextMenu.collection'), icon: 'box', active: currentStatus === 'collection' },
      { id: 'status-trade', label: t('cards.contextMenu.trade'), icon: 'handshake', active: currentStatus === 'trade' },
      { id: 'status-sale', label: t('cards.contextMenu.sale'), icon: 'money', active: currentStatus === 'sale' },
      { id: 'status-wishlist', label: t('cards.contextMenu.wishlist'), icon: 'star', active: currentStatus === 'wishlist', dividerAfter: true },
      { id: 'toggle-foil', label: t('cards.contextMenu.toggleFoil'), icon: 'fire', active: card.foil },
      { id: 'toggle-public', label: t('cards.contextMenu.togglePublic'), icon: isPublic ? 'eye-open' : 'eye-closed', dividerAfter: true },
    )
  } else {
    // Deck: move board, commander
    const isSideboard = card.isWishlist ? false : (card as unknown as Record<string, unknown>).isInSideboard === true
    items.push({
      id: 'move-board',
      label: isSideboard ? t('decks.contextMenu.moveToMainboard') : t('decks.contextMenu.moveToSideboard'),
      icon: 'flip',
    })
    if (props.commanderNames) {
      const isCmd = isCommander(card)
      items.push({
        id: 'toggle-commander',
        label: isCmd ? t('decks.contextMenu.removeCommander') : t('decks.contextMenu.setCommander'),
        icon: 'star',
        active: isCmd,
      })
    }
    items[items.length - 1]!.dividerAfter = true
  }

  items.push(
    { id: 'edit', label: t('decks.contextMenu.edit'), icon: 'settings' },
    { id: 'remove', label: t('decks.contextMenu.removeFromDeck'), icon: 'trash', danger: true },
  )
  return items
})

const handleDeckContextMenuSelect = (itemId: string) => {
  const card = ctxCard.value
  if (!card) return
  const qty = getQuantity(card)
  if (itemId === 'plus') {
    emit('updateQuantity', card, qty + 1)
  } else if (itemId === 'minus') {
    if (qty <= 1) {
      emit('remove', card)
    } else {
      emit('updateQuantity', card, qty - 1)
    }
  } else if (itemId.startsWith('status-')) {
    emit('setStatus', card, itemId.replace('status-', ''))
  } else if (itemId === 'toggle-foil') {
    emit('toggleFoil', card)
  } else if (itemId === 'toggle-public') {
    emit('togglePublic', card)
  } else if (itemId === 'move-board') {
    emit('moveBoard', card)
  } else if (itemId === 'toggle-commander') {
    emit('toggleCommander', card)
  } else if (itemId === 'edit') {
    emit('edit', card)
  } else if (itemId === 'remove') {
    emit('remove', card)
  }
}

</script>

<template>
  <div class="flex flex-col md:flex-row gap-4 md:gap-6 relative">
    <!-- Left Panel: Card Preview (Sticky) - Hidden on mobile -->
    <div class="hidden md:block w-[110px] lg:w-[140px] xl:w-[180px] 2xl:w-[250px] flex-shrink-0 sticky top-[88px] self-start">
      <div v-if="previewCard" class="space-y-3">
        <!-- Card Image -->
        <div class="aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden">
          <img
            v-if="getCardImage(previewCard)"
            :src="getCardImage(previewCard)"
            :alt="previewCard.name"
            loading="lazy"
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
              <span class="text-silver-70">{{ t('decks.editorGrid.ck') }}</span>
              <span class="text-neon font-bold">{{ previewCKRetail != null ? formatPrice(previewCKRetail) : `$${previewCard.price?.toFixed(2) || 'N/A'}` }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-silver-70">{{ t('decks.editorGrid.tcg') }}</span>
              <span class="text-silver">${{ previewCard.price?.toFixed(2) || 'N/A' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-silver-70">{{ t('decks.editorGrid.bl') }}</span>
              <span class="text-silver">{{ previewCKBuylist != null ? formatPrice(previewCKBuylist) : '-' }}</span>
            </div>
            <div class="flex justify-between border-t border-silver-20 pt-1 mt-1">
              <span class="text-silver-70">{{ t('decks.editorGrid.total') }}</span>
              <span class="text-neon font-bold">{{ formatPrice((previewCKRetail ?? previewCard.price ?? 0) * getQuantity(previewCard)) }}</span>
            </div>
          </div>

          <!-- Commander indicator -->
          <div v-if="isCommander(previewCard)" class="bg-purple-400/10 border border-purple-400 p-2 text-tiny text-purple-400">
            {{ t('decks.editorGrid.categories.Commander') }}
          </div>

          <!-- Proxy indicator -->
          <div v-if="isProxy(previewCard)" class="bg-blue-400/10 border border-blue-400 p-2 text-tiny text-blue-400">
            {{ t('decks.editorGrid.proxyCard') }}
          </div>
          <!-- Wishlist indicator -->
          <div v-else-if="previewCard.isWishlist" class="bg-amber/10 border border-amber p-2 text-tiny text-amber">
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
      <div v-if="cards.length === 0" class="border border-silver-30 p-8 text-center space-y-4">
        <p class="text-body text-silver-70">{{ t('decks.editorGrid.emptyBoard') }}</p>
        <div
          class="inline-block cursor-pointer group"
          @click="emit('addCard')"
        >
          <div class="w-[100px] md:w-[130px] aspect-[3/4] border-2 border-dashed border-silver-30 hover:border-neon flex items-center justify-center transition-all duration-150 mx-auto">
            <span class="text-h1 font-light text-silver-30 group-hover:text-neon transition-colors">+</span>
          </div>
        </div>
      </div>

      <!-- ===== Binder Virtual Scroll (groupBy=none, 35k+ cards) ===== -->
      <div v-else-if="useBinderVirtualScroll" ref="binderContainerRef">
        <!-- Add card placeholder (top) -->
        <div class="mb-3">
          <div
            class="cursor-pointer group inline-block"
            @click="emit('addCard')"
          >
            <div
              class="w-20 md:w-[85px] lg:w-[105px] xl:w-[130px] 2xl:w-[182px] aspect-[3/4] border-2 border-dashed border-silver-30 hover:border-neon flex items-center justify-center transition-all duration-150"
            >
              <span class="text-h1 font-light text-silver-30 group-hover:text-neon transition-colors">+</span>
            </div>
          </div>
        </div>
        <div :style="{ height: `${binderTotalSize}px`, width: '100%', position: 'relative' }">
          <div
            v-for="vRow in binderVirtualRows"
            :key="vRow.index"
            :data-index="vRow.index"
            :ref="(el: any) => { if (el) binderVirtualizer.measureElement(el as HTMLElement) }"
            class="pb-3"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }"
          >
            <div class="grid grid-cols-3 sm:grid-cols-4 md:flex md:flex-wrap gap-1.5 md:gap-2">
              <div
                v-for="card in vRow.items"
                :key="card.scryfallId + (isWishlistCard(card) ? '-wish' : '')"
                class="relative cursor-pointer group"
                :class="{ 'opacity-75': isProxy(card), 'opacity-60': card.isWishlist && !isProxy(card) }"
                @mouseenter="handleMouseEnter(card)"
                @mouseleave="handleMouseLeave"
                @click="handleCardClick(card)"
                @contextmenu.prevent="handleContextMenu($event, card)"
              >
                <div
                  class="w-full md:w-[85px] lg:w-[105px] xl:w-[130px] 2xl:w-[182px] aspect-[3/4] bg-secondary border-2 overflow-hidden transition-all duration-150"
                  :class="[
                    isProxy(card) ? 'border-blue-400' : card.isWishlist ? 'border-amber' : isCommander(card) ? 'border-purple-400' : 'border-transparent',
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
                <div class="absolute bottom-0.5 left-0.5 md:bottom-1 md:left-1 bg-primary/90 border border-neon px-1 md:px-2 py-0.5 md:py-1">
                  <span class="text-tiny md:text-small font-bold text-neon">x{{ getQuantity(card) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Regular rendering (decks + grouped binder) ===== -->
      <template v-else>
        <div v-for="group in groupedCards" :key="group.type" class="space-y-2">
          <h3
            v-if="group.type !== 'all'"
            class="text-tiny font-bold uppercase"
            :class="group.type === 'Commander' ? 'text-purple-400' : 'text-silver-70'"
          >
            {{ translateCategoryLabel(group.type) }} ({{ getTypeCount(group.type) }})
          </h3>

          <div class="grid grid-cols-3 sm:grid-cols-4 md:flex md:flex-wrap items-start gap-1.5 md:gap-2">
            <div
              v-for="card in group.cards"
              :key="card.scryfallId + card.edition"
              class="relative cursor-pointer group w-full md:w-[85px] lg:w-[105px] xl:w-[130px] 2xl:w-[182px]"
              :class="{ 'opacity-75': isProxy(card) }"
              :style="{
                aspectRatio: !props.binderMode && getQuantity(card) > 1
                  ? `3 / ${4 + 0.6 * (getQuantity(card) - 1)}`
                  : '3 / 4'
              }"
              @mouseenter="handleMouseEnter(card)"
              @mouseleave="handleMouseLeave"
              @click="handleCardClick(card)"
              @contextmenu.prevent="handleContextMenu($event, card)"
            >
              <!-- Visual stack: lower layers (deeper offset) on top in z-order, first card at the back (SCRUM-37) -->
              <template v-if="!props.binderMode && getQuantity(card) > 1">
                <div
                  v-for="layerIdx in getQuantity(card) - 1"
                  :key="layerIdx"
                  class="absolute top-0 left-0 w-full aspect-[3/4] bg-secondary border-2 overflow-hidden"
                  :class="isCommander(card) ? 'border-purple-400' : isProxy(card) ? 'border-blue-400' : 'border-silver-20'"
                  :style="{
                    transform: `translateY(${layerIdx * 15}%)`,
                    zIndex: layerIdx + 1,
                  }"
                >
                  <img
                    v-if="getCardImageSmall(card)"
                    :src="getCardImageSmall(card)"
                    :alt="card.name"
                    loading="lazy"
                    class="w-full h-full object-cover"
                  />
                </div>
              </template>
              <!-- First (top, deepest in z-order) layer -->
              <div
                class="absolute top-0 left-0 w-full aspect-[3/4] bg-secondary border-2 overflow-hidden transition-all duration-150"
                :class="[
                  isProxy(card) ? 'border-blue-400' : isCommander(card) ? 'border-purple-400' : 'border-transparent',
                  'md:group-hover:border-neon md:group-hover:scale-105 md:group-hover:z-10'
                ]"
                :style="{ zIndex: 1 }"
              >
                <img
                  v-if="getCardImageSmall(card)"
                  :src="getCardImageSmall(card)"
                  :alt="card.name"
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
              </div>
              <!-- Quantity badge — anchored to wrapper bottom (over the lowest visible layer), kept above all layers -->
              <div
                class="absolute bottom-0.5 left-0.5 md:bottom-1 md:left-1 bg-primary/90 border border-neon px-1 md:px-2 py-0.5 md:py-1"
                :style="{ zIndex: getQuantity(card) + 10 }"
              >
                <span class="text-tiny md:text-small font-bold text-neon">x{{ getQuantity(card) }}</span>
              </div>
            </div>
          </div>
          <!-- Add card placeholder (outside grid to avoid layout gaps) -->
          <div class="mt-2 md:mt-3">
            <div
              class="inline-block cursor-pointer group"
              @click="emit('addCard')"
            >
              <div
                class="w-20 md:w-[85px] lg:w-[105px] xl:w-[130px] 2xl:w-[182px] aspect-[3/4] border-2 border-dashed border-silver-30 hover:border-neon flex items-center justify-center transition-all duration-150"
              >
                <span class="text-h1 font-light text-silver-30 group-hover:text-neon transition-colors">+</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      :show="ctxVisible"
      :x="ctxPosition.x"
      :y="ctxPosition.y"
      :items="deckContextMenuItems"
      @select="handleDeckContextMenuSelect"
      @close="ctxClose"
    />
  </div>
</template>

<style scoped>
.group-hover\:scale-105:hover {
  transform: scale(1.05);
}
</style>
