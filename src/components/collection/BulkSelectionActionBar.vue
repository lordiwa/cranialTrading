<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../../composables/useI18n'
import BaseButton from '../ui/BaseButton.vue'
import SvgIcon from '../ui/SvgIcon.vue'
import type { Binder } from '../../types/binder'
import type { CardStatus } from '../../types/card'
import type { Deck } from '../../types/deck'

interface Props {
  selectedCount: number
  bulkActionLoading: boolean
  bulkActionProgress: number
  decks: Deck[]
  binders: Binder[]
}

defineProps<Props>()

const emit = defineEmits<{
  'toggle-selection-mode': []
  'select-all': []
  'clear-selection': []
  'change-status': [status: CardStatus]
  'toggle-public': [isPublic: boolean]
  'allocate-to-deck': [deckId: string]
  'allocate-to-binder': [binderId: string]
  'create-deck': []
  'create-binder': []
  'delete': []
}>()

const { t } = useI18n()

// Picker visibility is internal to the action bar — parent only cares about the final choice.
const showDeckPicker = ref(false)
const showBinderPicker = ref(false)

const toggleDeckPicker = () => {
  showDeckPicker.value = !showDeckPicker.value
  showBinderPicker.value = false
}

const toggleBinderPicker = () => {
  showBinderPicker.value = !showBinderPicker.value
  showDeckPicker.value = false
}

const onAllocateToDeck = (deckId: string) => {
  showDeckPicker.value = false
  emit('allocate-to-deck', deckId)
}

const onAllocateToBinder = (binderId: string) => {
  showBinderPicker.value = false
  emit('allocate-to-binder', binderId)
}

const onCreateDeck = () => {
  showDeckPicker.value = false
  emit('create-deck')
}

const onCreateBinder = () => {
  showBinderPicker.value = false
  emit('create-binder')
}
</script>

