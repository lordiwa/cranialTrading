<script setup lang="ts">
import { computed, watch } from 'vue'
import type { CardStatus } from '../../types/card'
import type { FilterOptions } from '../../utils/scryfallQuery'
import type { ScryfallCard } from '../../services/scryfall'
import { useI18n } from '../../composables/useI18n'
import { useDiscoveryPanel } from '../../composables/useDiscoveryPanel'
import DiscoveryCard from './DiscoveryCard.vue'

interface DisplayDeckCardLike {
  scryfallId?: string
  quantity: number
  isInSideboard?: boolean
}

const props = withDefaults(defineProps<{
  scope: 'decks' | 'binders' | 'collection'
  selectedDeckId?: string
  selectedBinderId?: string
  filters: FilterOptions
  collectionCards?: { scryfallId: string; quantity: number; status?: string }[]
  deckCards?: DisplayDeckCardLike[]
  binderCards?: DisplayDeckCardLike[]
  autoDiscoveryThreshold?: number
  versionTrigger?: { name: string; key: number } | null
  discoverTrigger?: number
  defaultCollectionStatus?: CardStatus
}>(), {
  autoDiscoveryThreshold: 12,
  versionTrigger: null,
  discoverTrigger: 0,
  collectionCards: () => [],
  deckCards: () => [],
  binderCards: () => [],
  defaultCollectionStatus: 'collection',
})

const emit = defineEmits<{
  'card-added': [print: ScryfallCard, destination: string]
  'open-add-modal': [print: ScryfallCard]
  'request-close': []
  'add-to-mainboard': [print: ScryfallCard]
  'add-to-sideboard': [print: ScryfallCard]
  'add-to-binder': [print: ScryfallCard]
  'add-to-collection': [print: ScryfallCard, status: CardStatus]
}>()

const { t } = useI18n()

const panel = useDiscoveryPanel(props.scope)

const hasActiveDeck = computed(() => !!props.selectedDeckId)
const hasActiveBinder = computed(() => !!props.selectedBinderId)

const isOpen = computed(() => panel.mode.value !== 'idle')

const title = computed(() => {
  if (panel.mode.value === 'version') return t('discovery.panel.titleVersions')
  if (panel.mode.value === 'discovery') return t('discovery.panel.titleDiscover')
  return ''
})

const subtitle = computed(() => {
  if (panel.mode.value === 'version' && panel.versionCardName.value) {
    return t('discovery.panel.subtitleVersions', { name: panel.versionCardName.value })
  }
  if (panel.mode.value === 'discovery') return t('discovery.panel.subtitleDiscover')
  return ''
})

// Watchers for external triggers
watch(() => props.versionTrigger, (trigger) => {
  if (trigger?.name) void panel.openVersionMode(trigger.name)
}, { deep: true, immediate: true })

watch(() => props.discoverTrigger, (v, prev) => {
  if (v && v !== prev) void panel.openDiscoveryMode(props.filters)
})

// Auto-discovery when filters change + fewer local matches than threshold
watch(() => props.filters, (f) => {
  const localMatchCount = estimateLocalMatches()
  panel.onFiltersChanged(f, localMatchCount, props.autoDiscoveryThreshold)
}, { deep: true })

function estimateLocalMatches(): number {
  // Best-effort: if the caller can't filter locally, it passes a large collection.
  // We don't have access to passesAdvancedFilters here, so the threshold is based
  // on raw collection size. Discovery will still fire if fewer than threshold
  // items exist in collection after *caller-side* filtering.
  return props.collectionCards.length
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

const onClose = (): void => {
  panel.close()
  emit('request-close')
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
    v-if="isOpen"
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
          class="text-silver/70 hover:text-neon text-small px-1.5"
          :aria-label="panel.collapsed.value ? t('discovery.panel.expand') : t('discovery.panel.collapse')"
          @click="onToggleCollapsed"
          data-testid="toggle-collapse"
        >
{{ panel.collapsed.value ? '▾' : '▴' }}
</button>
        <button
          type="button"
          class="text-silver/70 hover:text-rust text-small px-1.5"
          :aria-label="t('discovery.panel.close')"
          @click="onClose"
          data-testid="close"
        >
✕
</button>
      </div>
    </header>

    <div
      v-if="!panel.collapsed.value"
      class="overflow-y-auto max-h-[280px] md:max-h-[280px] p-2"
      data-testid="body"
    >
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
        <div class="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
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
