<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="modal-content relative">
      <!-- Close Button - Top Right -->
      <button
          @click="handleClose"
          class="absolute top-md right-md text-silver hover:text-neon transition-fast text-h2"
          aria-label="Cerrar modal"
      >
        ✕
      </button>

      <!-- Header -->
      <div class="mb-lg pr-lg">
        <h2 class="text-h1 text-silver font-bold">{{ contact.username }}</h2>
        <p class="text-small text-silver-70 mt-sm">En línea</p>
      </div>

      <!-- Divider -->
      <div class="border-b border-silver-20 mb-lg"></div>

      <!-- Contact Info -->
      <div class="space-y-md mb-lg">
        <!-- WhatsApp Info -->
        <div class="bg-primary border border-silver-30 p-md rounded-none">
          <p class="text-tiny text-silver-50 mb-xs">WhatsApp</p>
          <p class="text-body text-silver font-mono">56565</p>
          <p class="text-tiny text-silver-50 mt-xs">12:25 a.m.</p>
        </div>

        <!-- Message Examples -->
        <div class="space-y-sm">
          <!-- Message 1 - From User (Right) -->
          <div class="flex justify-end">
            <div class="max-w-xs bg-neon text-primary p-md">
              <p class="text-small font-mono">vendeme tu elevator</p>
              <p class="text-tiny text-primary opacity-70 mt-xs">07:01 p.m.</p>
            </div>
          </div>

          <!-- Message 2 - From Other User (Left) -->
          <div class="flex justify-start">
            <div class="max-w-xs bg-silver-20 text-silver p-md">
              <p class="text-small font-mono">tambien te quiero vender mi ragavan</p>
              <p class="text-tiny text-silver-70 mt-xs">07:01 p.m.</p>
            </div>
          </div>

          <!-- Message 3 - From User (Right) -->
          <div class="flex justify-end">
            <div class="max-w-xs bg-silver-30 text-silver p-md">
              <p class="text-small font-mono">vendase esha droga</p>
              <p class="text-tiny text-silver-70 mt-xs">08:02 p.m.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-b border-silver-20 mb-lg"></div>

      <!-- Message Input Section -->
      <div class="space-y-md">
        <!-- Input Field -->
        <input
            v-model="messageText"
            type="text"
            placeholder="Escribe un mensaje..."
            class="input-base w-full"
            @keyup.enter="sendMessage"
        />

        <!-- Action Buttons -->
        <div class="flex gap-md">
          <!-- Copy Email Button -->
          <button
              @click="copyEmail"
              class="btn-secondary flex-1 py-md text-small font-bold transition-fast"
          >
            COPIAR EMAIL
          </button>

          <!-- Send Message Button -->
          <button
              @click="sendMessage"
              class="btn-primary flex-1 py-md text-small font-bold transition-fast"
          >
            ENVIAR
          </button>
        </div>

        <!-- Alternative Contact Methods -->
        <div class="text-center">
          <p class="text-tiny text-silver-50 mb-md">O contacta directamente:</p>
          <div class="flex gap-sm justify-center flex-wrap">
            <a
                :href="`mailto:${contact.email}`"
                class="btn-secondary px-md py-sm text-tiny font-bold transition-fast"
            >
              📧 Email
            </a>
            <a
                :href="`https://wa.me/56565`"
                target="_blank"
                class="btn-secondary px-md py-sm text-tiny font-bold transition-fast"
            >
              💬 WhatsApp
            </a>
          </div>
        </div>
      </div>

      <!-- Close Button - Bottom (Alternative) -->
      <button
          @click="handleClose"
          class="absolute bottom-md right-md text-silver hover:text-neon transition-fast"
          aria-label="Cerrar modal"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Contact {
  username: string
  email: string
  location: string
}

interface Props {
  contact: Contact | null
}

const props = withDefaults(defineProps<Props>(), {
  contact: null
})

const emit = defineEmits<{
  close: []
}>()

const messageText = ref('')

const handleClose = () => {
  messageText.value = ''
  emit('close')
}

const copyEmail = async () => {
  if (props.contact?.email) {
    try {
      await navigator.clipboard.writeText(props.contact.email)
      // Optional: Show toast notification
      console.log('Email copied:', props.contact.email)
    } catch (err) {
      console.error('Failed to copy email:', err)
    }
  }
}

const sendMessage = () => {
  if (messageText.value.trim()) {
    // TODO: Integrate with actual messaging service
    console.log('Message to send:', messageText.value)
    messageText.value = ''
  }
}
</script>

<style scoped>
/* All styles in global style.css */
</style>