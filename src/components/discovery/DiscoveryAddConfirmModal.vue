<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import IconV2 from '../ui/IconV2.vue'
import { useI18n } from '../../composables/useI18n'
import type { CardCondition } from '../../types/card'

export interface DiscoveryAddConfirmResult {
  quantity: number
  condition: CardCondition
  foil: boolean
}

const props = defineProps<{
  show: boolean
  cardName: string
  deckName: string
  pendingCount: number
  isInSideboard: boolean
}>()

const emit = defineEmits<{
  confirm: [result: DiscoveryAddConfirmResult]
  cancel: []
  close: []
}>()

const { t } = useI18n()

const quantity = ref(1)
const condition = ref<CardCondition>('NM')
const foil = ref(false)

const bodyCopy = computed(() => {
  const location = props.isInSideboard
      ? t('discovery.confirmModal.addingToSideboard', { deck: props.deckName })
      : t('discovery.confirmModal.addingToMainboard', { deck: props.deckName })
  const copies = quantity.value === 1
      ? t('discovery.confirmModal.chooseCopy')
      : t('discovery.confirmModal.chooseCopies', { count: quantity.value })
  return `${location} ${copies}`
})

// Reset form whenever modal opens with new pending data
watch(
  () => props.show,
  (val) => {
    if (val) {
      quantity.value = props.pendingCount
      condition.value = 'NM'
      foil.value = false
    }
  },
)

// Also reset when pendingCount changes while open
watch(
  () => props.pendingCount,
  (val) => {
    if (props.show) quantity.value = val
  },
)

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

const handleConfirm = () => {
  emit('confirm', {
    quantity: Math.max(1, quantity.value),
    condition: condition.value,
    foil: foil.value,
  })
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<template>
  <BaseModal
    :show="show"
    :aria-label="cardName"
    :close-on-click-outside="false"
    max-width="max-w-sm"
    @close="handleCancel"
  >
    <div class="space-y-4">
      <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ cardName }}</h2>
      <p class="text-small text-silver-70">{{ bodyCopy }}</p>

      <!-- Quantity -->
      <div>
        <label class="text-small font-semibold text-silver-70 block mb-1.5" for="discovery-qty">{{ t('discovery.confirmModal.copiesLabel') }}</label>
        <input
          id="discovery-qty"
          v-model.number="quantity"
          type="number"
          min="1"
          class="w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver font-display font-tnum focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
        />
      </div>

      <!-- Condition -->
      <div>
        <span class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('discovery.confirmModal.conditionLabel') }}</span>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="t('discovery.confirmModal.conditionLabel')">
          <button
              v-for="opt in conditionOptions"
              :key="opt.value"
              type="button"
              class="min-h-[38px] px-3.5 rounded-full text-tiny font-bold border transition-all duration-200 ease-v2"
              :class="condition === opt.value
                ? 'text-neon bg-neon-10 border-neon-40'
                : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'"
              :aria-pressed="condition === opt.value"
              @click="condition = (opt.value as CardCondition)"
          >
            {{ opt.value }}
          </button>
        </div>
      </div>

      <!-- Foil -->
      <button
          type="button"
          role="switch"
          :aria-checked="foil"
          class="w-full flex items-center justify-between gap-3.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md"
          @click="foil = !foil"
      >
        <span class="text-[14px] font-semibold text-silver">{{ t('discovery.confirmModal.foilLabel') }}</span>
        <span
            class="relative w-[44px] h-[26px] rounded-full border flex-shrink-0 transition-colors duration-200 ease-v2"
            :class="foil ? 'bg-neon border-neon' : 'bg-surface-3 border-line'"
        >
          <span
              class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2"
              :class="foil ? 'right-0.5' : 'left-0.5'"
          ></span>
        </span>
      </button>

      <!-- Actions -->
      <div class="flex gap-2 justify-end pt-2 border-t border-line">
        <button
          type="button"
          class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md text-tiny font-bold uppercase tracking-[.1em] border border-line-strong text-silver-70 hover:border-silver-30 hover:text-silver hover:bg-surface-1 transition-all duration-200 ease-v2"
          @click="handleCancel"
        >
          {{ t('discovery.confirmModal.cancel') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-md text-tiny font-bold uppercase tracking-[.1em] bg-neon text-primary hover:brightness-110 hover:shadow-glow-neon transition-all duration-200 ease-v2"
          @click="handleConfirm"
        >
          <IconV2 name="plus" :size="14" />
          {{ t('discovery.confirmModal.submit') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
