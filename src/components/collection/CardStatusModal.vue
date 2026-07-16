<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import IconV2 from '../ui/IconV2.vue'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import type { Card, CardStatus } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  close: []
  updateStatus: [cardId: string, status: CardStatus, isPublic: boolean]
}>()

const { t } = useI18n()

const selectedStatus = ref<CardStatus>('collection')
const isPublic = ref(true)

// Show public checkbox only for sale/trade
const showPublicOption = computed(() => selectedStatus.value === 'sale' || selectedStatus.value === 'trade')

// Card Kingdom prices
const {
  loading: loadingCKPrices,
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => props.card?.scryfallId,
  () => props.card?.setCode
)

// Fetch CK prices when card changes
watch(() => props.card, (card) => {
  if (card?.scryfallId && card?.setCode) {
    void fetchCKPrices()
  }
}, { immediate: true })

const statusOptions = computed(() => [
  { value: 'collection', label: t('cards.statusModal.statusOptions.collection'), description: t('cards.statusModal.statusInfo.collection.description') },
  { value: 'sale', label: t('cards.statusModal.statusOptions.sale'), description: t('cards.statusModal.statusInfo.sale.description') },
  { value: 'trade', label: t('cards.statusModal.statusOptions.trade'), description: t('cards.statusModal.statusInfo.trade.description') },
  { value: 'wishlist', label: t('cards.statusModal.statusOptions.wishlist'), description: t('cards.statusModal.statusInfo.wishlist.description') },
])

// v2 redesign — dot-badge tint classes (design→app v2 F5b, DESIGN-DIRECTION.md §5).
// Same status color vocabulary already shipped in AddCardModal.vue's STATUS_BADGE_CLASSES.
const STATUS_BADGE_CLASSES: Record<CardStatus, string> = {
  collection: 'bg-surface-3 text-silver-70',
  sale: 'bg-rust-10 text-[#C4553F]',
  trade: 'bg-[rgba(96,165,250,.12)] text-[#60A5FA]',
  wishlist: 'bg-[rgba(212,168,67,.12)] text-gold',
}
const statusBadgeClass = (status: CardStatus): string => STATUS_BADGE_CLASSES[status]

const handleUpdateStatus = () => {
  if (props.card) {
    const publicValue = showPublicOption.value ? isPublic.value : false
    emit('updateStatus', props.card.id, selectedStatus.value, publicValue)
    emit('close')
  }
}

watch(() => props.card, (newCard) => {
  if (newCard) {
    selectedStatus.value = newCard.status
    isPublic.value = newCard.public ?? true
  }
})
</script>

