<template>
  <div class="card-base p-md md:p-lg border border-silver-30 hover:border-neon-40">
    <!-- Header with Username and Location -->
    <div class="flex justify-between items-start mb-md">
      <div class="flex-1">
        <!-- Username link with hover preview -->
        <div
            @mouseenter="showProfileHover = true"
            @mouseleave="showProfileHover = false"
            class="relative"
        >
          <RouterLink
              :to="{ name: 'userProfile', params: { username: match.username } }"
              class="text-h3 text-silver font-bold hover:text-neon transition-fast"
          >
            @{{ match.username }}
          </RouterLink>
          <UserProfileHoverCard
              :username="match.username"
              :show="showProfileHover"
          />
        </div>

        <p class="text-small text-silver-70 mt-sm">
          📍 {{ match.location || 'Ubicación no disponible' }}
        </p>
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
      <!-- NUEVOS Tab -->
      <template v-if="tab === 'new'">
        <button
            @click="$emit('save', match)"
            class="btn-primary px-lg py-md text-small font-bold transition-fast flex-1 flex items-center justify-center gap-2"
        >
          <SpriteIcon name="check" size="tiny" />
          ME INTERESA
        </button>
        <button
            @click="$emit('discard', match.id, 'new')"
            class="btn-secondary px-lg py-md text-small font-bold transition-fast flex-1 flex items-center justify-center gap-2"
        >
          <SpriteIcon name="x-mark" size="tiny" />
          IGNORAR
        </button>
      </template>

      <!-- SAVED Tab (MIS MATCHES) -->
      <template v-if="tab === 'saved'">
        <button
            @click="handleContactar"
            class="btn-primary px-lg py-md text-small font-bold transition-fast flex-1 flex items-center justify-center gap-2"
        >
          <SpriteIcon name="chat" size="tiny" />
          CONTACTAR
        </button>

        <button
            @click="$emit('marcar-completado', match.id)"
            class="btn-secondary px-lg py-md text-small font-bold transition-fast flex-1 flex items-center justify-center gap-2"
        >
          <SpriteIcon name="check" size="tiny" />
          COMPLETADO
        </button>

        <button
            @click="$emit('descartar', match.id)"
            class="btn-danger px-lg py-md text-small font-bold transition-fast flex items-center justify-center gap-2"
        >
          <SpriteIcon name="x-mark" size="tiny" />
          ELIMINAR
        </button>
      </template>

      <!-- DELETED Tab -->
      <template v-if="tab === 'deleted'">
        <button
            @click="$emit('recover', match.id)"
            class="btn-secondary px-lg py-md text-small font-bold transition-fast flex-1 flex items-center justify-center gap-2"
        >
          <SpriteIcon name="recover" size="tiny" />
          RECUPERAR
        </button>
        <button
            @click="$emit('delete', match.id)"
            class="btn-danger px-lg py-md text-small font-bold transition-fast flex-1 flex items-center justify-center gap-2"
        >
          <SpriteIcon name="trash" size="tiny" />
          ELIMINAR
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import UserProfileHoverCard from '../user/UserProfileHoverCard.vue'
import SpriteIcon from '../ui/SpriteIcon.vue'

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
  tab: 'new' | 'saved' | 'deleted'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  save: [match: Match]
  discard: [matchId: string, tab: 'new']
  contactar: [contact: { username: string; email: string; location: string }]
  'marcar-completado': [matchId: string]
  descartar: [matchId: string]
  recover: [matchId: string]
  delete: [matchId: string]
}>()

const showProfileHover = ref(false)

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