<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import ChatModal from '../components/chat/ChatModal.vue';
import { useMessagesStore } from '../stores/messages';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import { getAvatarUrlForUser } from '../utils/avatar';

const messagesStore = useMessagesStore();
const authStore = useAuthStore();
const { t } = useI18n();

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

const getOtherParticipantInfo = (conv: any): { username: string; userId: string; avatarUrl: string | null } => {
  const entry = Object.entries(conv.participantNames as Record<string, string>).find(
      ([id]) => id !== authStore.user?.id
  );
  const otherUserId = entry?.[0] || '';
  const avatarUrl = conv.participantAvatars?.[otherUserId] || null;
  return {
    username: entry?.[1] || 'Unknown',
    userId: otherUserId,
    avatarUrl,
  };
};

const getLastMessagePreview = (lastMessage: any) => {
  if (!lastMessage) return 'Sin mensajes aún...';
  const text = typeof lastMessage === 'string' ? lastMessage : lastMessage.content || '';
  const preview = text.substring(0, 50);
  return preview.length < text.length ? preview + '...' : preview;
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
        <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">{{ t('messages.title') }}</h1>
        <p class="text-small md:text-body text-silver-70">
          {{ conversations.length }} {{ t('messages.subtitle') }}
        </p>
      </div>

      <!-- Search -->
      <div class="mb-6">
        <input
            v-model="filterQuery"
            type="text"
            :placeholder="t('messages.searchPlaceholder')"
            class="w-full bg-primary border border-silver px-4 py-3 text-body text-silver placeholder:text-silver-50 focus:outline-none focus:border-2 focus:border-neon transition-fast rounded"
        />
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center py-16">
        <BaseLoader size="large" />
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredConversations.length === 0" class="border border-silver-30 p-8 md:p-12 text-center rounded-md">
        <p class="text-body text-silver-70 mb-2">
          {{ filterQuery ? t('messages.empty.noResults') : t('messages.empty.noMessages') }}
        </p>
        <p class="text-small text-silver-50">
          {{ filterQuery ? t('messages.empty.tryAnother') : t('messages.empty.whenContact') }}
        </p>
      </div>

      <!-- Conversations list -->
      <div v-else class="space-y-3">
        <div
            v-for="conv in filteredConversations"
            :key="conv.id"
            @click="handleOpenChat(getOtherParticipantInfo(conv).userId, getOtherParticipantInfo(conv).username)"
            class="bg-primary border border-silver-30 p-4 md:p-6 hover:border-neon cursor-pointer transition-fast rounded-md"
        >
          <div class="flex items-start justify-between mb-2">
            <h3 class="text-body font-bold text-silver flex items-center gap-2">
              <img
                  :src="getAvatarUrlForUser(getOtherParticipantInfo(conv).username, 28, getOtherParticipantInfo(conv).avatarUrl)"
                  alt=""
                  class="w-7 h-7 rounded-full"
              />
              @{{ getOtherParticipantInfo(conv).username }}
            </h3>
            <span v-if="conv.unreadCount > 0" class="bg-neon text-primary text-tiny font-bold px-2 py-1 rounded-sm">
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