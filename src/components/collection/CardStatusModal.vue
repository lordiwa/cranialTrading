<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseBadge from '../ui/BaseBadge.vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseSelect from '../ui/BaseSelect.vue'
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
    fetchCKPrices()
  }
}, { immediate: true })

const statusOptions = computed(() => [
  { value: 'collection', label: t('cards.statusModal.statusOptions.collection') },
  { value: 'sale', label: t('cards.statusModal.statusOptions.sale') },
  { value: 'trade', label: t('cards.statusModal.statusOptions.trade') },
  { value: 'wishlist', label: t('cards.statusModal.statusOptions.wishlist') },
])

const statusColors: Record<CardStatus, 'success' | 'warning' | 'info' | 'error'> = {
  collection: 'success',
  sale: 'warning',
  trade: 'info',
  wishlist: 'error',
}

const getStatusIcon = (status: CardStatus) => {
  const icons = {
    collection: '✓',
    sale: '💰',
    trade: '🔄',
    wishlist: '⭐',
  }
  return icons[status]
}

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
    <div class="space-y-6 w-full max-w-md">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">{{ t('cards.statusModal.title') }}</h2>
        <p class="text-small text-silver-70">{{ t('cards.statusModal.subtitle') }}</p>
      </div>

      <!-- Card Info -->
      <div v-if="card" class="bg-secondary border border-silver-30 p-4 space-y-3">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <p class="font-bold text-silver text-h3">{{ card.name }}</p>
            <p class="text-small text-silver-70 mt-1">{{ card.edition }}</p>
            <p class="text-tiny text-silver-70 mt-2">
              {{ card.quantity }}x {{ card.condition }}
              <span v-if="card.foil" class="text-neon"> • FOIL</span>
            </p>
          </div>
          <img
              v-if="card.image"
              :src="card.image"
              :alt="card.name"
              class="w-12 h-16 object-cover border border-silver-30"
          />
        </div>

        <!-- Prices -->
        <div class="pt-2 border-t border-silver-20 space-y-1">
          <p class="text-tiny text-silver-70 mb-2">{{ t('cards.statusModal.prices') }}</p>
          <div class="flex justify-between items-center">
            <span class="text-tiny text-silver-50">TCGPlayer:</span>
            <span class="text-small font-bold text-neon">${{ card.price?.toFixed(2) || 'N/A' }}</span>
          </div>
          <div v-if="hasCardKingdomPrices" class="flex justify-between items-center">
            <span class="text-tiny text-silver-50">Card Kingdom:</span>
            <span class="text-small font-bold text-[#4CAF50]">{{ formatPrice(cardKingdomRetail) }}</span>
          </div>
          <div v-if="cardKingdomBuylist" class="flex justify-between items-center">
            <span class="text-tiny text-silver-50">CK Buylist:</span>
            <span class="text-small text-[#FF9800]">{{ formatPrice(cardKingdomBuylist) }}</span>
          </div>
          <div v-else-if="loadingCKPrices" class="text-tiny text-silver-50">
            {{ t('cards.statusModal.loadingCKPrices') }}
          </div>
        </div>

        <!-- Current Status -->
        <div class="pt-2 border-t border-silver-20">
          <p class="text-tiny text-silver-70 mb-2">{{ t('cards.statusModal.currentStatus') }}</p>
          <BaseBadge
              :variant="statusColors[card.status]"
          >
            {{ getStatusIcon(card.status) }} {{ card.status.toUpperCase() }}
          </BaseBadge>
        </div>
      </div>

      <!-- Status Selector -->
      <div>
        <label for="status-select" class="text-small text-silver-70 block mb-2">{{ t('cards.statusModal.newStatus') }}</label>
        <BaseSelect
            id="status-select"
            v-model="selectedStatus"
            :options="statusOptions"
        />
      </div>

      <!-- Publicar en perfil (solo para sale/trade) -->
      <div v-if="showPublicOption" class="flex items-center gap-3 p-3 bg-secondary border border-neon/30">
        <input
            v-model="isPublic"
            type="checkbox"
            id="public-status"
            class="w-4 h-4 cursor-pointer"
        />
        <div>
          <label for="public-status" class="text-small text-silver cursor-pointer">{{ t('cards.statusModal.publishLabel') }}</label>
          <p class="text-tiny text-silver-50">{{ t('cards.statusModal.publishHint') }}</p>
        </div>
      </div>

      <!-- Status Grid -->
      <div class="grid grid-cols-2 gap-3 text-center text-tiny">
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">{{ t('cards.statusModal.statusInfo.collection.icon') }} {{ t('cards.statusModal.statusInfo.collection.label') }}</p>
          <p class="text-silver-50 text-tiny mt-1">{{ t('cards.statusModal.statusInfo.collection.description') }}</p>
        </div>
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">{{ t('cards.statusModal.statusInfo.sale.icon') }} {{ t('cards.statusModal.statusInfo.sale.label') }}</p>
          <p class="text-silver-50 text-tiny mt-1">{{ t('cards.statusModal.statusInfo.sale.description') }}</p>
        </div>
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">{{ t('cards.statusModal.statusInfo.trade.icon') }} {{ t('cards.statusModal.statusInfo.trade.label') }}</p>
          <p class="text-silver-50 text-tiny mt-1">{{ t('cards.statusModal.statusInfo.trade.description') }}</p>
        </div>
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">{{ t('cards.statusModal.statusInfo.wishlist.icon') }} {{ t('cards.statusModal.statusInfo.wishlist.label') }}</p>
          <p class="text-silver-50 text-tiny mt-1">{{ t('cards.statusModal.statusInfo.wishlist.description') }}</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            class="flex-1"
            @click="handleUpdateStatus"
        >
          {{ t('cards.statusModal.submit') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            @click="emit('close')"
        >
          {{ t('common.actions.cancel') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>