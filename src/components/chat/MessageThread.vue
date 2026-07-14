<script setup lang="ts">
// TASK-091 — Messages split-pane v2 (design→app v2 F3, cranial-design/prototype/20-messages-*.html).
// Renders one conversation thread. Used inline both in the desktop right pane and the
// mobile full-screen overlay in MessagesView.vue — no modal.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useMessagesStore } from '../../stores/messages'
import { useAuthStore } from '../../stores/auth'
import { useI18n } from '../../composables/useI18n'
import { getAvatarUrlForUser } from '../../utils/avatar'
import IconV2 from '../ui/IconV2.vue'
import BaseLoader from '../ui/BaseLoader.vue'
import type { Message } from '../../types/message'

const props = defineProps<{
  conversationId: string
  otherUserId: string
  otherUsername: string
  otherAvatarUrl: string | null
}>()

const emit = defineEmits<{
  back: []
}>()

const { t, locale } = useI18n()
const messagesStore = useMessagesStore()
const authStore = useAuthStore()

const messageText = ref('')
const isSending = ref(false)
const scrollEl = ref<HTMLDivElement>()

const sortedMessages = computed(() =>
    [...messagesStore.currentMessages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
)

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

const dayLabel = (date: Date): string => {
  const now = new Date()
  if (isSameDay(date, now)) return t('messages.chat.today')
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return t('messages.chat.yesterday')
  return date.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

interface MessageGroup {
  label: string
  messages: Message[]
}

const groupedMessages = computed<MessageGroup[]>(() => {
  const groups: MessageGroup[] = []
  for (const msg of sortedMessages.value) {
    const label = dayLabel(msg.createdAt)
    const last = groups[groups.length - 1]
    if (last?.label === label) {
      last.messages.push(msg)
    } else {
      groups.push({ label, messages: [msg] })
    }
  }
  return groups
})

const scrollToBottom = async () => {
  await nextTick()
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  }
}

const openThread = (conversationId: string) => {
  if (!conversationId) return
  messagesStore.loadConversationMessages(conversationId)
  void scrollToBottom()
}

watch(() => props.conversationId, (id, previousId) => {
  if (id && id !== previousId) openThread(id)
}, { immediate: true })

watch(() => sortedMessages.value.length, () => void scrollToBottom())

onUnmounted(() => {
  messagesStore.stopListeningMessages()
})

const handleSend = async () => {
  const text = messageText.value.trim()
  if (!text || isSending.value) return

  isSending.value = true
  const success = await messagesStore.sendMessage(props.conversationId, props.otherUserId, text)
  if (success) messageText.value = ''
  isSending.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void handleSend()
  }
}

const formatTime = (date: Date): string =>
    date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section class="flex-1 flex flex-col min-w-0 h-full">
    <!-- Thread header -->
    <div class="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-line bg-surface-1 flex-shrink-0">
      <button
          type="button"
          data-testid="messages-thread-back"
          :aria-label="t('common.actions.back')"
          class="md:hidden -ml-1 inline-flex items-center justify-center w-9 h-9 rounded-md text-silver-50 hover:text-silver hover:bg-surface-2 transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
          @click="emit('back')"
      >
        <IconV2 name="chev-l" :size="20" />
      </button>
      <img
          :src="getAvatarUrlForUser(otherUsername, 72, otherAvatarUrl)"
          alt=""
          class="w-9 h-9 rounded-full border border-neon-40 flex-shrink-0"
      />
      <div class="flex-1 min-w-0">
        <p class="font-bold text-silver truncate">@{{ otherUsername }}</p>
      </div>
      <RouterLink
          :to="{ name: 'userProfile', params: { username: otherUsername } }"
          class="hidden sm:inline-flex items-center gap-1.5 min-h-9 px-3 rounded-md border border-line-strong text-tiny font-bold text-silver-70 hover:border-silver-30 hover:text-silver hover:bg-surface-1 transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
      >
        <IconV2 name="eye" :size="15" />
        {{ t('messages.viewProfile') }}
      </RouterLink>
    </div>

    <!-- Messages -->
    <div ref="scrollEl" class="flex-1 overflow-y-auto px-4 md:px-6 py-5 flex flex-col gap-3 bg-primary min-h-0">
      <BaseLoader v-if="messagesStore.loading && sortedMessages.length === 0" size="medium" class="my-8" />

      <div v-else-if="sortedMessages.length === 0" class="flex-1 flex items-center justify-center">
        <p class="text-small text-silver-50 text-center">{{ t('messages.chat.noMessages') }}</p>
      </div>

      <template v-for="group in groupedMessages" :key="group.label + group.messages[0]?.id">
        <div class="self-center text-tiny font-bold uppercase tracking-widest text-silver-30 my-1">
          {{ group.label }}
        </div>
        <div
            v-for="message in group.messages"
            :key="message.id"
            :class="[
              'max-w-[80%] sm:max-w-[64%] rounded-lg px-3.5 py-2.5 text-small leading-snug break-words',
              message.senderId === authStore.user?.id
                ? 'self-end bg-neon-10 border border-neon-40 text-silver rounded-br-sm'
                : 'self-start bg-surface-2 border border-line text-silver rounded-bl-sm'
            ]"
        >
          {{ message.content }}
          <span class="block text-tiny text-silver-30 font-display font-tnum mt-1">{{ formatTime(message.createdAt) }}</span>
        </div>
      </template>
    </div>

    <!-- Composer -->
    <div class="flex items-center gap-3 px-4 md:px-5 py-3 border-t border-line bg-surface-1 flex-shrink-0">
      <label class="flex-1 flex items-center gap-2.5 min-h-11 px-3.5 bg-surface-1 border border-line rounded-md transition-all duration-200 ease-v2 focus-within:border-neon focus-within:shadow-glow-neon">
        <input
            v-model="messageText"
            type="text"
            data-testid="messages-thread-input"
            :placeholder="t('messages.chat.inputPlaceholder')"
            :aria-label="t('messages.chat.inputPlaceholder')"
            :disabled="isSending"
            class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver placeholder:text-silver-30 text-small"
            @keydown="handleKeydown"
        />
      </label>
      <button
          type="button"
          data-testid="messages-thread-send"
          :disabled="!messageText.trim() || isSending"
          class="inline-flex items-center gap-2 min-h-11 px-4 rounded-md bg-neon text-primary font-bold text-small hover:bg-neon/90 hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none focus-visible:outline-none focus-visible:shadow-glow-neon flex-shrink-0"
          @click="handleSend"
      >
        <IconV2 name="send" :size="17" />
        {{ t('messages.send') }}
      </button>
    </div>
  </section>
</template>
