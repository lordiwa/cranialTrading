<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import IconV2 from '../ui/IconV2.vue'
import { useCollectionStore } from '../../stores/collection'
import { useToastStore } from '../../stores/toast'
import { useAuthStore } from '../../stores/auth'
import { usePreferencesStore } from '../../stores/preferences'
import { useDecksStore } from '../../stores/decks'
import { useBindersStore } from '../../stores/binders'
import { RouterLink } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { getCardSuggestions, type ScryfallCard, searchCards } from '../../services/scryfall'
import { useCardPrices } from '../../composables/useCardPrices'
import { findCardWithSamePrint } from '../../utils/cardIdentity'
import type { CardCondition, CardStatus } from '../../types/card'

interface Props {
  show: boolean
  scryfallCard?: ScryfallCard
  selectedDeckId?: string
  selectedBinderId?: string
  defaultStatus?: CardStatus
  defaultFoil?: boolean
  initialSearchQuery?: string
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'added'])

const { t } = useI18n()

// Search state (when no card pre-selected)
const searchQuery = ref('')
const searchResults = ref<ScryfallCard[]>([])
const searching = ref(false)
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
const suggestLoading = ref(false)
const suppressSuggestions = ref(false)
const searchContainer = ref<HTMLElement | null>(null)

const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const authStore = useAuthStore()
const preferencesStore = usePreferencesStore()
const decksStore = useDecksStore()
const bindersStore = useBindersStore()

const loading = ref(false)

// Prints disponibles
const availablePrints = ref<ScryfallCard[]>([])
const selectedPrint = ref<ScryfallCard | null>(null)
const loadingPrints = ref(false)

// Cargar todos los prints cuando cambia la carta
watch(() => props.scryfallCard, async (card: ScryfallCard | undefined) => {
  if (card) {
    selectedPrint.value = card
    loadingPrints.value = true
    try {
      // Cargar prints y mazos en paralelo
      const [results] = await Promise.all([
        searchCards(`!"${card.name}" -is:preview`),
        decksStore.loadDecks()
      ])
      availablePrints.value = results
    } catch {
      availablePrints.value = [card]
    } finally {
      loadingPrints.value = false
    }
  } else {
    availablePrints.value = []
    selectedPrint.value = null
  }
}, { immediate: true })

// Pre-seleccionar deck cuando se abre el modal
watch(() => props.show, (isVisible) => {
  if (isVisible && props.selectedDeckId) {
    form.deckName = props.selectedDeckId
  }
}, { immediate: true })

// Cambiar el print seleccionado
const handlePrintChange = (scryfallId: string) => {
  const newPrint = availablePrints.value.find(p => p.id === scryfallId)
  if (newPrint) {
    selectedPrint.value = newPrint
  }
}

// Card Kingdom prices
const {
  loading: loadingCKPrices,
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => selectedPrint.value?.id,
  () => selectedPrint.value?.set
)

// Fetch CK prices when print changes
watch(selectedPrint, (print: ScryfallCard | null) => {
  if (print?.id && print?.set) {
    void fetchCKPrices()
  }
})

const form = reactive<{
  quantity: number
  condition: CardCondition
  foil: boolean
  status: CardStatus
  deckName: string
  // SCRUM-34: explicit mainboard/sideboard selector when a deck is chosen.
  // Previously the modal silently allocated to mainboard, which surprised QA.
  isInSideboard: boolean
  public: boolean
}>({
  quantity: 1,
  condition: 'NM',
  foil: props.defaultFoil ?? false,
  status: props.defaultStatus ?? 'collection',
  deckName: '',
  isInSideboard: false,
  public: true,
})

watch(() => props.show, (isOpen) => {
  if (isOpen) {
    if (props.defaultStatus !== undefined) form.status = props.defaultStatus
    if (props.defaultFoil !== undefined) form.foil = props.defaultFoil
  }
})

// ✅ NUEVO: Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref(0)
const showZoom = ref(false)

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

