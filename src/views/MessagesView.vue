<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import ChatModal from '../components/chat/ChatModal.vue';
import { useMessagesStore } from '../stores/messages';
import { useAuthStore } from '../stores/auth';

const messagesStore = useMessagesStore();
const authStore = useAuthStore();

const showChat = ref(false);
const selectedUserId = ref('');
const selectedUsername = ref('');
const filterQuery = ref('');

const conversations = computed(() => messagesStore.conversations);
const loading = computed(() => messagesStore.loading);

const filteredConversations = computed(() => {
  if (!filterQuery.value) return conversations.value;

  const query = filterQuery.value.toLowerCase();
  return conversations.value.filter(conv => {
    const otherParticipant = Object.entries(conv.participantNames).find(
        ([id]) => id !== authStore.user?.id
    );
    return otherParticipant?.[1]?.toLowerCase().includes(query);
  });
});

const getOtherParticipantInfo = (conv: any): { username: string; userId: string } => {
  const entry = Object.entries(conv.participantNames as Record<string, string>).find(
      ([id]) => id !== authStore.user?.id
  );
  return {
    username: entry?.[1] || 'Unknown',
    userId: entry?.[0] || '',
  };
};

const getLastMessagePreview = (conv: any) => {
  if (!conv.lastMessage) return 'Sin mensajes aún...';
  const preview = conv.lastMessage.substring(0, 50);
  return preview.length < conv.lastMessage.length ? preview + '...' : preview;
};

const handleOpenChat = (userId: string, username: string) => {
  selectedUserId.value = userId;
  selectedUsername.value = username;
  showChat.value = true;
};

const closeChatModal = () => {
  showChat.value = false;
  selectedUserId.value = '';
  selectedUsername.value = '';
};

onMounted(async () => {
  await messagesStore.loadConversations();
});
</script>

<template>
  <AppContainer>
    <div class="max-w-2xl">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">MENSAJES</h1>
        <p class="text-small md:text-body text-silver-70">
          {{ conversations.length }} conversaciones activas
        </p>
      </div>

      <!-- Search -->
      <div class="mb-6">
        <input
            v-model="filterQuery"
            type="text"
            placeholder="Buscar por usuario..."
            class="w-full bg-primary border border-silver px-4 py-3 text-body text-silver placeholder:text-silver-50 focus:outline-none focus:border-2 focus:border-neon transition-fast"
        />
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center py-16">
        <BaseLoader size="large" />
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredConversations.length === 0" class="border border-silver-30 p-8 md:p-12 text-center">
        <p class="text-body text-silver-70 mb-2">
          {{ filterQuery ? 'No se encontraron conversaciones' : 'No tienes mensajes aún' }}
        </p>
        <p class="text-small text-silver-50">
          {{ filterQuery ? 'Intenta con otro nombre' : 'Cuando contactes usuarios, aparecerán aquí' }}
        </p>
      </div>

      <!-- Conversations list -->
      <div v-else class="space-y-3">
        <div
            v-for="conv in filteredConversations"
            :key="conv.id"
            @click="handleOpenChat(getOtherParticipantInfo(conv).userId, getOtherParticipantInfo(conv).username)"
            class="bg-primary border border-silver-30 p-4 md:p-6 hover:border-neon cursor-pointer transition-fast"
        >
          <div class="flex items-start justify-between mb-2">
            <h3 class="text-body font-bold text-silver">
              @{{ getOtherParticipantInfo(conv).username }}
            </h3>
            <span v-if="conv.unreadCount > 0" class="bg-neon text-primary text-tiny font-bold px-2 py-1">
              {{ conv.unreadCount }}
            </span>
          </div>

          <p class="text-small text-silver-70 mb-2">
            {{ getLastMessagePreview(conv.lastMessage) }}
          </p>

          <p class="text-tiny text-silver-50">
            {{ conv.lastMessageTime?.toLocaleTimeString() || 'Sin mensajes' }}
          </p>
        </div>
      </div>

      <!-- Chat Modal -->
      <ChatModal
          :show="showChat"
          :other-user-id="selectedUserId"
          :other-username="selectedUsername"
          @close="closeChatModal"
      />
    </div>
  </AppContainer>
</template>