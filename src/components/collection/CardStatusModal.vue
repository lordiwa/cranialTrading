<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseBadge from '../ui/BaseBadge.vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import type { Card, CardStatus } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  close: []
  updateStatus: [cardId: string, status: CardStatus]
}>()

const selectedStatus = ref<CardStatus>('collection')

const statusOptions = [
  { value: 'collection', label: 'En colección' },
  { value: 'sale', label: 'En venta' },
  { value: 'trade', label: 'En cambio' },
  { value: 'wishlist', label: 'Deseado' },
]

const statusColors = {
  collection: 'success',
  sale: 'warning',
  trade: 'info',
  wishlist: 'error',
} as const

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
    emit('updateStatus', props.card.id, selectedStatus.value)
    emit('close')
  }
}

watch(() => props.card, (newCard) => {
  if (newCard) {
    selectedStatus.value = newCard.status
  }
})
</script>

<template>
  <BaseModal :show="show" :close-on-click-outside="false" @close="emit('close')">
    <div class="space-y-6 w-full max-w-md">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">CAMBIAR STATUS</h2>
        <p class="text-small text-silver-70">Gestiona el estado de esta carta</p>
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

        <!-- Current Status -->
        <div class="pt-2 border-t border-silver-20">
          <p class="text-tiny text-silver-70 mb-2">Status actual:</p>
          <BaseBadge
              :variant="statusColors[card.status]"
          >
            {{ getStatusIcon(card.status) }} {{ card.status.toUpperCase() }}
          </BaseBadge>
        </div>
      </div>

      <!-- Status Selector -->
      <div>
        <label class="text-small text-silver-70 block mb-2">Nuevo status</label>
        <BaseSelect
            v-model="selectedStatus"
            :options="statusOptions"
        />
      </div>

      <!-- Status Grid -->
      <div class="grid grid-cols-2 gap-3 text-center text-tiny">
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">✓ COLECCIÓN</p>
          <p class="text-silver-50 text-tiny mt-1">Cartas que tienes</p>
        </div>
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">💰 VENTA</p>
          <p class="text-silver-50 text-tiny mt-1">Cartas para vender</p>
        </div>
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">🔄 CAMBIO</p>
          <p class="text-silver-50 text-tiny mt-1">Cartas para trocar</p>
        </div>
        <div class="bg-secondary border border-silver-30 p-3">
          <p class="text-silver-70">⭐ DESEADO</p>
          <p class="text-silver-50 text-tiny mt-1">Cartas que buscas</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            class="flex-1"
            @click="handleUpdateStatus"
        >
          ✓ CAMBIAR
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            @click="emit('close')"
        >
          CANCELAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>