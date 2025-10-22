<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import { useMessagesStore } from '../../stores/messages';
import { useAuthStore } from '../../stores/auth';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';
import BaseInput from '../ui/BaseInput.vue';
import BaseLoader from '../ui/BaseLoader.vue';

const props = defineProps<{
  show: boolean;
  otherUserId: string;
  otherUsername: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const messagesStore = useMessagesStore();
const authStore = useAuthStore();
const messageInput = ref('');
const isSending = ref(false);
const conversationId = ref('');
const messagesContainer = ref<HTMLDivElement>();

const sortedMessages = computed(() => {
  return messagesStore.currentMessages.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
});

const handleOpenChat = async () => {
  if (!authStore.user) {
    console.log('[CHAT] No user, skipping chat open');
    return;
  }

  console.log('[CHAT] Opening chat with:', props.otherUserId);

  // Crear o obtener conversación
  const convId = await messagesStore.createConversation(props.otherUserId, props.otherUsername);
  console.log('[CHAT] Conversation ID:', convId);

  if (!convId) {
    console.error('[CHAT] Failed to create/get conversation');
    return;
  }

  conversationId.value = convId;

  // Cargar mensajes
  messagesStore.loadConversationMessages(convId);
};

const handleSendMessage = async () => {
  if (!messageInput.value.trim()) {
    console.log('[CHAT] Empty message');
    return;
  }

  if (!conversationId.value) {
    console.log('[CHAT] No conversation ID');
    return;
  }

  console.log('[CHAT] Sending message...');
  isSending.value = true;

  const success = await messagesStore.sendMessage(
    conversationId.value,
    props.otherUserId,
    messageInput.value
  );

  console.log('[CHAT] Send result:', success);

  if (success) {
    messageInput.value = '';
    // Scroll al último mensaje
    await nextTick();
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  }

  isSending.value = false;
};

const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSendMessage();
  }
};

const handleClose = () => {
  messagesStore.stopListeningMessages();
  emit('close');
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    handleOpenChat();
  }
});

onUnmounted(() => {
  messagesStore.stopListeningMessages();
});
</script>

<template>
  <BaseModal :show="show" @close="handleClose">
    <div class="w-full max-w-md h-96 flex flex-col bg-primary-dark rounded">
      <!-- Header -->
      <div class="p-4 border-b border-silver-30 flex items-center justify-between">
        <div>
          <p class="text-body font-bold text-silver">{{ otherUsername }}</p>
          <p class="text-tiny text-silver-50">En línea</p>
        </div>
        <button @click="handleClose" class="text-silver-70 hover:text-silver text-xl">
          ✕
        </button>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
        <BaseLoader v-if="messagesStore.loading" size="small" />

        <div v-if="sortedMessages.length === 0 && !messagesStore.loading" class="text-center py-8">
          <p class="text-small text-silver-50">
            No hay mensajes aún. ¡Sé el primero en escribir!
          </p>
        </div>

        <div v-for="message in sortedMessages" :key="message.id" class="flex" :class="{
          'justify-end': message.senderId === authStore.user?.id,
          'justify-start': message.senderId !== authStore.user?.id,
        }">
          <div :class="{
            'bg-neon text-primary': message.senderId === authStore.user?.id,
            'bg-silver-30 text-silver': message.senderId !== authStore.user?.id,
          }" class="max-w-xs px-4 py-2 rounded-lg">
            <p class="text-small break-words">{{ message.content }}</p>
            <p class="text-tiny mt-1 opacity-70">
              {{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="p-4 border-t border-silver-30 flex gap-2">
        <BaseInput
            v-model="messageInput"
            placeholder="Escribe un mensaje..."
            @keypress="handleKeyPress"
            :disabled="isSending"
        />
        <BaseButton
            size="small"
            :disabled="!messageInput.trim() || isSending || !conversationId"
            @click="handleSendMessage"
        >
          {{ isSending ? '...' : 'ENVIAR' }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
/* Scroll personalizado */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgb(var(--color-silver-30));
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgb(var(--color-silver-50));
}
</style>
