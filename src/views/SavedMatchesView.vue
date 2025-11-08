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
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
            <div class="flex-1">
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