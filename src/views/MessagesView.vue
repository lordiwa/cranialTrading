<script setup lang="ts">
// TASK-091 — Messages split-pane v2 (design→app v2 F3, cranial-design/prototype/20-messages-*.html).
// Desktop: persistent split-pane (list 320px + thread). Mobile: list → full-screen thread overlay.
// No modal — replaces the previous ChatModal-based inbox (ChatModal.vue itself is untouched; it's
// still used elsewhere as a quick-chat entry point from matches/profile/contacts).
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import IconV2 from '../components/ui/IconV2.vue';
import MessageThread from '../components/chat/MessageThread.vue';
import { useMessagesStore } from '../stores/messages';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import { getAvatarUrlForUser } from '../utils/avatar';
import { sumUnreadCounts } from '../utils/messageUnread';
import type { Conversation } from '../types/message';

const messagesStore = useMessagesStore();
const authStore = useAuthStore();
const { t } = useI18n();

const filterQuery = ref('');
const selectedConversation = ref<Conversation | null>(null);

const conversations = computed(() => messagesStore.conversations);
const loading = computed(() => messagesStore.loading);
const loadError = computed(() => messagesStore.loadError);
const totalUnread = computed(() => sumUnreadCounts(conversations.value));

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

const getOtherParticipantInfo = (conv: Conversation): { username: string; userId: string; avatarUrl: string | null } => {
  const entry = Object.entries(conv.participantNames).find(
      ([id]) => id !== authStore.user?.id
  );
  const otherUserId = entry?.[0] ?? '';
  // eslint-disable-next-line security/detect-object-injection
  const avatarUrl = conv.participantAvatars?.[otherUserId] ?? null;
  return {
    username: entry?.[1] ?? 'Unknown',
    userId: otherUserId,
    avatarUrl,
  };
};

const getLastMessagePreview = (lastMessage: string | undefined): string => {
  if (!lastMessage) return t('messages.chat.noMessages');
  return lastMessage.length > 50 ? lastMessage.substring(0, 50) + '...' : lastMessage;
};

// Compact relative time ("2m", "1h", "3d") for the conversation list, per proto fidelity.
const timeAgo = (date: Date | undefined): string => {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('messages.time.now');
  if (mins < 60) return `${mins}${t('messages.time.minutesShort')}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${t('messages.time.hoursShort')}`;
  const days = Math.floor(hours / 24);
  return `${days}${t('messages.time.daysShort')}`;
};

const selectedInfo = computed(() =>
    selectedConversation.value ? getOtherParticipantInfo(selectedConversation.value) : null
);

const selectConversation = (conv: Conversation) => {
  if (selectedConversation.value?.id === conv.id) return;
  selectedConversation.value = conv;
};

const closeThread = () => {
  selectedConversation.value = null;
  messagesStore.stopListeningMessages();
};

const handleRetry = () => {
  void messagesStore.loadConversations();
};

onMounted(() => {
  void messagesStore.loadConversations();
});

onUnmounted(() => {
  messagesStore.stopListeningMessages();
});
</script>

