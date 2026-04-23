<script setup lang="ts">
import { computed, watch } from 'vue'
import type { CardStatus } from '../../types/card'
import type { FilterOptions } from '../../utils/scryfallQuery'
import type { ScryfallCard } from '../../services/scryfall'
import { useI18n } from '../../composables/useI18n'
import { useDiscoveryPanel } from '../../composables/useDiscoveryPanel'
import DiscoveryCard from './DiscoveryCard.vue'
import FilterPanel from '../search/FilterPanel.vue'

interface DisplayDeckCardLike {
  scryfallId?: string
  quantity: number
  isInSideboard?: boolean
}

const props = withDefaults(defineProps<{
  scope: 'decks' | 'binders' | 'collection'
  selectedDeckId?: string
  selectedBinderId?: string
  searchQuery?: string
  collectionCards?: { scryfallId: string; quantity: number; status?: string }[]
  deckCards?: DisplayDeckCardLike[]
  binderCards?: DisplayDeckCardLike[]
  versionTrigger?: { name: string; key: number } | null
  defaultCollectionStatus?: CardStatus
}>(), {
  versionTrigger: null,
  searchQuery: '',
  collectionCards: () => [],
  deckCards: () => [],
  binderCards: () => [],
  defaultCollectionStatus: 'collection',
})

const emit = defineEmits<{
  'card-added': [print: ScryfallCard, destination: string]
  'open-add-modal': [print: ScryfallCard]
  'add-to-mainboard': [print: ScryfallCard]
  'add-to-sideboard': [print: ScryfallCard]
  'add-to-binder': [print: ScryfallCard]
  'add-to-collection': [print: ScryfallCard, status: CardStatus]
}>()

const { t } = useI18n()

const panel = useDiscoveryPanel(props.scope)

const hasActiveDeck = computed(() => !!props.selectedDeckId)
const hasActiveBinder = computed(() => !!props.selectedBinderId)

const title = computed(() => {
  if (panel.mode.value === 'version') return t('discovery.panel.titleVersions')
  return t('discovery.panel.titleDiscover')
})

const subtitle = computed(() => {
  if (panel.mode.value === 'version' && panel.versionCardName.value) {
    return t('discovery.panel.subtitleVersions', { name: panel.versionCardName.value })
  }
  if (panel.mode.value === 'discovery') return t('discovery.panel.subtitleDiscover')
  return ''
})

// Version mode trigger — when a Scryfall suggestion is picked in CardFilterBar
watch(() => props.versionTrigger, (trigger) => {
  if (trigger?.name) void panel.openVersionMode(trigger.name)
}, { deep: true, immediate: true })

// Embedded FilterPanel drives discovery via @search event
const onDiscoverySearch = (filters: FilterOptions): void => {
  void panel.openDiscoveryMode(filters)
}

const onDiscoveryClear = (): void => {
  // Clear results without hiding the panel (panel stays in 'discovery' mode).
  void panel.openDiscoveryMode({})
}

const ownedCountMap = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const c of props.collectionCards) {
    map[c.scryfallId] = (map[c.scryfallId] ?? 0) + (c.quantity ?? 0)
  }
  return map
})

const wishlistedSet = computed<Set<string>>(() => {
  const set = new Set<string>()
  for (const c of props.collectionCards) {
    if (c.status === 'wishlist') set.add(c.scryfallId)
  }
  return set
})

function inMainboardCount(scryfallId: string): number {
  let n = 0
  for (const d of props.deckCards) {
    if (d.scryfallId === scryfallId && !d.isInSideboard) n += d.quantity ?? 0
  }
  return n
}

function inSideboardCount(scryfallId: string): number {
  let n = 0
  for (const d of props.deckCards) {
    if (d.scryfallId === scryfallId && d.isInSideboard) n += d.quantity ?? 0
  }
  return n
}

function inBinderCount(scryfallId: string): number {
  let n = 0
  for (const b of props.binderCards) {
    if (b.scryfallId === scryfallId) n += b.quantity ?? 0
  }
  return n
}

const onToggleCollapsed = (): void => { panel.toggleCollapsed(); }
const onLoadMore = (): void => { void panel.loadMore() }