// ✅ NUEVO: Función para obtener imagen correcta de split cards
const getCardImage = (card: ScryfallCard): string => {
  if (card.card_faces && card.card_faces.length > 0) {
    return card.card_faces[0]?.image_uris?.normal ?? ''
  }
  return card.image_uris?.normal ?? ''
}

// ✅ NUEVO: Verificar si es split card
const isSplitCard = computed(() => {
  return selectedPrint.value?.card_faces && selectedPrint.value.card_faces.length > 1
})

// ✅ NUEVO: Obtener imagen actual según el lado
const currentCardImage = computed(() => {
  if (!selectedPrint.value) return ''
  const face = selectedPrint.value.card_faces?.[cardFaceIndex.value]
  if (face) {
    return face.image_uris?.normal ?? ''
  }
  return getCardImage(selectedPrint.value)
})

// Large image for zoom view
const zoomImage = computed(() => {
  if (!selectedPrint.value) return ''
  const face = selectedPrint.value.card_faces?.[cardFaceIndex.value]
  if (face) {
    return face.image_uris?.large ?? face.image_uris?.normal ?? ''
  }
  return selectedPrint.value.image_uris?.large ?? selectedPrint.value.image_uris?.normal ?? ''
})

// ✅ NUEVO: Obtener nombre del lado actual
const currentCardName = computed(() => {
  if (!selectedPrint.value) return ''
  const face = selectedPrint.value.card_faces?.[cardFaceIndex.value]
  if (face) {
    return face.name
  }
  return selectedPrint.value.name
})

// ✅ NUEVO: Toggle entre lados
const toggleCardFace = () => {
  if (isSplitCard.value) {
    cardFaceIndex.value = cardFaceIndex.value === 0 ? 1 : 0
  }
}

const statusOptions = computed(() => [
  { value: 'collection', label: t('cards.addModal.statusOptions.collection') },
  { value: 'sale', label: t('cards.addModal.statusOptions.sale') },
  { value: 'trade', label: t('cards.addModal.statusOptions.trade') },
  { value: 'wishlist', label: t('cards.addModal.statusOptions.wishlist') },
])

// v2 redesign — status dot-badge tint classes (design→app v2 F5a, DESIGN-DIRECTION.md §5).
// Same badge variant vocabulary as MatchDetailModal's badgeClasses(): collection=neutral
// surface, sale=rust, trade=info, wishlist=gold.
const STATUS_BADGE_CLASSES: Record<CardStatus, string> = {
  collection: 'bg-surface-3 text-silver-70',
  sale: 'bg-rust-10 text-[#C4553F]',
  trade: 'bg-[rgba(96,165,250,.12)] text-[#60A5FA]',
  wishlist: 'bg-[rgba(212,168,67,.12)] text-gold',
}
const statusBadgeClass = (status: CardStatus): string => STATUS_BADGE_CLASSES[status]

// Show public checkbox only for sale/trade
// Public option available for all statuses (default: true)
const showPublicOption = computed(() => true)

const deckOptions = computed(() => [
  { value: '', label: 'Sin asignar' },
  ...decksStore.decks.map(deck => ({ value: deck.id, label: deck.name }))
])