<template>
  <BaseModal :show="show" :close-on-click-outside="false" @close="emit('close')">
    <div class="space-y-5 w-full max-w-lg">
      <!-- Title -->
      <div>
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('cards.statusModal.title') }}</h2>
        <p class="text-small text-silver-50 mt-1">{{ t('cards.statusModal.subtitle') }}</p>
      </div>

      <!-- Card Info -->
      <div v-if="card" class="bg-surface-1 border border-line rounded-lg p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <p class="font-display text-[17px] font-bold text-silver">{{ card.name }}</p>
            <p class="text-small text-silver-50 mt-1">{{ card.edition }}</p>
            <p class="text-tiny text-silver-50 mt-2">
              {{ card.quantity }}x {{ t(`common.conditions.${card.condition}`) }}
              <span v-if="card.foil" class="text-neon font-bold"> · FOIL</span>
            </p>
          </div>
          <img
              v-if="card.image"
              :src="card.image"
              :alt="card.name"
              class="w-[52px] h-[72px] flex-shrink-0 object-cover border border-line rounded-md"
          />
        </div>

        <!-- Prices -->
        <div class="mt-3.5 pt-3.5 border-t border-line space-y-1">
          <div class="flex justify-between items-baseline">
            <span class="text-tiny uppercase tracking-wide text-silver-50">Card Kingdom</span>
            <span v-if="hasCardKingdomPrices" class="font-display font-tnum text-[16px] font-bold text-neon">{{ formatPrice(cardKingdomRetail) }}</span>
            <span v-else-if="loadingCKPrices" class="text-tiny text-silver-50">{{ t('cards.statusModal.loadingCKPrices') }}</span>
            <span v-else class="font-display font-tnum text-small text-silver-50">-</span>
          </div>
          <div class="flex justify-between items-baseline">
            <span class="text-tiny uppercase tracking-wide text-silver-50">TCGplayer</span>
            <span class="font-display font-tnum text-small text-silver-50">${{ card.price?.toFixed(2) || 'N/A' }}</span>
          </div>
          <div class="flex justify-between items-baseline">
            <span class="text-tiny uppercase tracking-wide text-silver-50">CK Buylist</span>
            <span v-if="cardKingdomBuylist" class="font-display font-tnum text-small text-silver-50">{{ formatPrice(cardKingdomBuylist) }}</span>
            <span v-else class="font-display font-tnum text-small text-silver-50">-</span>
          </div>
        </div>

        <!-- Current Status -->
        <div class="mt-3.5 pt-3.5 border-t border-line flex items-center gap-2.5">
          <span class="text-tiny text-silver-50">{{ t('cards.statusModal.currentStatus') }}</span>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-surface-3 text-silver-70">
            <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
            {{ statusOptions.find(o => o.value === card?.status)?.label }}
          </span>
        </div>
      </div>

      <!-- Status Selector -->
      <div>
        <p class="text-[11px] font-bold uppercase tracking-[.12em] text-silver-50 mb-3">{{ t('cards.statusModal.newStatus') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" :aria-label="t('cards.statusModal.newStatus')">
          <button
              v-for="opt in statusOptions"
              :key="opt.value"
              type="button"
              class="relative flex flex-col items-start gap-2 p-4 text-left rounded-lg border transition-all duration-200 ease-v2"
              :class="selectedStatus === opt.value
                ? 'border-neon bg-neon-5 shadow-glow-neon'
                : 'border-line bg-surface-1 hover:bg-surface-2 hover:border-line-strong'"
              :aria-pressed="selectedStatus === opt.value"
              @click="selectedStatus = (opt.value as CardStatus)"
          >
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide" :class="statusBadgeClass(opt.value as CardStatus)">
              <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
              {{ opt.label }}
            </span>
            <span class="text-tiny text-silver-50">{{ opt.description }}</span>
            <IconV2
                name="check"
                :size="18"
                class="absolute top-3.5 right-3.5 text-neon transition-opacity"
                :class="selectedStatus === opt.value ? 'opacity-100' : 'opacity-0'"
            />
          </button>
        </div>
      </div>

      <!-- Publicar en perfil (solo para sale/trade) -->
      <label v-if="showPublicOption" class="flex items-start gap-3 p-3.5 bg-neon-5 border border-neon-40 rounded-md cursor-pointer">
        <input
            v-model="isPublic"
            type="checkbox"
            id="public-status"
            class="w-[18px] h-[18px] mt-0.5 cursor-pointer accent-neon flex-shrink-0"
        />
        <div>
          <span class="text-small font-bold text-silver">{{ t('cards.statusModal.publishLabel') }}</span>
          <p class="text-tiny text-silver-30">{{ t('cards.statusModal.publishHint') }}</p>
        </div>
      </label>

      <!-- Actions -->
      <div class="flex gap-2 justify-end pt-4 border-t border-line">
        <BaseButton variant="secondary" class="uppercase tracking-[.1em] !text-[12px]" @click="emit('close')">
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton variant="filled" class="uppercase tracking-[.1em] !text-[12px] gap-2" @click="handleUpdateStatus">
          <IconV2 name="check" :size="16" />
          {{ t('cards.statusModal.submit') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>