<template>
  <AppContainer>
    <!-- Page head -->
    <div class="flex items-end justify-between gap-4 mb-5">
      <div>
        <p class="text-[11px] font-bold tracking-[.18em] uppercase text-neon">{{ t('messages.kicker') }}</p>
        <h1 class="font-display text-h2 md:text-h1 font-bold text-silver">{{ t('messages.title') }}</h1>
      </div>
      <p v-if="!loading && !loadError && conversations.length > 0" class="text-small text-silver-50 text-right">
        <span class="font-display font-bold text-neon">{{ totalUnread }}</span> {{ t('messages.unreadLabel') }}
        <span class="hidden md:inline"> · {{ conversations.length }} {{ t('messages.subtitle') }}</span>
      </p>
    </div>

    <!-- Initial loading -->
    <div v-if="loading && conversations.length === 0 && !loadError" class="flex justify-center py-16">
      <BaseLoader size="large" />
    </div>

    <!-- Error state with retry -->
    <div
        v-else-if="loadError"
        class="bg-surface-1 border border-line rounded-lg p-8 md:p-10 flex flex-col items-center gap-3 text-center"
    >
      <IconV2 name="sync" :size="32" class="text-silver-30" />
      <p class="text-small text-silver-50 max-w-sm">{{ t('messages.errors.loadErrorHint') }}</p>
      <button
          type="button"
          data-testid="messages-error-retry"
          class="inline-flex items-center gap-2 min-h-11 px-5 rounded-md border border-neon text-neon font-bold text-tiny uppercase tracking-wide hover:bg-neon-10 hover:shadow-glow-neon transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
          @click="handleRetry"
      >
        <IconV2 name="sync" :size="15" />
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <!-- Zero conversations -->
    <div
        v-else-if="conversations.length === 0"
        data-testid="messages-empty-state"
        class="bg-surface-1 border border-line rounded-lg p-8 md:p-10 flex flex-col items-center gap-3 text-center"
    >
      <IconV2 name="chat" :size="32" class="text-silver-30" />
      <p class="text-small text-silver-50 max-w-sm">{{ t('messages.empty.whenContact') }}</p>
      <router-link
          to="/saved-matches"
          data-testid="messages-empty-cta"
          class="inline-flex items-center gap-2 min-h-11 px-5 rounded-md border border-neon text-neon font-bold text-tiny uppercase tracking-wide hover:bg-neon-10 hover:shadow-glow-neon transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
      >
        <IconV2 name="swap" :size="15" />
        {{ t('messages.empty.cta') }}
      </router-link>
    </div>

    <!-- Content: single conversation-list markup, responsive via Tailwind (no DOM duplication) -->
    <template v-else>
      <div class="md:flex md:h-[600px] md:bg-surface-1 md:border md:border-line md:rounded-lg md:overflow-hidden">
        <!-- Conversation list: full-width flow on mobile, fixed 320px column on desktop.
             Hidden on mobile while a thread is open — the full-screen overlay below covers it,
             and hiding it here keeps it out of the tab/AT order while covered. -->
        <aside
            :class="[
              'flex flex-col md:w-[320px] md:flex-shrink-0 md:border-r md:border-line md:min-h-0',
              selectedConversation ? 'max-md:hidden' : ''
            ]"
        >
          <div class="mb-3 md:mb-0 md:p-4 md:border-b md:border-line">
            <label class="flex items-center gap-2.5 min-h-11 px-3.5 bg-surface-1 border border-line rounded-md transition-all duration-200 ease-v2 focus-within:border-neon focus-within:shadow-glow-neon">
              <IconV2 name="search" :size="18" class="text-silver-30 flex-shrink-0" />
              <input
                  v-model="filterQuery"
                  type="text"
                  data-testid="messages-search-input"
                  :placeholder="t('messages.searchPlaceholder')"
                  :aria-label="t('messages.searchPlaceholder')"
                  class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver placeholder:text-silver-30 text-small"
              />
            </label>
          </div>

          <div class="md:flex-1 md:overflow-y-auto md:min-h-0">
            <p v-if="filteredConversations.length === 0" class="text-small text-silver-50 text-center py-8">
              {{ filterQuery ? t('messages.empty.noResults') : t('messages.empty.noMessages') }}
            </p>

            <button
                v-for="conv in filteredConversations"
                :key="conv.id"
                type="button"
                data-testid="messages-conv-item"
                :aria-current="selectedConversation?.id === conv.id ? 'true' : undefined"
                :class="[
                  'flex items-center gap-3 w-full text-left px-4 py-3 border-b border-line transition-colors duration-200 ease-v2 hover:bg-surface-2',
                  selectedConversation?.id === conv.id ? 'md:bg-surface-2 md:border-l-[3px] md:border-l-neon md:pl-[13px]' : ''
                ]"
                @click="selectConversation(conv)"
            >
              <img
                  :src="getAvatarUrlForUser(getOtherParticipantInfo(conv).username, 76, getOtherParticipantInfo(conv).avatarUrl)"
                  alt=""
                  :class="[
                    'w-11 h-11 md:w-9 md:h-9 rounded-full flex-shrink-0',
                    conv.unreadCount > 0 ? 'ring-2 ring-neon-40' : ''
                  ]"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-silver text-small truncate">@{{ getOtherParticipantInfo(conv).username }}</span>
                  <span class="ml-auto text-tiny text-silver-30 font-display font-tnum flex-shrink-0">{{ timeAgo(conv.lastMessageTime) }}</span>
                </div>
                <p
                    :class="[
                      'text-small truncate mt-0.5',
                      conv.unreadCount > 0 ? 'text-silver-70 font-semibold' : 'text-silver-50'
                    ]"
                >
                  {{ getLastMessagePreview(conv.lastMessage) }}
                </p>
              </div>
              <span
                  v-if="conv.unreadCount > 0"
                  class="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-neon text-primary font-display font-bold text-[11px] flex-shrink-0"
              >
                {{ conv.unreadCount }}
              </span>
            </button>
          </div>
        </aside>

        <!-- Thread: a SINGLE MessageThread instance (one Firestore listener at a time — never
             two mounted copies toggled by CSS visibility). On desktop it's the flex-1 right pane;
             on mobile the same element becomes a fixed full-screen overlay (no modal, no 24rem box). -->
        <div
            v-if="selectedConversation && selectedInfo"
            class="flex flex-col max-md:fixed max-md:inset-0 max-md:z-[60] max-md:bg-primary md:flex-1 md:min-w-0"
        >
          <MessageThread
              :key="selectedConversation.id"
              :conversation-id="selectedConversation.id"
              :other-user-id="selectedInfo.userId"
              :other-username="selectedInfo.username"
              :other-avatar-url="selectedInfo.avatarUrl"
              @back="closeThread"
          />
        </div>
        <div v-else class="hidden md:flex md:flex-1 md:min-w-0 items-center justify-center px-8">
          <p class="text-small text-silver-50 text-center">{{ t('messages.chat.selectPrompt') }}</p>
        </div>
      </div>
    </template>
  </AppContainer>
</template>