const handleAddCard = async () => {
  if (!selectedPrint.value || !authStore.user) return

  loading.value = true
  try {
    // ✅ CORREGIDO: Guardar el nombre del lado actual (para split cards)
    const cardName = isSplitCard.value
        ? (selectedPrint.value.card_faces?.[cardFaceIndex.value]?.name ?? selectedPrint.value.name)
        : selectedPrint.value.name

    const imageToSave = currentCardImage.value ?? ''

    // Defensive coercion: v-model.number leaves form.quantity as '' when the user
    // clears the stepper's number input, and the stepper's own +/- handlers relied
    // on `+`/`-` operators that silently string-concatenate on a non-numeric value
    // (e.g. '' + 1 → '1', then '1' + 1 → '11'). Compute one safe integer here and
    // use it everywhere the submit path touches quantity, instead of raw form.quantity.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- v-model.number can yield '' at runtime; the `number` type is a compile-time lie
    const safeQuantity = Math.max(1, Number(form.quantity) || 0)

    // SCRUM-35 bug #1: if user already has the SAME print (scryfallId+edition+condition+foil+status),
    // increment that row's quantity instead of creating a duplicate. Without this, repeated AddCardModal
    // adds left dupes that the deck grid rendered as separate xN entries instead of a single x(N+1).
    const existing = findCardWithSamePrint(collectionStore.cards, {
      scryfallId: selectedPrint.value.id,
      edition: selectedPrint.value.set_name,
      condition: form.condition,
      foil: form.foil,
      status: form.status,
    })

    let cardId: string | null
    if (existing) {
      const ok = await collectionStore.updateCard(existing.id, { quantity: existing.quantity + safeQuantity })
      cardId = ok ? existing.id : null
    } else {
      cardId = await collectionStore.addCard({
        scryfallId: selectedPrint.value.id,
        name: cardName,
        edition: selectedPrint.value.set_name,
        setCode: selectedPrint.value.set,
        quantity: safeQuantity,
        condition: form.condition,
        foil: form.foil,
        status: form.status,
        price: cardKingdomRetail.value ?? Number.parseFloat(selectedPrint.value.prices?.usd ?? '0'),
        image: imageToSave,
        public: form.public,
        cmc: selectedPrint.value.cmc,
        type_line: selectedPrint.value.type_line,
        colors: selectedPrint.value.colors ?? [],
        rarity: selectedPrint.value.rarity,
        power: selectedPrint.value.power,
        toughness: selectedPrint.value.toughness,
        oracle_text: selectedPrint.value.oracle_text,
        keywords: selectedPrint.value.keywords ?? [],
        legalities: selectedPrint.value.legalities,
        full_art: selectedPrint.value.full_art ?? false,
      })
    }

    // Si se seleccionó un deck, asignar la carta al deck (SCRUM-34: respect MB/SB choice)
    if (cardId && form.deckName) {
      await decksStore.allocateCardToDeck(
        form.deckName,  // deckId
        cardId,
        safeQuantity,
        form.isInSideboard
      )
    }

    // Si estamos en una carpeta, asignar la carta a la carpeta
    if (cardId && props.selectedBinderId) {
      await bindersStore.allocateCardToBinder(
        props.selectedBinderId,
        cardId,
        safeQuantity
      )
    }

    // Si es wishlist, crear preferencia BUSCO automáticamente
    if (form.status === 'wishlist' && selectedPrint.value) {
      await preferencesStore.addPreference({
        scryfallId: selectedPrint.value.id,
        name: cardName,
        type: 'BUSCO',
        quantity: safeQuantity,
        condition: form.condition,
        edition: selectedPrint.value.set_name,
        image: imageToSave,
      })
    }

    if (!cardId) {
      // addCard handled the error internally — don't show a second toast
      return
    }

    toastStore.show(t('cards.addModal.success', { name: selectedPrint.value.name }), 'success')
    emit('added')
    handleClose()
  } catch (err) {
    console.error('Error agregando carta:', err)
    toastStore.show(t('collection.messages.addError'), 'error')
  } finally {
    loading.value = false
  }
}

// Search functions for when no card is pre-selected
const handleSearchInput = async () => {
  suppressSuggestions.value = false
  const query = searchQuery.value.trim()
  if (query.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }

  suggestLoading.value = true
  try {
    const results = await getCardSuggestions(query)
    suggestions.value = results.slice(0, 8)
    showSuggestions.value = !suppressSuggestions.value && suggestions.value.length > 0
  } catch {
    suggestions.value = []
  } finally {
    suggestLoading.value = false
  }
}

const selectSuggestion = async (cardName: string) => {
  searchQuery.value = cardName
  suppressSuggestions.value = true
  showSuggestions.value = false
  await performSearch()
}

