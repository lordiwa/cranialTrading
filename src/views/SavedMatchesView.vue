<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMatchesStore } from '../stores/matches'
import { useContactsStore } from '../stores/contacts'
import { db } from '../services/firebase'
import { doc, getDoc } from 'firebase/firestore'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import SpriteIcon from '../components/ui/SpriteIcon.vue'

const matchesStore = useMatchesStore()
const contactsStore = useContactsStore()

// State
const activeTab = ref<'new' | 'saved' | 'deleted'>('new')
const matchesWithEmails = ref<any[]>([])
const loading = ref(false)

// ✅ DATOS REALES desde store
const newMatches = computed(() => matchesStore.newMatches)
const savedMatches = computed(() => matchesStore.savedMatches)
const deletedMatches = computed(() => matchesStore.deletedMatches)

// Tabs configuration
const tabs = computed(() => [
  {
    id: 'new' as const,
    label: 'NUEVOS',
    icon: 'dot',
    count: newMatches.value.length
  },
  {
    id: 'saved' as const,
    label: 'MIS MATCHES',
    icon: 'star',
    count: savedMatches.value.length
  },
  {
    id: 'deleted' as const,
    label: 'ELIMINADOS',
    icon: 'trash',
    count: deletedMatches.value.length
  }
])

// Current tab matches
const currentMatches = computed(() => {
  switch (activeTab.value) {
    case 'new': return newMatches.value
    case 'saved': return matchesWithEmails.value
    case 'deleted': return deletedMatches.value
    default: return []
  }
})

// ✅ CARGAR EMAILS para matches guardados
const loadSavedMatchesWithEmails = async () => {
  loading.value = true
  try {
    const matchesWithData = await Promise.all(
        savedMatches.value.map(async (match) => {
          try {
            // Obtener email del usuario desde Firestore
            const userRef = doc(db, 'users', match.otherUserId)
            const userSnap = await getDoc(userRef)

            if (userSnap.exists()) {
              const userData = userSnap.data()
              return {
                ...match,
                otherEmail: userData.email || '',
              }
            }
          } catch (err) {
            console.error(`Error cargando email para ${match.otherUserId}:`, err)
          }

          return {
            ...match,
            otherEmail: '',
          }
        })
    )

    matchesWithEmails.value = matchesWithData
  } finally {
    loading.value = false
  }
}

// ✅ ACCIONES REALES conectadas al store
const handleSaveMatch = async (match: any) => {
  await matchesStore.saveMatch(match)
  // Recargar emails después de guardar
  await loadSavedMatchesWithEmails()
}

const handleDiscardMatch = async (matchId: string) => {
  const tab = activeTab.value === 'new' ? 'new' : 'saved'
  await matchesStore.discardMatch(matchId, tab)
  // Recargar emails después de descartar
  await loadSavedMatchesWithEmails()
}

const handleTabChange = (tabId: 'new' | 'saved' | 'deleted') => {
  activeTab.value = tabId
}

// ✅ CARGAR DATOS AL MONTAR
onMounted(async () => {
  await matchesStore.loadAllMatches()
  await contactsStore.loadSavedContacts()
  await loadSavedMatchesWithEmails()
})

onUnmounted(() => {
  matchesStore.cleanExpiredMatches()
  contactsStore.stopListeningContacts()
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
      <div class="flex gap-sm md:gap-md mb-lg md:mb-xl border-b border-silver-20 overflow-x-auto">
        <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="handleTabChange(tab.id)"
            :class="[
            'pb-md border-b-2 transition-fast whitespace-nowrap font-bold text-small md:text-body flex items-center gap-sm',
            activeTab === tab.id
              ? 'border-neon text-neon'
              : 'border-transparent text-silver-70 hover:text-silver'
          ]"
        >
          <SpriteIcon :name="tab.icon" size="small" />
          <span>{{ tab.label }}</span>
          <span v-if="tab.count > 0" class="text-tiny bg-neon text-primary px-sm py-xs font-bold">
            {{ tab.count }}
          </span>
        </button>
      </div>

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

      <!-- Matches list - ✅ REUTILIZA MatchCard.vue -->
      <div v-else class="space-y-md">
        <MatchCard
            v-for="match in currentMatches"
            :key="match.docId || match.id"
            :match="match"
            :match-index="currentMatches.indexOf(match) + 1"
            :tab="activeTab"
            @save="handleSaveMatch"
            @discard="handleDiscardMatch"
        />
      </div>
    </div>
  </AppContainer>
</template>