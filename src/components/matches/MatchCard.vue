<template>
  <div class="card-base p-md md:p-lg border border-silver-30 hover:border-neon-40 transition-normal">
    <!-- Header -->
    <div class="flex justify-between items-start mb-md">
      <div>
        <h3 class="text-h5 text-silver font-bold">{{ match.otherUsername }}</h3>
        <p class="text-tiny text-silver-70 mt-xs">{{ match.otherLocation }}</p>
      </div>
      <div v-if="match.compatibility" class="text-right">
        <p class="text-h5 text-neon font-bold">{{ match.compatibility }}%</p>
        <p class="text-tiny text-silver-50">compatibilidad</p>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-b border-silver-20 mb-md"></div>

    <!-- Cards Section -->
    <div class="grid grid-cols-2 gap-md mb-md">
      <!-- Tu Lado / You Offer -->
      <div>
        <p class="text-tiny font-bold text-silver mb-sm uppercase tracking-wide">Tú Ofreces</p>
        <div class="space-y-xs">
          <div v-for="card in yourCards" :key="card" class="text-tiny text-silver flex items-start gap-xs">
            <span class="text-neon">•</span>
            <span>{{ card }}</span>
          </div>
        </div>
      </div>

      <!-- Su Lado / They Offer -->
      <div>
        <p class="text-tiny font-bold text-silver mb-sm uppercase tracking-wide">Recibes</p>
        <div class="space-y-xs">
          <div v-for="card in theirCards" :key="card" class="text-tiny text-silver flex items-start gap-xs">
            <span class="text-neon">•</span>
            <span>{{ card }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Values Section (if available) -->
    <div v-if="match.yourValue !== undefined && match.theirValue !== undefined" class="grid grid-cols-2 gap-md mb-md">
      <div class="bg-primary border border-silver-20 p-sm">
        <p class="text-tiny text-silver-70 mb-xs">TU VALOR</p>
        <p class="text-h5 text-neon font-bold">${{ match.yourValue }}</p>
      </div>
      <div class="bg-primary border border-silver-20 p-sm">
        <p class="text-tiny text-silver-70 mb-xs">SU VALOR</p>
        <p class="text-h5 text-neon font-bold">${{ match.theirValue }}</p>
      </div>
    </div>

    <!-- Match Info -->
    <div v-if="match.compatibility" class="mb-md">
      <p class="text-tiny text-silver-50 text-center">
        {{ match.compatibility }}% de compatibilidad
      </p>
    </div>

    <!-- Divider -->
    <div class="border-b border-silver-20 mb-md"></div>

    <!-- Action Buttons -->
    <div class="flex gap-sm flex-wrap">
      <!-- NUEVOS Tab Actions -->
      <template v-if="tab === 'new'">
        <button
            @click="$emit('save', match)"
            class="btn-primary flex-1 py-md text-tiny font-bold transition-fast"
        >
          ✓ ME INTERESA
        </button>
        <button
            @click="$emit('discard', match.id, 'new')"
            class="btn-secondary flex-1 py-md text-tiny font-bold transition-fast"
        >
          ✕ IGNORAR
        </button>
      </template>

      <!-- SAVED Tab Actions -->
      <template v-if="tab === 'saved'">
        <button
            @click="$emit('contact', match)"
            class="btn-primary flex-1 py-md text-tiny font-bold transition-fast"
        >
          💬 CONTACTAR
        </button>
        <button
            @click="$emit('complete', match.id)"
            class="btn-secondary flex-1 py-md text-tiny font-bold transition-fast"
        >
          ✓ COMPLETADO
        </button>
        <button
            @click="$emit('discard', match.id, 'saved')"
            class="btn-danger py-md px-md text-tiny font-bold transition-fast"
        >
          ✕
        </button>
      </template>

      <!-- DELETED Tab Actions -->
      <template v-if="tab === 'deleted'">
        <button
            @click="$emit('recover', match.id)"
            class="btn-secondary flex-1 py-md text-tiny font-bold transition-fast"
        >
          ↩️ RECUPERAR
        </button>
        <button
            @click="$emit('delete', match.id)"
            class="btn-danger flex-1 py-md text-tiny font-bold transition-fast"
        >
          🗑️ ELIMINAR
        </button>
      </template>
    </div>

    <!-- Info Message -->
    <p class="text-tiny text-silver-50 text-center mt-md">
      <span v-if="tab === 'new'">Guardado: {{ formatDate(match.createdAt) }}</span>
      <span v-else-if="tab === 'saved'">Guardado: {{ formatDate(match.savedAt) }}</span>
      <span v-else>Eliminado: {{ formatDate(match.deletedAt) }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Match {
  id: string
  docId?: string
  otherUserId: string
  otherUsername: string
  otherLocation: string
  type: 'BUSCO' | 'CAMBIO' | 'VENDO'
  compatibility?: number
  yourCards?: string[]
  theirCards?: string[]
  yourValue?: number
  theirValue?: number
  createdAt?: any
  savedAt?: any
  deletedAt?: any
}

interface Props {
  match: Match
  tab: 'new' | 'saved' | 'deleted'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  save: [match: Match]
  discard: [matchId: string, tab: 'new' | 'saved']
  contact: [match: Match]
  complete: [matchId: string]
  recover: [matchId: string]
  delete: [matchId: string]
}>()

const yourCards = computed(() => {
  return props.match.yourCards || []
})

const theirCards = computed(() => {
  return props.match.theirCards || []
})

const formatDate = (date: any) => {
  if (!date) return 'N/A'
  if (typeof date === 'string') return date
  if (date.toDate) return date.toDate().toLocaleDateString('es-AR')
  if (date instanceof Date) return date.toLocaleDateString('es-AR')
  return 'N/A'
}
</script>

<style scoped>
/* All styles in global style.css */
</style>