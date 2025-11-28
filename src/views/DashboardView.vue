<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import MatchTabsContainer from '../components/matches/MatchTabsContainer.vue';
import MatchCard from '../components/matches/MatchCard.vue';
import MatchDetailModal from '../components/matches/MatchDetailModal.vue';
import ChatModal from '../components/chat/ChatModal.vue';
import { useAuthStore } from '../stores/auth';
import { useMatchesStore, type SimpleMatch } from '../stores/matches';

const authStore = useAuthStore();
const matchesStore = useMatchesStore();

const activeTab = ref<'new' | 'saved' | 'deleted'>('new');
const selectedMatch = ref<SimpleMatch | null>(null);
const showDetailModal = ref(false);
const showChat = ref(false);
const selectedUserId = ref('');
const selectedUsername = ref('');

onMounted(async () => {
  await matchesStore.loadAllMatches();
});

// Tabs configuration
const tabs = computed(() => [
  {
    id: 'new' as const,
    label: 'NUEVOS',
    icon: '🔴',
    count: matchesStore.newMatches.length,
  },
  {
    id: 'saved' as const,
    label: 'MIS MATCHES',
    icon: '💾',
    count: matchesStore.savedMatches.length,
  },
  {
    id: 'deleted' as const,
    label: 'ELIMINADOS',
    icon: '🗑️',
    count: matchesStore.deletedMatches.length,
  },
]);

// Get current tab matches
const currentMatches = computed(() => {
  switch (activeTab.value) {
    case 'new': return matchesStore.newMatches;
    case 'saved': return matchesStore.savedMatches;
    case 'deleted': return matchesStore.deletedMatches;
  }
});

// Header text by tab
const tabTitle = computed(() => {
  switch (activeTab.value) {
    case 'new': return 'NUEVOS MATCHES';
    case 'saved': return 'MIS MATCHES GUARDADOS';
    case 'deleted': return 'MATCHES ELIMINADOS';
  }
});

const tabDescription = computed(() => {
  switch (activeTab.value) {
    case 'new': return 'Matches que no has gestionado. Se borran automáticamente en 15 días.';
    case 'saved': return 'Matches a los que marcaste como "Me interesa". Contacta para negociar.';
    case 'deleted': return 'Matches que eliminaste. Se borran permanentemente en 15 días.';
  }
});

// Handlers
const handleTabChange = (tabId: 'new' | 'saved' | 'deleted') => {
  activeTab.value = tabId;
};

const handleSaveMatch = async (match: SimpleMatch) => {
  await matchesStore.saveMatch(match);
};

const handleDiscardMatch = async (matchId: string, tab: 'new' | 'saved') => {
  const confirmed = tab === 'new'
      ? confirm('¿Eliminar este match? Se borrará en 15 días.')
      : confirm('¿Eliminar este match de tus guardados? Se borrará en 15 días.');

  if (confirmed) {
    await matchesStore.discardMatch(matchId, tab);
  }
};

const handleContactMatch = (match: SimpleMatch) => {
  selectedUserId.value = match.otherUserId;
  selectedUsername.value = match.otherUsername;
  showChat.value = true;
};

const handleCompleteMatch = async (matchId: string) => {
  const confirmed = confirm('¿Marcar este match como completado? Se eliminará de tu lista.');
  if (confirmed) {
    await matchesStore.completeMatch(matchId);
  }
};

const handleRecoverMatch = async (matchId: string) => {
  const confirmed = confirm('¿Recuperar este match a tu lista de nuevos?');
  if (confirmed) {
    await matchesStore.recoverMatch(matchId);
  }
};

const handlePermanentDelete = async (matchId: string) => {
  const confirmed = confirm('⚠️ ¿Eliminar permanentemente? Esta acción no se puede deshacer.');
  if (confirmed) {
    await matchesStore.permanentDelete(matchId);
  }
};

const handleViewDetails = (match: SimpleMatch) => {
  selectedMatch.value = match;
  showDetailModal.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};

const unseenCount = computed(() => matchesStore.getUnseenCount());
</script>

<template>
  <AppContainer>
    <div>
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-md md:gap-lg mb-lg md:mb-xl">
        <!-- CHANGE: gap-4 → gap-md, mb-6 md:mb-8 → mb-lg md:mb-xl -->
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver">MATCHES</h1>
          <p class="text-small md:text-body text-silver-70 mt-sm">
            <!-- ADDED: mt-sm for spacing after title -->
            {{ tabDescription }}
          </p>
        </div>
      </div>

      <!-- Tabs -->
      <MatchTabsContainer :tabs="tabs" @tab-change="handleTabChange" />

      <!-- Content -->
      <BaseLoader v-if="matchesStore.loading" size="large" />

      <div v-else-if="currentMatches.length === 0" class="border border-silver-30 p-6 md:p-8 text-center">
        <p class="text-small md:text-body text-silver-70">
          <span v-if="activeTab === 'new'">No hay matches nuevos por el momento.</span>
          <span v-else-if="activeTab === 'saved'">No tienes matches guardados.</span>
          <span v-else>No hay matches eliminados.</span>
        </p>
        <p class="text-tiny md:text-small text-silver-50 mt-2">
          <span v-if="activeTab === 'new'">Agrega cartas a tu colección y establece preferencias para generar matches.</span>
          <span v-else-if="activeTab === 'saved'">Marca matches como "Me interesa" para guardarlos aquí.</span>
          <span v-else>Los matches que elimines aparecerán aquí durante 15 días.</span>
        </p>
      </div>

      <div v-else class="space-y-3 md:space-y-4">
        <MatchCard
            v-for="match in currentMatches"
            :key="match.docId || match.id"
            :match="match"
            :tab="activeTab"
            @save="handleSaveMatch"
            @discard="handleDiscardMatch"
            @contact="handleContactMatch"
            @complete="handleCompleteMatch"
            @recover="handleRecoverMatch"
            @delete="handlePermanentDelete"
        />
      </div>

      <!-- Modals -->
      <MatchDetailModal
          :show="showDetailModal"
          :match="selectedMatch"
          @close="showDetailModal = false"
      />

      <ChatModal
          :show="showChat"
          :other-user-id="selectedUserId"
          :other-username="selectedUsername"
          @close="handleCloseChat"
      />
    </div>
  </AppContainer>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>