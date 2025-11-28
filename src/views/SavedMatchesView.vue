<template>
  <div class="min-h-screen bg-primary p-md md:p-lg">
    <!-- Header -->
    <div class="mb-lg md:mb-xl">
      <h1 class="text-h1 text-silver mb-sm">MIS MATCHES</h1>
      <p class="text-body text-silver-70">{{ matches.length }} matches guardados</p>
    </div>

    <!-- Tabs -->
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
          <span class="text-tiny">{{ newMatches.length }}</span>
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
          <span class="text-tiny">{{ savedMatches.length }}</span>
        </span>
      </button>
      <button
          @click="activeTab = 'ignored'"
          :class="[
          'pb-md border-b-2 transition-fast',
          activeTab === 'ignored' ? 'border-neon text-neon' : 'border-transparent text-silver-70 hover:text-silver'
        ]"
      >
        <span class="flex items-center gap-sm">
          🗑️ ELIMINADOS
          <span class="text-tiny">{{ ignoredMatches.length }}</span>
        </span>
      </button>
    </div>

    <!-- Tab Content -->
    <div>
      <!-- Nuevos Tab -->
      <div v-if="activeTab === 'nuevos'">
        <div v-if="newMatches.length === 0" class="text-center py-xl">
          <p class="text-body text-silver-70">No tienes matches nuevos</p>
        </div>
        <div v-else class="space-y-md">
          <SavedMatchCard
              v-for="match in newMatches"
              :key="match.id"
              :match="match"
              @contactar="openContactModal"
              @marcar-completado="markCompleted"
              @descartar="discardMatch"
          />
        </div>
      </div>

      <!-- Saved Tab (MIS MATCHES) -->
      <div v-if="activeTab === 'saved'">
        <div v-if="savedMatches.length === 0" class="text-center py-xl">
          <p class="text-body text-silver-70">No tienes matches guardados</p>
        </div>
        <div v-else class="space-y-md">
          <SavedMatchCard
              v-for="match in savedMatches"
              :key="match.id"
              :match="match"
              @contactar="openContactModal"
              @marcar-completado="markCompleted"
              @descartar="discardMatch"
          />
        </div>
      </div>

      <!-- Ignored Tab -->
      <div v-if="activeTab === 'ignored'">
        <div v-if="ignoredMatches.length === 0" class="text-center py-xl">
          <p class="text-body text-silver-70">No tienes matches eliminados</p>
        </div>
        <div v-else class="space-y-md">
          <SavedMatchCard
              v-for="match in ignoredMatches"
              :key="match.id"
              :match="match"
              @contactar="openContactModal"
              @marcar-completado="markCompleted"
              @descartar="discardMatch"
          />
        </div>
      </div>
    </div>

    <!-- Contact Modal -->
    <ContactModal
        v-if="showContactModal"
        :contact="selectedContact"
        @close="closeContactModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import SavedMatchCard from '@/components/matches/SavedMatchCard.vue'
import ContactModal from '@/components/modals/ContactModal.vue'

interface Match {
  id: string
  userId: string
  username: string
  cardsOffering: string[]
  cardsReceiving: string[]
  email: string
  location: string
  status: 'new' | 'saved' | 'ignored'
  createdAt: Date
}

interface Contact {
  username: string
  email: string
  location: string
}

const activeTab = ref<'nuevos' | 'saved' | 'ignored'>('saved')
const showContactModal = ref(false)
const selectedContact = ref<Contact | null>(null)

// Mock data - replace with actual Firestore data
const matches = ref<Match[]>([
  {
    id: '1',
    userId: 'user123',
    username: 'srparca',
    cardsOffering: ['Wooded Foothills'],
    cardsReceiving: ['Black Lotus', 'Mox Pearl'],
    email: 'srparca@example.com',
    location: 'Buenos Aires, Argentina',
    status: 'saved',
    createdAt: new Date('2025-11-27')
  },
  // Add more matches as needed
])

const newMatches = computed(() => matches.value.filter(m => m.status === 'new'))
const savedMatches = computed(() => matches.value.filter(m => m.status === 'saved'))
const ignoredMatches = computed(() => matches.value.filter(m => m.status === 'ignored'))

const openContactModal = (contact: Contact) => {
  selectedContact.value = contact
  showContactModal.value = true
}

const closeContactModal = () => {
  showContactModal.value = false
  selectedContact.value = null
}

const markCompleted = (matchId: string) => {
  const match = matches.value.find(m => m.id === matchId)
  if (match) {
    match.status = 'saved'
  }
}

const discardMatch = (matchId: string) => {
  const match = matches.value.find(m => m.id === matchId)
  if (match) {
    match.status = 'ignored'
  }
}
</script>

<style scoped>
/* All styles in global style.css */
</style>