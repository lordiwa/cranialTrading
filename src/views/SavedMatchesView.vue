<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMatchesStore } from '../stores/matches'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import MatchTabsContainer from '../components/matches/MatchTabsContainer.vue'
import ChatModal from '../components/chat/ChatModal.vue'

const matchesStore = useMatchesStore()

// State
const activeTab = ref<'new' | 'saved' | 'deleted'>('new')
const showChatModal = ref(false)
const selectedUserId = ref('')
const selectedUsername = ref('')

// ✅ DATOS REALES desde store
const newMatches = computed(() => matchesStore.newMatches)
const savedMatches = computed(() => matchesStore.savedMatches)
const deletedMatches = computed(() => matchesStore.deletedMatches)
const loading = computed(() => matchesStore.loading)

// Tabs configuration
const tabs = computed(() => [
  {
    id: 'new' as const,
    label: 'NUEVOS',
    icon: '🔴',
    count: newMatches.value.length
  },
  {
    id: 'saved' as const,
    label: 'MIS MATCHES',
    icon: '⭐',
    count: savedMatches.value.length
  },
  {
    id: 'deleted' as const,
    label: 'ELIMINADOS',
    icon: '🗑️',
    count: deletedMatches.value.length
  }
])

// Current tab matches
const currentMatches = computed(() => {
  switch (activeTab.value) {
    case 'new': return newMatches.value
    case 'saved': return savedMatches.value
    case 'deleted': return deletedMatches.value
    default: return []
  }
})

// ✅ ACCIONES REALES conectadas al store
const handleSaveMatch = async (match: any) => {
  await matchesStore.saveMatch(match)
}

const handleDiscardMatch = async (matchId: string, tab: 'new') => {
  await matchesStore.discardMatch(matchId, tab)
}

const handleContactar = (contact: { username: string; email?: string; location?: string }) => {
  // Extract userId from match (asumiendo que está en otherUserId)
  const match = currentMatches.value.find(m => m.otherUsername === contact.username)
  if (match) {
    selectedUserId.value = match.otherUserId
    selectedUsername.value = contact.username
    showChatModal.value = true
  }
}

const handleMarcarCompletado = async (matchId: string) => {
  const confirmed = confirm('¿Marcar este match como completado? Se eliminará permanentemente.')
  if (confirmed) {
    await matchesStore.completeMatch(matchId)
  }
}

const handleDescartar = async (matchId: string) => {
  await matchesStore.discardMatch(matchId, 'saved')
}

const handleRecuperar = async (matchId: string) => {
  await matchesStore.recoverMatch(matchId)
}

const handleDeletePermanent = async (matchId: string) => {
  const confirmed = confirm('¿Eliminar permanentemente este match? Esta acción no se puede deshacer.')
  if (confirmed) {
    await matchesStore.permanentDelete(matchId)
  }
}

const handleTabChange = (tabId: 'new' | 'saved' | 'deleted') => {
  activeTab.value = tabId
}

const closeChatModal = () => {
  showChatModal.value = false
  selectedUserId.value = ''
  selectedUsername.value = ''
}

// ✅ CARGAR DATOS AL MONTAR
onMounted(async () => {
  await matchesStore.loadAllMatches()
})
</script>

<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="mb-lg md:mb-xl">
        <h1 class="text-h2 md:text-h1 font-bold text-silver mb-sm">MIS MATCHES</h1>
        <p class="text-small md:text-body text-silver-70">
          {{ newMatches.length + savedMatches.length + deletedMatches.length }} matches totales
        </p>
      </div>

      <!-- Tabs -->
      <MatchTabsContainer
          v-model="activeTab"
          :tabs="tabs"
          @tab-change="handleTabChange"
      />

      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center items-center py-xl">
        <BaseLoader size="large" />
      </div>

      <!-- Empty state -->
      <div v-else-if="currentMatches.length === 0" class="border border-silver-30 p-8 md:p-12 text-center">
        <p class="text-body text-silver-70">
          {{ activeTab === 'new' ? 'No tienes matches nuevos' :
            activeTab === 'saved' ? 'No tienes matches guardados' :
                'No tienes matches eliminados' }}
        </p>
        <p class="text-small text-silver-50 mt-2">
          {{ activeTab === 'new' ? 'Los nuevos matches aparecerán aquí cuando haya coincidencias.' :
            activeTab === 'saved' ? 'Guarda matches interesantes para contactar a los usuarios.' :
                'Los matches eliminados se borrarán permanentemente después de 15 días.' }}
        </p>
      </div>

      <!-- Matches list -->
      <div v-else class="space-y-md">
        <MatchCard
            v-for="match in currentMatches"
            :key="match.docId || match.id"
            :match="match"
            :tab="activeTab"
            @save="handleSaveMatch"
            @discard="handleDiscardMatch"
            @contactar="handleContactar"
            @marcar-completado="handleMarcarCompletado"
            @descartar="handleDescartar"
            @recover="handleRecuperar"
            @delete="handleDeletePermanent"
        />
      </div>

      <!-- Chat Modal -->
      <ChatModal
          :show="showChatModal"
          :other-user-id="selectedUserId"
          :other-username="selectedUsername"
          @close="closeChatModal"
      />
    </div>
  </AppContainer>
</template>