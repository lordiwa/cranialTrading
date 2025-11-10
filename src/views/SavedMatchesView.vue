<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import ChatModal from '../components/chat/ChatModal.vue';
import { useSavedMatchesStore } from '../stores/savedMatches';

const savedMatchesStore = useSavedMatchesStore();
const showChat = ref(false);
const selectedUserId = ref('');
const selectedUsername = ref('');

onMounted(() => {
  savedMatchesStore.loadSavedMatches();
});

const handleDelete = async (docId: string) => {
  if (confirm('¿Eliminar este match de tus guardados?')) {
    await savedMatchesStore.deleteSavedMatch(docId);
  }
};

const handleContact = (userId: string, username: string) => {
  selectedUserId.value = userId;
  selectedUsername.value = username;
  showChat.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};

const getVisualFor = (match: any) => {
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
      <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">MIS MATCHES</h1>
      <p class="text-small md:text-body text-silver-70 mb-6 md:mb-8">
        {{ savedMatchesStore.savedMatches.length }} matches guardados
      </p>

      <BaseLoader v-if="savedMatchesStore.loading" size="large" />

      <div v-else-if="savedMatchesStore.savedMatches.length === 0" class="border border-silver-30 p-6 md:p-8 text-center">
        <p class="text-small md:text-body text-silver-70">
          No tienes matches guardados.
        </p>
        <p class="text-tiny md:text-small text-silver-50 mt-2">
          Los matches que marques como "ME INTERESA" aparecerán aquí.
        </p>
      </div>

      <div v-else class="space-y-3 md:space-y-4">
        <div v-for="match in savedMatchesStore.savedMatches" :key="match.docId" class="bg-primary border border-silver-30 p-4 md:p-6">
          <div :class="['flex items-center gap-4', 'border', getVisualFor(match).border]">
            <img v-if="match.otherCard?.image || match.myCard?.image" :src="match.otherCard?.image || match.myCard?.image" :alt="match.otherCard?.name || match.myCard?.name || 'card'" class="w-20 h-24 object-cover rounded" />
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-small md:text-body font-bold text-silver">{{ match.otherUsername }}</p>
                  <p class="text-tiny md:text-small text-silver-70 mt-1" v-if="match.type === 'VENDO'">
                    Quiere: {{ match.otherPreference?.name }}
                  </p>
                  <p class="text-tiny md:text-small text-silver-70 mt-1" v-else>
                    Tiene: {{ match.otherCard?.name }}
                  </p>
                  <p class="text-tiny text-silver-50 mt-2">
                    Guardado: {{ new Date(match.savedAt).toLocaleDateString() }}
                  </p>
                </div>
                <div>
                  <span class="block text-tiny text-silver-70 mr-2">{{ getVisualFor(match).label }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <BaseButton
                  size="small"
                  @click="handleContact(match.otherUserId, match.otherUsername)"
                  class="w-full md:w-auto"
              >
                CONTACTAR
              </BaseButton>
              <BaseButton
                  size="small"
                  variant="secondary"
                  @click="handleDelete(match.docId)"
                  class="w-full md:w-auto"
              >
                ELIMINAR
              </BaseButton>
            </div>
          </div>
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