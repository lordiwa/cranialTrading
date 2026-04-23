<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../composables/useI18n'
import type { CardStatus } from '../../types/card'
import type { ScryfallCard } from '../../services/scryfall'
import BaseSelect from '../ui/BaseSelect.vue'

const props = withDefaults(defineProps<{
  print: ScryfallCard
  scope: 'decks' | 'binders' | 'collection'
  ownedCount?: number
  inDeckMainboardCount?: number
  inDeckSideboardCount?: number
  inBinderCount?: number
  isWishlistedSomewhere?: boolean
  defaultCollectionStatus?: CardStatus
  hasActiveDeck?: boolean
  hasActiveBinder?: boolean
  disabled?: boolean
}>(), {
  ownedCount: 0,
  inDeckMainboardCount: 0,
  inDeckSideboardCount: 0,
  inBinderCount: 0,
  isWishlistedSomewhere: false,
  defaultCollectionStatus: 'collection',
  hasActiveDeck: false,
  hasActiveBinder: false,
  disabled: false,
})

const emit = defineEmits<{
  'add-to-mainboard': [print: ScryfallCard]
  'add-to-sideboard': [print: ScryfallCard]
  'add-to-binder': [print: ScryfallCard]
  'add-to-collection': [print: ScryfallCard, status: CardStatus]
  'open-add-modal': [print: ScryfallCard]
  'click-image': [print: ScryfallCard]
}>()

const { t } = useI18n()

const imageUrl = computed<string>(() => {
  const p = props.print as unknown as {
    image_uris?: { small?: string; normal?: string }
    card_faces?: { image_uris?: { small?: string; normal?: string } }[]
  }
  if (p.image_uris?.small) return p.image_uris.small
  if (p.image_uris?.normal) return p.image_uris.normal
  const face = p.card_faces?.[0]
  if (face?.image_uris?.small) return face.image_uris.small
  if (face?.image_uris?.normal) return face.image_uris.normal
  return ''
})

const setCode = computed<string>(() => ((props.print as unknown as { set?: string }).set ?? '').toUpperCase())
const collectorNumber = computed<string>(() => (props.print as unknown as { collector_number?: string }).collector_number ?? '')

const selectedStatus = ref<CardStatus>(props.defaultCollectionStatus)

watch(() => props.defaultCollectionStatus, (s) => {
  if (s) selectedStatus.value = s
})

const statusOptions = computed(() => [
  { value: 'collection', label: t('common.status.collection') },
  { value: 'sale', label: t('common.status.sale') },
  { value: 'trade', label: t('common.status.trade') },
  { value: 'wishlist', label: t('collection.filters.wishlist') },
])

const onClickImage = (): void => { emit('click-image', props.print); }
const onAddMb = (): void => { if (!props.disabled && props.hasActiveDeck) emit('add-to-mainboard', props.print) }
const onAddSb = (): void => { if (!props.disabled && props.hasActiveDeck) emit('add-to-sideboard', props.print) }
const onAddBinder = (): void => { if (!props.disabled && props.hasActiveBinder) emit('add-to-binder', props.print) }
const onAddCollection = (): void => { if (!props.disabled) emit('add-to-collection', props.print, selectedStatus.value) }
const onMore = (): void => { emit('open-add-modal', props.print); }
</script>

