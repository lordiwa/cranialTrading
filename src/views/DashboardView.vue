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
    // Show a toast and close modal
    const toast = useAuthStore; // no-op to satisfy linter if unused
    alert(`Contactando a ${selectedMatch.value.otherUsername}...`);
    showDetailModal.value = false;
  }
};

// helper for visuals (reuse logic consistent with MatchDetailModal)
const getVisualFor = (match: SimpleMatch) => {
  // decide which object to inspect: otherCard / otherPreference / myCard / myPreference
  const obj = match.otherCard || match.otherPreference || match.myCard || match.myPreference;
  if (!obj) return { border: 'border-silver-30', label: '' };
  if (obj.type) {
    const t = String(obj.type).toUpperCase();
    if (t === 'VENDO') return { border: 'border-rust', label: 'VENDO' };
    if (t === 'CAMBIO') return { border: 'border-silver', label: 'CAMBIO' };
    if (t === 'BUSCO') return { border: 'border-neon', label: 'BUSCO' };
  }
  if (obj.status) {
    const s = String(obj.status).toLowerCase();
    if (s === 'sell') return { border: 'border-rust', label: 'VENDO' };
    if (s === 'trade') return { border: 'border-silver', label: 'CAMBIO' };
    if (s === 'busco') return { border: 'border-neon', label: 'BUSCO' };
    if (s === 'collection') return { border: 'border-silver-20', label: 'COLECCIÓN' };
  }
  return { border: 'border-silver-30', label: '' };
};
</script>

<template>
  <AppContainer>
    <div>
      <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">MATCHES</h1>
      <p class="text-small md:text-body text-silver-70 mb-6 md:mb-8">
        Bienvenido, {{ authStore.user?.username }}
      </p>

      <BaseLoader v-if="matchesStore.loading" size="large" />

      <div v-else-if="matchesStore.matches.length === 0" class="border border-silver-30 p-6 md:p-8 text-center">
        <p class="text-small md:text-body text-silver-70">
          No hay matches disponibles aún.
        </p>
        <p class="text-tiny md:text-small text-silver-50 mt-2">
          Agrega cartas a tu colección y establece preferencias para comenzar.
        </p>
      </div>

      <div v-else class="space-y-3 md:space-y-4">
        <div v-for="match in matchesStore.matches" :key="match.id" class="bg-primary border border-silver-30 p-4 md:p-6">
          <div :class="['flex items-center gap-4', 'border', getVisualFor(match).border]">
            <img v-if="match.otherCard?.image || match.myCard?.image" :src="match.otherCard?.image || match.myCard?.image" :alt="match.otherCard?.name || match.myCard?.name || 'card'" class="w-20 h-24 object-cover rounded" />
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <div>
                  <router-link
                    :to="{ name: 'userProfile', params: { userId: match.otherUserId } }"
                    class="text-small md:text-body font-bold text-silver hover:underline"
                  >
                    {{ match.otherUsername }}
                  </router-link>
                  <p class="text-tiny md:text-small text-silver-70 mt-1" v-if="match.type === 'VENDO'">
                    Quiere: {{ match.otherPreference?.name }}
                  </p>
                  <p class="text-tiny md:text-small text-silver-70 mt-1" v-else>
                    Tiene: {{ match.otherCard?.name }}
                  </p>
                </div>
                <div>
                  <span class="block text-tiny text-silver-70 mr-2">{{ getVisualFor(match).label }}</span>
                </div>
              </div>
            </div>
            <div>
              <BaseButton
                  size="small"
                  @click="handleViewDetails(match)"
                  class="w-full md:w-auto"
              >
                VER DETALLES
              </BaseButton>
            </div>
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