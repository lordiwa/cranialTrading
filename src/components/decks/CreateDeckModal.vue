<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../composables/useI18n'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import IconV2 from '../ui/IconV2.vue'
import type { CreateDeckInput } from '../../types/deck'

const props = defineProps<{
  show: boolean
}>()
const emit = defineEmits<{
  close: []
  create: [data: CreateDeckInput & { deckList?: string }]
}>()
const toastStore = useToastStore()
const { t } = useI18n()

const form = ref<CreateDeckInput>({
  name: '',
  format: 'custom',
  description: '',
  colors: [],
})

// Lista de cartas para importar (opcional)
const deckList = ref('')

// Preview de la lista
const deckListPreview = computed(() => {
  if (!deckList.value.trim()) return null

  const lines = deckList.value.split('\n').filter(l => l.trim())
  let mainboard = 0
  let sideboard = 0
  let inSideboard = false

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase()
    if (trimmed.includes('sideboard')) {
      inSideboard = true
      continue
    }
    const match = /^(\d+)/.exec(line)
    const matchQty = match?.[1]
    if (match && matchQty) {
      const qty = Number.parseInt(matchQty, 10)
      if (inSideboard) {
        sideboard += qty
      } else {
        mainboard += qty
      }
    }
  }

  return { mainboard, sideboard, total: mainboard + sideboard }
})

const formatOptions = [
  { value: 'vintage', label: 'Vintage' },
  { value: 'modern', label: 'Modern' },
  { value: 'commander', label: 'Commander' },
  { value: 'standard', label: 'Standard' },
  { value: 'custom', label: 'Custom' },
]

const colorOptions = [
  { value: 'W', label: '⚪ Blanco' },
  { value: 'U', label: '🔵 Azul' },
  { value: 'B', label: '⚫ Negro' },
  { value: 'R', label: '🔴 Rojo' },
  { value: 'G', label: '🟢 Verde' },
]

// v2 redesign — mana dot swatch per color, matching DESIGN-DIRECTION.md §5 chip pattern
// (design→app v2 F4b, cranial-design/prototype/62-new-deck-*.html)
const MANA_DOT_CLASSES: Record<string, string> = {
  W: 'bg-[#efe7c8]',
  U: 'bg-[#4a7fd0]',
  B: 'bg-[#3c3744]',
  R: 'bg-[#c0402f]',
  G: 'bg-[#3f9d5a]',
}
const manaDotClass = (value: string): string => MANA_DOT_CLASSES[value] ?? 'bg-silver-30'

const toggleColor = (color: string) => {
  const idx = form.value.colors.indexOf(color)
  if (idx >= 0) {
    form.value.colors.splice(idx, 1)
  } else {
    form.value.colors.push(color)
  }
}

const loading = ref(false)
const setLoading = (v: boolean) => { loading.value = v }
defineExpose({ setLoading })

const handleCreate = () => {
  if (!form.value.name.trim()) {
    toastStore.show(t('decks.createModal.validation.nameRequired'), 'error')
    return
  }
  emit('create', {
    ...form.value,
    deckList: deckList.value.trim() || undefined
  })
}

const resetForm = () => {
  form.value = {
    name: '',
    format: 'custom',
    description: '',
    colors: [],
  }
  deckList.value = ''
}

watch(() => props.show, (show) => {
  if (!show) {
    resetForm()
  }
})
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="space-y-5">
      <!-- Title -->
      <div>
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('decks.createModal.title') }}</h2>
        <p class="text-small text-silver-70 mt-1">{{ t('decks.createModal.subtitle') }}</p>
      </div>

      <!-- Form -->
      <div class="space-y-5">
        <!-- Name -->
        <div>
          <label for="create-deck-name" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.createModal.nameLabel') }}</label>
          <input
              id="create-deck-name"
              v-model="form.name"
              type="text"
              :placeholder="t('decks.createModal.namePlaceholder')"
              class="w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver placeholder:text-silver-30 text-small focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
              @keydown.enter="handleCreate"
          />
        </div>

        <!-- Format -->
        <div>
          <span class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.createModal.formatLabel') }}</span>
          <div class="flex flex-wrap gap-2" role="group" :aria-label="t('decks.createModal.formatLabel')">
            <button
                v-for="opt in formatOptions"
                :key="opt.value"
                type="button"
                class="min-h-[36px] px-3.5 rounded-full text-small font-semibold border transition-all duration-200 ease-v2"
                :class="form.format === opt.value
                  ? 'text-neon bg-neon-10 border-neon-40'
                  : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'"
                :aria-pressed="form.format === opt.value"
                @click="form.format = (opt.value as CreateDeckInput['format'])"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Colors -->
        <div>
          <span class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.createModal.colorsLabel') }}</span>
          <div class="flex flex-wrap gap-2" role="group" :aria-label="t('decks.createModal.colorsLabel')">
            <button
                v-for="color in colorOptions"
                :key="color.value"
                type="button"
                class="inline-flex items-center gap-2 min-h-[36px] px-3.5 rounded-full text-small font-semibold border transition-all duration-200 ease-v2"
                :class="form.colors.includes(color.value)
                  ? 'text-neon bg-neon-10 border-neon-40'
                  : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'"
                :aria-pressed="form.colors.includes(color.value)"
                @click="toggleColor(color.value)"
            >
              <span class="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" :class="manaDotClass(color.value)"></span>
              {{ color.label.replace(/^\S+\s/, '') }}
            </button>
          </div>
        </div>

        <!-- Description -->
        <div>
          <label for="create-deck-description" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.createModal.descriptionLabel') }}</label>
          <textarea
              id="create-deck-description"
              v-model="form.description"
              :placeholder="t('decks.createModal.descriptionPlaceholder')"
              rows="2"
              class="w-full px-3.5 py-2.5 bg-surface-1 border border-line rounded-md text-silver placeholder:text-silver-30 font-sans text-small focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2 resize-none"
          />
        </div>

        <!-- Deck List (opcional) -->
        <div>
          <label for="create-deck-list" class="text-small font-semibold text-silver-70 block mb-1.5">
            {{ t('decks.createModal.cardListLabel') }}
          </label>
          <textarea
              id="create-deck-list"
              v-model="deckList"
              :placeholder="t('decks.createModal.cardListPlaceholder')"
              rows="4"
              class="w-full px-3.5 py-2.5 bg-surface-1 border border-line rounded-md text-silver placeholder:text-silver-30 font-sans text-tiny focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2 resize-none"
          />
          <!-- Preview -->
          <div v-if="deckListPreview" class="mt-2 flex items-center gap-2.5 px-3.5 py-2.5 bg-surface-1 border border-neon-40 rounded-md">
            <IconV2 name="check" :size="16" class="text-neon flex-shrink-0" />
            <div>
              <p class="text-small text-neon font-bold">
                {{ t('decks.createModal.preview', { total: deckListPreview.total }) }}
              </p>
              <p class="text-tiny text-silver-50">
                {{ t('decks.createModal.previewDetail', { mainboard: deckListPreview.mainboard, sideboard: deckListPreview.sideboard }) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 justify-end pt-4 border-t border-line">
        <BaseButton
            variant="secondary"
            class="uppercase tracking-[.1em] !text-[12px]"
            :disabled="loading"
            @click="emit('close')"
        >
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton
            variant="filled"
            class="uppercase tracking-[.1em] !text-[12px]"
            :disabled="loading"
            @click="handleCreate"
        >
          {{ loading ? '...' : t('decks.createModal.submit') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>