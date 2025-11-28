<template>
  <div class="card-base p-md md:p-lg border border-silver-30 hover:border-neon-40">
    <!-- Header with Username and Location -->
    <div class="flex justify-between items-start mb-md">
      <div>
        <h3 class="text-h3 text-silver font-bold">{{ match.username }}</h3>
        <p class="text-small text-silver-70">📍 {{ match.location }}</p>
      </div>
      <span class="text-tiny text-silver-50">Guardado: {{ formattedDate }}</span>
    </div>

    <div class="border-b border-silver-20 mb-md"></div>

    <!-- Cards Section -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-md mb-md">
      <!-- Cards Offering (Tu lado) -->
      <div>
        <p class="text-tiny font-bold text-silver mb-sm">QUEREMOS:</p>
        <div class="space-y-xs">
          <div v-for="card in match.cardsReceiving" :key="card" class="text-small text-silver">
            • {{ card }}
          </div>
        </div>
      </div>

      <!-- Cards Receiving (Su lado) -->
      <div>
        <p class="text-tiny font-bold text-silver mb-sm">OFRECEN:</p>
        <div class="space-y-xs">
          <div v-for="card in match.cardsOffering" :key="card" class="text-small text-silver">
            • {{ card }}
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-sm md:gap-md flex-wrap">
      <!-- Contactar Button -->
      <button
          @click="handleContactar"
          class="btn-primary px-lg py-md text-small font-bold transition-fast"
      >
        CONTACTAR
      </button>

      <!-- Ver Perfil Button -->
      <button
          @click="$emit('ver-perfil')"
          class="btn-secondary px-lg py-md text-small font-bold transition-fast"
      >
        VER PERFIL
      </button>

      <!-- Marcar Completado Button -->
      <button
          @click="$emit('marcar-completado', match.id)"
          class="btn-secondary px-lg py-md text-small font-bold transition-fast"
      >
        COMPLETADO
      </button>

      <!-- Eliminar Button -->
      <button
          @click="$emit('descartar', match.id)"
          class="btn-danger px-lg py-md text-small font-bold transition-fast"
      >
        ELIMINAR
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Match {
  id: string
  username: string
  location: string
  email: string
  cardsOffering: string[]
  cardsReceiving: string[]
  createdAt: Date
}

interface Props {
  match: Match
}

const props = defineProps<Props>()

const emit = defineEmits<{
  contactar: [contact: { username: string; email: string; location: string }]
  'ver-perfil': []
  'marcar-completado': [matchId: string]
  descartar: [matchId: string]
}>()

const formattedDate = computed(() => {
  const now = new Date()
  const created = new Date(props.match.createdAt)
  const diff = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))

  if (diff === 0) return 'hoy'
  if (diff === 1) return 'ayer'
  return `hace ${diff}d`
})

const handleContactar = () => {
  // Emit contactar event with contact data
  emit('contactar', {
    username: props.match.username,
    email: props.match.email,
    location: props.match.location
  })
}
</script>

<style scoped>
/* All styles in global style.css */
</style>