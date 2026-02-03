<script setup lang="ts">
import { type Contact } from '../../types/contact'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../composables/useI18n'
import BaseButton from '../ui/BaseButton.vue'
import { getAvatarUrlForUser } from '../../utils/avatar'

const props = defineProps<{
  contact: Contact
}>()

const emit = defineEmits<{
  delete: [contactId: string]
  chat: [contact: Contact]
}>()

const toastStore = useToastStore()
const { t } = useI18n()

const copyEmail = async () => {
  try {
    await navigator.clipboard.writeText(props.contact.email)
    toastStore.show(t('matches.contactModal.emailCopied'), 'success')
  } catch {
    toastStore.show(t('messages.errors.sendError'), 'error')
  }
}
</script>

<template>
  <div class="border border-silver-30 p-md bg-primary rounded-md">
    <div class="mb-md">
      <p class="text-body font-bold text-silver flex items-center gap-2">
        <img
            :src="getAvatarUrlForUser(contact.username, 28, contact.avatarUrl)"
            alt=""
            class="w-7 h-7 rounded-full"
        />
        @{{ contact.username }}
      </p>
      <p class="text-small text-silver-70 mt-1">📍 {{ contact.location }}</p>
      <p class="text-small text-silver-70 mt-1">📧 {{ contact.email }}</p>
    </div>

    <p class="text-tiny text-silver-50 mb-md">
      Guardado: {{ new Date(contact.savedAt).toLocaleDateString() }}
    </p>

    <div class="flex gap-2">
      <BaseButton
          size="small"
          @click="copyEmail"
          class="flex-1"
      >
        📋 COPIAR
      </BaseButton>
      <BaseButton
          size="small"
          @click="emit('chat', contact)"
          class="flex-1"
      >
        💬 CHAT
      </BaseButton>
      <BaseButton
          variant="danger"
          size="small"
          @click="emit('delete', contact.id)"
          class="flex-1"
      >
        🗑️
      </BaseButton>
    </div>
  </div>
</template>