const onAddMb = (print: ScryfallCard): void => { emit('add-to-mainboard', print); }
const onAddSb = (print: ScryfallCard): void => { emit('add-to-sideboard', print); }
const onAddBinder = (print: ScryfallCard): void => { emit('add-to-binder', print); }
const onAddCollection = (print: ScryfallCard, status: CardStatus): void => { emit('add-to-collection', print, status); }
const onOpenAddModal = (print: ScryfallCard): void => { emit('open-add-modal', print); }

defineExpose({
  openVersionMode: panel.openVersionMode,
  openDiscoveryMode: panel.openDiscoveryMode,
  close: panel.close,
  mode: panel.mode,
})
</script>

<template>
  <section
    class="discovery-panel border-2 border-neon/40 bg-secondary/40 rounded mb-3"
    :aria-label="title"
    data-testid="discovery-panel"
  >
    <header class="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-neon/20">
      <div class="flex items-baseline gap-2 min-w-0 flex-1">
        <h3 class="text-small font-bold text-neon whitespace-nowrap">{{ title }}</h3>
        <p class="text-tiny text-silver/70 truncate" v-if="subtitle">{{ subtitle }}</p>
        <span
          v-if="panel.results.value.length > 0"
          class="text-tiny text-silver/60 ml-auto shrink-0"
          data-testid="counter"
        >· {{ panel.results.value.length }}</span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="text-silver/70 hover:text-neon text-small min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-1.5 flex items-center justify-center"
          :aria-label="panel.collapsed.value ? t('discovery.panel.expand') : t('discovery.panel.collapse')"
          @click="onToggleCollapsed"
          data-testid="toggle-collapse"
        >
{{ panel.collapsed.value ? '▾' : '▴' }}
</button>
      </div>
    </header>

    <div
      v-if="!panel.collapsed.value"
      class="overflow-y-auto max-h-[70vh] md:max-h-[480px] p-2"
      data-testid="body"
    >
      <!-- Embedded FilterPanel — only in discovery mode (hidden while viewing a specific card's prints) -->
      <FilterPanel
        v-if="panel.mode.value !== 'version'"
        :auto-search="false"
        :sync-with-router="false"
        :hide-name-input="true"
        :external-name="searchQuery"
        @search="onDiscoverySearch"
        @clear="onDiscoveryClear"
        class="mb-2"
      />

      <div v-if="panel.loading.value && panel.results.value.length === 0" class="text-silver/70 text-small py-4 text-center" data-testid="loading">
        {{ t('discovery.panel.loading') }}
      </div>

      <div v-else-if="panel.error.value" class="text-rust text-small py-4 text-center" data-testid="error">
        {{ t('discovery.panel.error') }}
      </div>

      <div v-else-if="panel.results.value.length === 0" class="text-silver/60 text-small py-4 text-center" data-testid="empty">
        {{ panel.mode.value === 'version' ? t('discovery.panel.noResults') : t('discovery.panel.noFiltersResults') }}
      </div>

      <div v-else>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
          <DiscoveryCard
            v-for="print in panel.results.value"
            :key="print.id"
            :print="print"
            :scope="scope"
            :owned-count="ownedCountMap[print.id] ?? 0"
            :in-deck-mainboard-count="inMainboardCount(print.id)"
            :in-deck-sideboard-count="inSideboardCount(print.id)"
            :in-binder-count="inBinderCount(print.id)"
            :is-wishlisted-somewhere="wishlistedSet.has(print.id)"
            :default-collection-status="defaultCollectionStatus"
            :has-active-deck="hasActiveDeck"
            :has-active-binder="hasActiveBinder"
            @add-to-mainboard="onAddMb"
            @add-to-sideboard="onAddSb"
            @add-to-binder="onAddBinder"
            @add-to-collection="onAddCollection"
            @open-add-modal="onOpenAddModal"
          />
        </div>

        <div v-if="panel.hasMore.value" class="flex justify-center pt-3">
          <button
            type="button"
            class="text-tiny font-bold px-3 py-1 rounded border border-neon text-neon hover:bg-neon hover:text-primary disabled:opacity-40 transition"
            :disabled="panel.loading.value"
            @click="onLoadMore"
            data-testid="load-more"
          >
{{ panel.loading.value ? t('discovery.panel.loading') : t('discovery.panel.loadMore') }}
</button>
        </div>
      </div>
    </div>
  </section>
</template>