<template>
  <div class="bg-silver-5 border border-silver-10 p-3 mb-4 rounded space-y-3 relative">
    <div v-if="bulkActionLoading" class="absolute inset-0 bg-primary/70 rounded flex flex-col items-center justify-center z-10 gap-2">
      <span class="text-small font-bold text-neon animate-pulse">
        {{ bulkActionProgress > 0 ? `${bulkActionProgress}%` : t('collection.bulkEdit.processing') }}
      </span>
      <div v-if="bulkActionProgress > 0" class="w-3/4 h-1 bg-silver-10 rounded overflow-hidden">
        <div class="h-full bg-neon transition-all duration-300" :style="{ width: `${bulkActionProgress}%` }"></div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="text-small font-bold text-silver">
          {{ t('collection.bulkDelete.selected', { count: selectedCount }) }}
        </span>
        <button
            :disabled="bulkActionLoading"
            class="text-tiny text-neon hover:text-neon/80 underline transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            @click="emit('select-all')"
        >
          {{ t('collection.bulkDelete.selectAll') }}
        </button>
        <button
            v-if="selectedCount > 0"
            :disabled="bulkActionLoading"
            class="text-tiny text-silver-50 hover:text-silver underline transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            @click="emit('clear-selection')"
        >
          {{ t('collection.bulkDelete.clearSelection') }}
        </button>
      </div>
      <BaseButton size="small" variant="secondary" :disabled="bulkActionLoading" @click="emit('toggle-selection-mode')">
        {{ t('common.actions.cancel') }}
      </BaseButton>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-tiny font-bold text-silver-50 uppercase w-14">{{ t('collection.bulkEdit.statusLabel') }}</span>
      <button
          :disabled="selectedCount === 0 || bulkActionLoading"
          class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
          @click="emit('change-status', 'collection')"
      >
        <SvgIcon name="check" size="tiny" />
        {{ t('common.status.collection').toUpperCase() }}
      </button>
      <button
          :disabled="selectedCount === 0 || bulkActionLoading"
          class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-blue-400/50 disabled:opacity-30 disabled:cursor-not-allowed text-blue-400"
          @click="emit('change-status', 'trade')"
      >
        <SvgIcon name="flip" size="tiny" />
        {{ t('common.status.trade').toUpperCase() }}
      </button>
      <button
          :disabled="selectedCount === 0 || bulkActionLoading"
          class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-yellow-400/50 disabled:opacity-30 disabled:cursor-not-allowed text-yellow-400"
          @click="emit('change-status', 'sale')"
      >
        <SvgIcon name="money" size="tiny" />
        {{ t('common.status.sale').toUpperCase() }}
      </button>
      <button
          :disabled="selectedCount === 0 || bulkActionLoading"
          class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-red-400/50 disabled:opacity-30 disabled:cursor-not-allowed text-red-400"
          @click="emit('change-status', 'wishlist')"
      >
        <SvgIcon name="star" size="tiny" />
        {{ t('common.status.wishlist').toUpperCase() }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-tiny font-bold text-silver-50 uppercase w-14">{{ t('collection.bulkEdit.visibilityLabel') }}</span>
      <button
          :disabled="selectedCount === 0 || bulkActionLoading"
          class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
          @click="emit('toggle-public', true)"
      >
        <SvgIcon name="eye-open" size="tiny" />
        {{ t('collection.bulkEdit.setPublic') }}
      </button>
      <button
          :disabled="selectedCount === 0 || bulkActionLoading"
          class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-silver-50/50 disabled:opacity-30 disabled:cursor-not-allowed text-silver-50"
          @click="emit('toggle-public', false)"
      >
        <SvgIcon name="eye-closed" size="tiny" />
        {{ t('collection.bulkEdit.setPrivate') }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-tiny font-bold text-silver-50 uppercase w-14">{{ t('collection.bulkEdit.addLabel') }}</span>

      <div class="relative">
        <button
            :disabled="selectedCount === 0 || bulkActionLoading"
            class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
            @click="toggleDeckPicker"
        >
          <SvgIcon name="box" size="tiny" />
          {{ t('collection.bulkEdit.deck') }} ▾
        </button>
        <div v-if="showDeckPicker" class="absolute top-full left-0 mt-1 z-20 bg-primary border border-silver-10 rounded shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
          <button
              v-for="deck in decks"
              :key="deck.id"
              class="w-full text-left px-3 py-2 text-tiny text-silver hover:bg-silver-5 transition-colors"
              @click="onAllocateToDeck(deck.id)"
          >
            {{ deck.name }}
          </button>
          <button
              class="w-full text-left px-3 py-2 text-tiny text-neon hover:bg-silver-5 transition-colors border-t border-silver-10"
              @click="onCreateDeck"
          >
            {{ t('collection.bulkEdit.newDeck') }}
          </button>
        </div>
      </div>

      <div class="relative">
        <button
            :disabled="selectedCount === 0 || bulkActionLoading"
            class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
            @click="toggleBinderPicker"
        >
          <SvgIcon name="collection" size="tiny" />
          {{ t('collection.bulkEdit.binder') }} ▾
        </button>
        <div v-if="showBinderPicker" class="absolute top-full left-0 mt-1 z-20 bg-primary border border-silver-10 rounded shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
          <button
              v-for="binder in binders"
              :key="binder.id"
              class="w-full text-left px-3 py-2 text-tiny text-silver hover:bg-silver-5 transition-colors"
              @click="onAllocateToBinder(binder.id)"
          >
            {{ binder.name }}
          </button>
          <button
              class="w-full text-left px-3 py-2 text-tiny text-neon hover:bg-silver-5 transition-colors border-t border-silver-10"
              @click="onCreateBinder"
          >
            {{ t('collection.bulkEdit.newBinder') }}
          </button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2">
      <BaseButton
          size="small"
          variant="danger"
          :disabled="selectedCount === 0 || bulkActionLoading"
          @click="emit('delete')"
      >
        {{ t('collection.bulkDelete.deleteSelected', { count: selectedCount }) }}
      </BaseButton>
    </div>
  </div>
</template>