const performSearch = async () => {
  const query = searchQuery.value.trim()
  if (!query) return

  searching.value = true
  suppressSuggestions.value = true
  showSuggestions.value = false
  try {
    const results = await searchCards(`!"${query}" -is:preview`)
    searchResults.value = results.slice(0, 12)
  } catch {
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

const selectSearchResult = (card: ScryfallCard) => {
  selectedPrint.value = card
  searchResults.value = []
  searchQuery.value = ''
}

// SCRUM-66: when opened from the CollectionView searcher dropdown with a chosen card
// name, pre-fill the search input and auto-run the printings query so the user lands
// directly on the print picker instead of an empty modal.
watch(() => props.show, async (isOpen) => {
  if (!isOpen) return
  if (props.scryfallCard) return
  const initial = props.initialSearchQuery?.trim()
  if (!initial) return
  searchQuery.value = initial
  await performSearch()
})

const handleClickOutside = (e: MouseEvent) => {
  if (searchContainer.value && !searchContainer.value.contains(e.target as Node)) {
    showSuggestions.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const handleClose = () => {
  form.quantity = 1
  form.condition = 'NM'
  form.foil = props.defaultFoil ?? false
  form.status = props.defaultStatus ?? 'collection'
  form.deckName = ''
  form.isInSideboard = false
  form.public = true
  cardFaceIndex.value = 0
  showZoom.value = false
  availablePrints.value = []
  selectedPrint.value = null
  // Reset search state
  searchQuery.value = ''
  searchResults.value = []
  suggestions.value = []
  showSuggestions.value = false
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" @close="handleClose" :close-on-click-outside="false">
    <div class="space-y-4">
      <!-- Título -->
      <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('cards.addModal.title') }}</h2>

      <!-- Search Section (when no card pre-selected) -->
      <div v-if="!selectedPrint" class="space-y-4">
        <!-- Search Input -->
        <div ref="searchContainer" class="relative">
          <label class="flex items-center gap-2.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md transition-all duration-200 ease-v2 focus-within:border-neon focus-within:shadow-glow-neon">
            <IconV2 name="search" :size="18" class="text-silver-30 flex-shrink-0" />
            <input
                v-model="searchQuery"
                type="text"
                :placeholder="t('cards.addModal.searchPlaceholder')"
                class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver placeholder:text-silver-30 text-small"
                @input="handleSearchInput"
                @keyup.enter="performSearch"
            />
          </label>
          <!-- Auto-suggest dropdown -->
          <div
              v-if="showSuggestions && suggestions.length > 0"
              class="absolute top-full left-0 right-0 bg-[#0d0d0f] border border-line-strong mt-1 max-h-48 overflow-y-auto z-20 rounded-md shadow-strong"
          >
            <div
                v-for="suggestion in suggestions"
                :key="suggestion"
                @mousedown.prevent="selectSuggestion(suggestion)"
                class="px-4 py-2.5 hover:bg-surface-2 cursor-pointer text-small text-silver border-b border-line last:border-b-0 transition-colors"
            >
              {{ suggestion }}
            </div>
          </div>
        </div>

        <!-- Search Button + Advanced Search -->
        <div class="flex items-center gap-2">
          <BaseButton
              variant="secondary"
              size="small"
              @click="performSearch"
              :disabled="searching || !searchQuery.trim()"
              class="flex-1 uppercase tracking-[.1em] !text-[12px]"
          >
            {{ searching ? t('common.actions.searching') : t('common.actions.search') }}
          </BaseButton>
          <RouterLink
              :to="'/search'"
              @click="handleClose()"
              class="text-tiny text-silver-50 hover:text-neon transition-colors whitespace-nowrap"
          >
            {{ t('common.actions.advancedSearch') }} →
          </RouterLink>
        </div>

        <!-- Search Results Grid -->
        <div v-if="searchResults.length > 0" class="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
          <button
              v-for="card in searchResults"
              :key="card.id"
              @click="selectSearchResult(card)"
              class="relative group cursor-pointer rounded-md overflow-hidden border border-line hover:border-neon transition-colors"
          >
            <img
                :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                :alt="card.name"
                loading="lazy"
                class="w-full aspect-[2/3] object-cover"
            />
            <div class="absolute bottom-0 left-0 right-0 bg-black/55 px-1.5 py-1">
              <p class="text-tiny text-silver-70 truncate">{{ card.name }}</p>
            </div>
          </button>
        </div>

        <!-- No Results Message -->
        <p v-if="searchResults.length === 0 && searchQuery && !searching" class="text-center text-silver-50 text-small">
          {{ t('cards.addModal.noResults') }}
        </p>
      </div>

      <!-- Datos de la carta (when card is selected) -->
      <div v-else class="bg-surface-1 border border-line p-4 space-y-4 rounded-lg">
        <!-- Imagen y Formulario - responsive: columna en móvil, fila en desktop -->
        <div class="flex flex-col md:flex-row gap-4 md:gap-6">
          <!-- IZQUIERDA: Imagen -->
          <div class="flex flex-col items-center gap-4 flex-shrink-0">
            <!-- Imagen con botón toggle encima para split cards (clickable for zoom) -->
            <div class="relative w-full max-w-[200px] md:max-w-[256px]">
              <button
                  v-if="currentCardImage"
                  @click="showZoom = true"
                  class="relative group cursor-zoom-in focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-lg w-full"
              >
                <img
                    :src="currentCardImage"
                    :alt="currentCardName"
                    loading="lazy"
                    class="w-full aspect-[2/3] object-cover border border-line rounded-lg group-hover:border-neon transition-colors"
                />
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 rounded-lg">
                  <IconV2 name="eye" :size="16" class="text-silver" />
                  <span class="text-tiny text-silver font-bold">{{ t('cards.addModal.zoomHint') }}</span>
                </div>
              </button>
              <div v-else class="w-full aspect-[2/3] bg-surface-2 border border-line flex items-center justify-center rounded-lg">
                <span class="text-silver-50">{{ t('cards.detailModal.noImage') }}</span>
              </div>

              <!-- ✅ Botón toggle flotante en esquina (SOLO para split cards) -->
              <button
                  v-if="isSplitCard"
                  @click.stop="toggleCardFace"
                  class="absolute top-2 right-2 bg-black/80 border border-neon p-2 hover:bg-neon-10 transition-all rounded-md z-10"
                  :title="`Ver lado ${cardFaceIndex === 0 ? 2 : 1}`"
                  :aria-label="t('common.aria.flipCard')"
              >
                <IconV2 name="swap" :size="18" class="text-neon" />
              </button>
            </div>

            <!-- Info bajo la imagen -->
            <div class="text-center w-full">
              <p class="font-display font-bold text-silver">{{ currentCardName }}</p>
              <p v-if="isSplitCard" class="text-xs text-neon mt-1">
                {{ t('cards.addModal.splitCardSide', { current: cardFaceIndex + 1, total: selectedPrint?.card_faces?.length ?? 0 }) }}
              </p>

              <!-- Prices Section -->
              <div class="mt-3 space-y-1">
                <!-- Card Kingdom Price (primary) -->
                <div class="flex justify-between items-center text-sm">
                  <span class="text-silver-50">CK:</span>
                  <span v-if="hasCardKingdomPrices" class="font-display font-tnum text-neon font-bold">{{ formatPrice(cardKingdomRetail) }}</span>
                  <span v-else-if="loadingCKPrices" class="text-silver-50">...</span>
                  <span v-else class="text-silver-50">-</span>
                </div>
                <!-- TCGPlayer Price -->
                <div class="flex justify-between items-center text-sm">
                  <span class="text-silver-50">TCG:</span>
                  <span class="font-display font-tnum text-silver-50">${{ selectedPrint?.prices?.usd ?? 'N/A' }}</span>
                </div>
                <!-- Buylist -->
                <div class="flex justify-between items-center text-sm">
                  <span class="text-silver-50">BL:</span>
                  <span v-if="cardKingdomBuylist" class="font-display font-tnum text-silver font-bold">{{ formatPrice(cardKingdomBuylist) }}</span>
                  <span v-else class="text-silver-50">-</span>
                </div>
              </div>

              <!-- Print Selector -->
              <div v-if="availablePrints.length > 1" class="mt-3">
                <label for="print-select" class="text-xs text-silver-70 font-semibold block mb-1.5">{{ t('cards.addModal.editionLabel') }}</label>
                <div class="relative">
                  <select
                      id="print-select"
                      :value="selectedPrint?.id"
                      @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                      class="w-full appearance-none px-3 py-2 pr-8 bg-surface-1 border border-line text-silver text-xs rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
                  >
                    <option
                        v-for="print in availablePrints"
                        :key="print.id"
                        :value="print.id"
                    >
                      {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd ?? 'N/A' }}
                    </option>
                  </select>
                  <IconV2 name="chev-d" :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
                </div>
                <p class="text-xs text-silver-30 mt-1">{{ t('cards.addModal.printsAvailable', { count: availablePrints.length }) }}</p>
              </div>
              <p v-else-if="loadingPrints" class="text-xs text-silver-50 mt-2">{{ t('cards.editModal.loadingPrints') }}</p>
              <p v-else class="text-xs text-silver-70 mt-2">{{ selectedPrint?.set_name }}</p>
            </div>
          </div>

          <!-- DERECHA: Formulario -->
          <div class="flex-1 space-y-4">
            <!-- Cantidad -->
            <div>
              <label id="qty-lbl" for="quantity" class="text-small font-semibold text-silver-70">{{ t('cards.addModal.quantityLabel') }}</label>
              <div class="inline-flex items-stretch mt-1.5 bg-surface-1 border border-line rounded-md overflow-hidden" role="group" aria-labelledby="qty-lbl">
                <button
                    type="button"
                    class="w-[46px] h-[46px] flex items-center justify-center text-silver-50 hover:text-neon transition-colors"
                    :aria-label="t('cards.addModal.decreaseQty')"
                    @click="form.quantity = Math.max(1, (Number(form.quantity) || 0) - 1)"
                >
                  <IconV2 name="minus" :size="16" />
                </button>
                <input
                    id="quantity"
                    v-model.number="form.quantity"
                    type="number"
                    min="1"
                    class="no-spinner w-[56px] text-center bg-transparent border-x border-line font-display font-tnum text-[18px] font-semibold text-silver focus:outline-none"
                />
                <button
                    type="button"
                    class="w-[46px] h-[46px] flex items-center justify-center text-silver-50 hover:text-neon transition-colors"
                    :aria-label="t('cards.addModal.increaseQty')"
                    @click="form.quantity = (Number(form.quantity) || 0) + 1"
                >
                  <IconV2 name="plus" :size="16" />
                </button>
              </div>
            </div>

            <!-- Condición -->
            <div>
              <label class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('cards.addModal.conditionLabel') }}</label>
              <div class="flex flex-wrap gap-2" role="group" :aria-label="t('cards.addModal.conditionLabel')">
                <button
                    v-for="opt in conditionOptions"
                    :key="opt.value"
                    type="button"
                    class="min-h-[38px] px-3.5 rounded-full text-tiny font-bold border transition-all duration-200 ease-v2"
                    :class="form.condition === opt.value
                      ? 'text-neon bg-neon-10 border-neon-40'
                      : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'"
                    :aria-pressed="form.condition === opt.value"
                    @click="form.condition = (opt.value as CardCondition)"
                >
                  {{ opt.value }}
                </button>
              </div>
            </div>

            <!-- Foil -->
            <button
                type="button"
                role="switch"
                :aria-checked="form.foil"
                class="w-full flex items-center justify-between gap-3.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md"
                @click="form.foil = !form.foil"
            >
              <span class="text-[14px] font-semibold text-silver">{{ t('cards.addModal.foilLabel') }}</span>
              <span
                  class="relative w-[44px] h-[26px] rounded-full border flex-shrink-0 transition-colors duration-200 ease-v2"
                  :class="form.foil ? 'bg-neon border-neon' : 'bg-surface-3 border-line'"
              >
                <span
                    class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2"
                    :class="form.foil ? 'right-0.5' : 'left-0.5'"
                ></span>
              </span>
            </button>

            <!-- Estado -->
            <div>
              <label class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('cards.addModal.statusLabel') }}</label>
              <div class="flex flex-wrap gap-2" role="group" :aria-label="t('cards.addModal.statusLabel')">
                <button
                    v-for="opt in statusOptions"
                    :key="opt.value"
                    type="button"
                    class="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all duration-200 ease-v2"
                    :class="[statusBadgeClass(opt.value as CardStatus), form.status === opt.value ? 'opacity-100 shadow-[inset_0_0_0_1.5px_currentColor]' : 'opacity-55 hover:opacity-80']"
                    :aria-pressed="form.status === opt.value"
                    @click="form.status = (opt.value as CardStatus)"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Publicar en perfil -->
            <button
                v-if="showPublicOption"
                type="button"
                role="switch"
                :aria-checked="form.public"
                class="w-full flex items-center justify-between gap-3.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md text-left"
                @click="form.public = !form.public"
            >
              <span>
                <span class="block text-[14px] font-semibold text-silver">{{ t('cards.addModal.publishLabel') }}</span>
                <span class="block text-xs text-silver-50 font-normal">{{ t('cards.addModal.publishHint', { username: authStore.user?.username ?? '' }) }}</span>
              </span>
              <span
                  class="relative w-[44px] h-[26px] rounded-full border flex-shrink-0 transition-colors duration-200 ease-v2"
                  :class="form.public ? 'bg-neon border-neon' : 'bg-surface-3 border-line'"
              >
                <span
                    class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2"
                    :class="form.public ? 'right-0.5' : 'left-0.5'"
                ></span>
              </span>
            </button>

            <!-- Deck (opcional) -->
            <div>
              <label for="deck" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('cards.addModal.assignDeck') }}</label>
              <div class="relative">
                <select
                    id="deck"
                    v-model="form.deckName"
                    class="w-full appearance-none px-3.5 py-2.5 pr-8 bg-surface-1 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
                >
                  <option v-for="opt in deckOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <IconV2 name="chev-d" :size="14" class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
              </div>
            </div>

            <!-- Board (MB/SB) — SCRUM-34: only when a deck is selected -->
            <div v-if="form.deckName">
              <span class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('cards.addModal.boardLabel') }}</span>
              <div class="flex gap-3" role="radiogroup" :aria-label="t('cards.addModal.boardLabel')">
                <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
                  <input
                      type="radio"
                      name="board"
                      :value="false"
                      v-model="form.isInSideboard"
                      class="w-4 h-4 cursor-pointer"
                  />
                  <span class="text-sm text-silver">{{ t('cards.addModal.boardMainboard') }}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
                  <input
                      type="radio"
                      name="board"
                      :value="true"
                      v-model="form.isInSideboard"
                      class="w-4 h-4 cursor-pointer"
                  />
                  <span class="text-sm text-silver">{{ t('cards.addModal.boardSideboard') }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Botones -->
      <div class="flex gap-2 justify-end pt-4 border-t border-line">
        <BaseButton variant="secondary" class="uppercase tracking-[.1em] !text-[12px]" @click="handleClose">
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton variant="filled" class="uppercase tracking-[.1em] !text-[12px] gap-2" @click="handleAddCard" :disabled="loading">
          <IconV2 v-if="!loading" name="plus" :size="16" />
          {{ loading ? t('cards.addModal.submitting') : t('cards.addModal.submit') }}
        </BaseButton>
      </div>
    </div>

    <!-- Zoom Overlay -->
    <Teleport to="body">
      <div
          v-if="showZoom"
          class="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out p-4"
          @click="showZoom = false"
      >
        <img
            :src="zoomImage"
            :alt="currentCardName"
            loading="lazy"
            class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            @click.stop
        />
        <button
            @click="showZoom = false"
            class="absolute top-4 right-4 text-silver hover:text-neon transition-colors p-2"
            :aria-label="t('common.aria.closeModal')"
        >
          <IconV2 name="x" :size="28" />
        </button>
        <p class="absolute bottom-4 left-1/2 -translate-x-1/2 text-silver-70 text-small">
          Click para cerrar
        </p>
      </div>
    </Teleport>
  </BaseModal>
</template>