<template>
  <div class="discovery-card relative group rounded overflow-hidden bg-secondary/40 border border-neon/20 hover:border-neon/60 transition">
    <button
      type="button"
      class="block w-full aspect-[3/4] relative focus:outline-none focus:ring-1 focus:ring-neon"
      @click="onClickImage"
      :aria-label="print.name"
    >
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="print.name"
        loading="lazy"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full bg-primary flex items-center justify-center text-silver/50 text-tiny px-2">
        {{ print.name }}
      </div>

      <div class="absolute top-1 left-1 flex flex-col gap-0.5 pointer-events-none text-tiny font-bold">
        <span
          v-if="scope === 'decks' && inDeckMainboardCount > 0"
          class="bg-neon text-primary px-1 rounded"
          data-testid="badge-mb"
        >{{ t('discovery.panel.inMainboard', { count: inDeckMainboardCount }) }}</span>
        <span
          v-if="scope === 'decks' && inDeckSideboardCount > 0"
          class="bg-neon/70 text-primary px-1 rounded"
          data-testid="badge-sb"
        >{{ t('discovery.panel.inSideboard', { count: inDeckSideboardCount }) }}</span>
        <span
          v-if="scope === 'binders' && inBinderCount > 0"
          class="bg-neon text-primary px-1 rounded"
          data-testid="badge-binder"
        >{{ t('discovery.panel.inBinder', { count: inBinderCount }) }}</span>
      </div>

      <div class="absolute top-1 right-1 flex flex-col items-end gap-0.5 pointer-events-none text-tiny font-bold">
        <span
          v-if="ownedCount > 0"
          class="bg-primary/80 text-neon border border-neon/40 px-1 rounded"
          data-testid="badge-owned"
        >{{ t('discovery.panel.owned', { count: ownedCount }) }}</span>
      </div>

      <div class="absolute bottom-1 right-1 pointer-events-none text-tiny text-silver/70 hidden sm:block" v-if="setCode || collectorNumber">
        <span class="bg-primary/70 px-1 rounded">{{ setCode }} {{ collectorNumber ? `#${collectorNumber}` : '' }}</span>
      </div>

      <div class="absolute bottom-1 left-1 pointer-events-none hidden sm:block" v-if="isWishlistedSomewhere">
        <span class="text-neon text-sm" data-testid="badge-wishlist" aria-label="wishlist">★</span>
      </div>
    </button>

    <div class="flex items-stretch sm:items-center justify-between gap-1 p-1 bg-primary/60">
      <div class="flex flex-col sm:flex-row sm:items-center gap-1 flex-1 min-w-0">
        <template v-if="scope === 'decks'">
          <button
            type="button"
            class="text-tiny font-bold rounded bg-neon/20 text-neon border border-neon/40 hover:bg-neon hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition w-full sm:w-auto px-3 py-2 sm:px-1.5 sm:py-0.5 min-h-[44px] sm:min-h-0"
            :disabled="disabled || !hasActiveDeck"
            @click="onAddMb"
            data-testid="btn-mb"
          >
{{ t('discovery.card.addMainboard') }}
</button>
          <button
            type="button"
            class="text-tiny font-bold rounded bg-neon/10 text-silver border border-neon/30 hover:bg-neon/30 disabled:opacity-40 disabled:cursor-not-allowed transition w-full sm:w-auto px-3 py-2 sm:px-1.5 sm:py-0.5 min-h-[44px] sm:min-h-0"
            :disabled="disabled || !hasActiveDeck"
            @click="onAddSb"
            data-testid="btn-sb"
          >
{{ t('discovery.card.addSideboard') }}
</button>
        </template>

        <template v-else-if="scope === 'binders'">
          <button
            type="button"
            class="text-tiny font-bold rounded bg-neon/20 text-neon border border-neon/40 hover:bg-neon hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition w-full px-3 py-2 sm:px-1.5 sm:py-0.5 min-h-[44px] sm:min-h-0"
            :disabled="disabled || !hasActiveBinder"
            @click="onAddBinder"
            data-testid="btn-binder"
          >
{{ t('discovery.card.addBinder') }}
</button>
        </template>

        <template v-else>
          <BaseSelect
            v-model="selectedStatus"
            :options="statusOptions"
            class="text-tiny flex-1 min-w-0"
            data-testid="status-select"
          />
          <button
            type="button"
            class="text-tiny font-bold rounded bg-neon/20 text-neon border border-neon/40 hover:bg-neon hover:text-primary disabled:opacity-40 transition w-full sm:w-auto px-3 py-2 sm:px-1.5 sm:py-0.5 min-h-[44px] sm:min-h-0"
            :disabled="disabled"
            @click="onAddCollection"
            data-testid="btn-collection"
          >
+
</button>
        </template>
      </div>

      <button
        type="button"
        class="text-silver/70 hover:text-neon transition shrink-0 text-lg leading-none flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:px-1"
        :aria-label="t('discovery.card.moreOptions')"
        @click="onMore"
        data-testid="btn-more"
      >
⋮
</button>
    </div>
  </div>
</template>
