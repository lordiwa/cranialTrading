<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import MatchDetailModal from '../components/matches/MatchDetailModal.vue';
import { useAuthStore } from '../stores/auth';
import { useMatchesStore } from '../stores/matches';
import { SimpleMatch } from '../stores/matches';

const authStore = useAuthStore();
const matchesStore = useMatchesStore();
const selectedMatch = ref<SimpleMatch | null>(null);
const showDetailModal = ref(false);

onMounted(() => {
  matchesStore.findMatches();
});

const handleViewDetails = (match: SimpleMatch) => {
  selectedMatch.value = match;
  showDetailModal.value = true;
};

const handleContact = () => {
  if (selectedMatch.value) {
    console.log('Contact user:', selectedMatch.value.otherUserId);
    // Aquí se puede implementar lógica de contacto (email, chat, etc)
    alert(`Contactando a ${selectedMatch.value.otherUsername}...`);
    showDetailModal.value = false;
  }
};
</script>

<template>
  <AppContainer>
    <div>
      <h1 class="text-h1 font-bold text-silver mb-2">MATCHES DISPONIBLES</h1>
      <p class="text-body text-silver-70 mb-8">
        Bienvenido, {{ authStore.user?.username }}
      </p>

      <BaseLoader v-if="matchesStore.loading" size="large" />

      <div v-else-if="matchesStore.matches.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">
          No hay matches disponibles aún.
        </p>
        <p class="text-small text-silver-50 mt-2">
          Agrega cartas a tu colección y establece preferencias para comenzar.
        </p>
      </div>

      <div v-else class="space-y-4">
        <div v-for="match in matchesStore.matches" :key="match.id" class="bg-primary border border-silver-30 p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-body font-bold text-silver">{{ match.otherUsername }}</p>
              <p class="text-small text-silver-70" v-if="match.type === 'VENDO'">
                Quiere: {{ match.otherPreference?.name }} ({{ match.otherPreference?.edition }})
              </p>
              <p class="text-small text-silver-70" v-else>
                Tiene: {{ match.otherCard?.name }} ({{ match.otherCard?.edition }})
              </p>
            </div>
            <BaseButton
              size="small"
              @click="handleViewDetails(match)"
            >
              VER DETALLES
            </BaseButton>
          </div>
        </div>
      </div>

      <MatchDetailModal
          :show="showDetailModal"
          :match="selectedMatch"
          @close="showDetailModal = false"
          @contact="handleContact"
      />
    </div>
  </AppContainer>
</template>