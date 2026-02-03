<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useMessagesStore } from '../../stores/messages';
import { useAuthStore } from '../../stores/auth';
import { useToastStore } from '../../stores/toast';
import { useI18n } from '../../composables/useI18n';
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

const { t } = useI18n();

const messagesStore = useMessagesStore();
const authStore = useAuthStore();
const toastStore = useToastStore();

// State
const messageInput = ref('');
const isSending = ref(false);
const conversationId = ref('');
const messagesContainer = ref<HTMLDivElement>();

// ✅ FIX 1: Guardar conversationId para NO recalcular cada vez que show cambia
const isConversationReady = ref(false);

const sortedMessages = computed(() => {
  return [...messagesStore.currentMessages].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
});

// ✅ FIX 2: CAMBIO - Inicializar conversación UNA SOLA VEZ (no en watch)
const initializeConversation = async () => {
  if (!authStore.user || !props.otherUserId || conversationId.value) {
    // Ya inicializada o datos incompletos
    return;
  }

  try {
    const convId = await messagesStore.createConversation(
        props.otherUserId,
        props.otherUsername
    );

    if (!convId) {
      toastStore.show(t('messages.errors.createError'), 'error');
      return;
    }

    conversationId.value = convId;
    isConversationReady.value = true;

    // Cargar mensajes con listener
    messagesStore.loadConversationMessages(convId);
  } catch (error) {
    console.error('Error inicializando conversación:', error);
    toastStore.show(t('messages.errors.listenError'), 'error');
  }
};

const handleSendMessage = async () => {
  if (!messageInput.value.trim()) return;
  if (!conversationId.value) return;

  isSending.value = true;

  const success = await messagesStore.sendMessage(
      conversationId.value,
      props.otherUserId,
      messageInput.value
  );

  if (success) {
    messageInput.value = ''; // ✅ FIX 5: Limpiar input después de enviar
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
  // ✅ FIX 3: Cleanup al cerrar
  messagesStore.stopListeningMessages();

  // ✅ FIX 5: Resetear estado local
  messageInput.value = '';
  conversationId.value = '';
  isConversationReady.value = false;
  messagesStore.currentMessages = [];

  emit('close');
};

// ✅ FIX 2: watch simplificado - solo abre si show es true y aún no inicializado
watch(
    () => props.show,
    async (newVal) => {
      if (newVal && !isConversationReady.value) {
        await initializeConversation();
      }
    },
    { immediate: true }
);

// ✅ FIX 3: Cleanup en unmount para evitar memory leak
onUnmounted(() => {
  messagesStore.stopListeningMessages();
});

// ✅ Auto-scroll cuando llegan nuevos mensajes
watch(
    () => sortedMessages.value.length,
    async () => {
      await nextTick();
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      }
    }
);
</script>

<template>
  <!-- ✅ FIX 4: Pasar otherUsername como :title - BaseModal agrega una sola X -->
  <BaseModal :show="show" :title="t('messages.chat.title', { username: otherUsername })" @close="handleClose">
    <div class="w-full max-w-md h-96 flex flex-col">
      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto p-md space-y-sm">
        <BaseLoader v-if="messagesStore.loading" size="small" />

        <div v-if="sortedMessages.length === 0 && !messagesStore.loading" class="text-center py-8">
          <p class="text-small text-silver-50">
            {{ t('messages.chat.noMessages') }}
          </p>
        </div>

        <div v-for="message in sortedMessages" :key="message.id" class="flex" :class="{
          'justify-end': message.senderId === authStore.user?.id,
          'justify-start': message.senderId !== authStore.user?.id,
        }">
          <div :class="{
            'bg-neon text-primary': message.senderId === authStore.user?.id,
            'bg-silver-30 text-silver': message.senderId !== authStore.user?.id,
          }" class="max-w-xs px-4 py-2 rounded">
            <p class="text-small break-words">{{ message.content }}</p>
            <p class="text-tiny mt-1 opacity-70">
              {{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-silver-30 my-md"></div>

      <!-- Input -->
      <div class="flex gap-2">
        <BaseInput
            v-model="messageInput"
            :placeholder="t('messages.chat.inputPlaceholder')"
            @keypress="handleKeyPress"
            :disabled="isSending || !isConversationReady"
        />
        <BaseButton
            size="small"
            :disabled="!messageInput.trim() || isSending || !conversationId"
            @click="handleSendMessage"
        >
          {{ isSending ? '...' : '✓' }}
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