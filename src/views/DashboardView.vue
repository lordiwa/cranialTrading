<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="mb-lg md:mb-xl">
        <h1 class="text-h2 md:text-h1 font-bold text-silver">MATCHES</h1>
        <p class="text-small md:text-body text-silver-70 mt-sm">
          {{ totalMatches }} matches
        </p>
      </div>

      <!-- Tabs Navigation -->
      <div class="flex gap-lg mb-xl border-b border-silver-20">
        <button
            @click="activeTab = 'nuevos'"
            :class="[
              'pb-md border-b-2 transition-fast',
              activeTab === 'nuevos' ? 'border-neon text-neon' : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          <span class="flex items-center gap-sm">
            🔴 NUEVOS
            <span class="text-tiny">{{ matchesStore.newMatches.length }}</span>
          </span>
        </button>
        <button
            @click="activeTab = 'saved'"
            :class="[
              'pb-md border-b-2 transition-fast',
              activeTab === 'saved' ? 'border-neon text-neon' : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          <span class="flex items-center gap-sm">
            ⭐ MIS MATCHES
            <span class="text-tiny">{{ matchesStore.savedMatches.length }}</span>
          </span>
        </button>
        <button
            @click="activeTab = 'deleted'"
            :class="[
              'pb-md border-b-2 transition-fast',
              activeTab === 'deleted' ? 'border-neon text-neon' : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          <span class="flex items-center gap-sm">
            🗑️ ELIMINADOS
            <span class="text-tiny">{{ matchesStore.deletedMatches.length }}</span>
          </span>
        </button>
      </div>

      <!-- Tab Content - NUEVOS -->
      <div v-if="activeTab === 'nuevos'">
        <div v-if="matchesStore.newMatches.length === 0" class="text-center py-xl">
          <p class="text-body text-silver-70">No tienes matches nuevos</p>
        </div>
        <div v-else class="space-y-md">
          <MatchCard
              v-for="match in matchesStore.newMatches"
              :key="match.id || match.docId"
              :match="normalizeMatch(match)"
              :tab="'new'"
              @save="handleSaveMatch"
              @discard="handleDiscardMatch"
              @contactar="handleContactar"
              @marcar-completado="handleCompleteMatch"
              @descartar="handleDiscardMatch"
              @recover="handleRecoverMatch"
              @delete="handlePermanentDelete"
          />
        </div>
      </div>

      <!-- Tab Content - SAVED (MIS MATCHES) -->
      <div v-if="activeTab === 'saved'">
        <div v-if="matchesStore.savedMatches.length === 0" class="text-center py-xl">
          <p class="text-body text-silver-70">No tienes matches guardados</p>
        </div>
        <div v-else class="space-y-md">
          <MatchCard
              v-for="match in matchesStore.savedMatches"
              :key="match.id || match.docId"
              :match="normalizeMatch(match)"
              :tab="'saved'"
              @save="handleSaveMatch"
              @discard="handleDiscardMatch"
              @contactar="handleContactar"
              @marcar-completado="handleCompleteMatch"
              @descartar="handleDiscardMatch"
              @recover="handleRecoverMatch"
              @delete="handlePermanentDelete"
          />
        </div>
      </div>

      <!-- Tab Content - DELETED -->
      <div v-if="activeTab === 'deleted'">
        <div v-if="matchesStore.deletedMatches.length === 0" class="text-center py-xl">
          <p class="text-body text-silver-70">No tienes matches eliminados</p>
        </div>
        <div v-else class="space-y-md">
          <MatchCard
              v-for="match in matchesStore.deletedMatches"
              :key="match.id || match.docId"
              :match="normalizeMatch(match)"
              :tab="'deleted'"
              @save="handleSaveMatch"
              @discard="handleDiscardMatch"
              @contactar="handleContactar"
              @marcar-completado="handleCompleteMatch"
              @descartar="handleDiscardMatch"
              @recover="handleRecoverMatch"
              @delete="handlePermanentDelete"
          />
        </div>
      </div>

      <!-- Chat Modal -->
      <ChatModal
          :show="showChat"
          :other-user-id="selectedUserId"
          :other-username="selectedUsername"
          @close="handleCloseChat"
      />
    </div>
  </AppContainer>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppContainer from '../components/layout/AppContainer.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import ChatModal from '../components/chat/ChatModal.vue'
import { useMatchesStore } from '../stores/matches'

const matchesStore = useMatchesStore()
const activeTab = ref<'nuevos' | 'saved' | 'deleted'>('saved')
const showChat = ref(false)
const selectedUserId = ref('')
const selectedUsername = ref('')

// Cargar matches al montar
onMounted(async () => {
  await matchesStore.loadAllMatches()
})

const totalMatches = computed(() => {
  return matchesStore.newMatches.length + matchesStore.savedMatches.length + matchesStore.deletedMatches.length
})

// Normalizar match: asegurar que tenga propiedades requeridas
const normalizeMatch = (match: any) => {
  return {
    id: match.docId || match.id,
    username: match.otherUsername || 'Usuario',
    location: match.otherLocation || '',
    email: match.otherEmail || '',
    myCard: match.myCard || null,
    otherPreference: match.otherPreference || null,
    createdAt: match.createdAt,
    ...match // Incluir todos los otros campos por si acaso
  }
}

// Event Handlers
const handleSaveMatch = async (match: any) => {
  const originalMatch = matchesStore.newMatches.find(m => (m.docId || m.id) === (match.id || match.docId))
  if (originalMatch) {
    await matchesStore.saveMatch(originalMatch)
  }
}

const handleDiscardMatch = async (matchId: string, tab?: 'new' | 'saved') => {
  const tabToUse = tab || (activeTab.value === 'nuevos' ? 'new' : 'saved')
  const confirmed = confirm('¿Eliminar este match? Se borrará en 15 días.')
  if (confirmed) {
    await matchesStore.discardMatch(matchId, tabToUse as 'new' | 'saved')
  }
}

const handleContactar = (contact: any) => {
  selectedUserId.value = matchesStore.savedMatches.find(m => m.otherUsername === contact.username)?.otherUserId || ''
  selectedUsername.value = contact.username
  showChat.value = true
}

const handleCompleteMatch = async (matchId: string) => {
  const confirmed = confirm('¿Marcar este match como completado?')
  if (confirmed) {
    await matchesStore.completeMatch(matchId)
  }
}

const handleRecoverMatch = async (matchId: string) => {
  const confirmed = confirm('¿Recuperar este match?')
  if (confirmed) {
    await matchesStore.recoverMatch(matchId)
  }
}

const handlePermanentDelete = async (matchId: string) => {
  const confirmed = confirm('⚠️ ¿Eliminar permanentemente?')
  if (confirmed) {
    await matchesStore.permanentDelete(matchId)
  }
}

const handleCloseChat = () => {
  showChat.value = false
}
</script>

<style scoped>
/* All styles in global style.css */
</style>