<script setup lang="ts">
import { Contact } from '../../types/contact'
import BaseButton from '../ui/BaseButton.vue'

const props = defineProps<{
  contact: Contact
}>()

const emit = defineEmits<{
  delete: [contactId: string]
  chat: [contact: Contact]
}>()

const copyEmail = async () => {
  try {
    await navigator.clipboard.writeText(props.contact.email)
    alert('✓ Email copiado: ' + props.contact.email)
  } catch (err) {
    alert('Error al copiar email')
  }
}
</script>

<template>
  <div class="border border-silver-30 p-md bg-primary">
    <div class="mb-md">
      <p class="text-body font-bold text-silver">@{{ contact.username }}</p>
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