<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useContactsStore } from '../stores/contacts'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import SavedContactCard from '../components/contacts/SavedContactCard.vue'
import ChatModal from '../components/chat/ChatModal.vue'

const contactsStore = useContactsStore()
const confirmStore = useConfirmStore()
const { t } = useI18n()

const showChat = ref(false)
const selectedContact = ref<any>(null)

onMounted(async () => {
  await contactsStore.loadSavedContacts()
})

onUnmounted(() => {
  contactsStore.stopListeningContacts()
})

const handleDelete = async (contactId: string) => {
  const confirmed = await confirmStore.show({
    title: t('common.actions.delete'),
    message: t('contacts.messages.deleted'),
    confirmText: t('common.actions.delete'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'danger'
  })

  if (confirmed) {
    await contactsStore.deleteContact(contactId)
  }
}

const handleChat = (contact: any) => {
  selectedContact.value = contact
  showChat.value = true
}

const closeChat = () => {
  showChat.value = false
  selectedContact.value = null
}
</script>

<template>
  <AppContainer>
    <div>
      <div class="mb-8">
        <h1 class="text-h2 md:text-h1 font-bold text-silver">{{ t('contacts.title') }}</h1>
        <p class="text-small text-silver-70 mt-2">{{ t('contacts.subtitle', { count: contactsStore.contacts.length }) }}</p>
      </div>

      <BaseLoader v-if="contactsStore.loading" size="large" />

      <div v-else-if="contactsStore.contacts.length === 0" class="border border-silver-30 p-8 text-center rounded-md">
        <p class="text-body text-silver-70">{{ t('contacts.empty.title') }}</p>
        <p class="text-small text-silver-50 mt-2">
          {{ t('contacts.empty.message') }}
        </p>
        <RouterLink to="/saved-matches" class="mt-6 inline-block">
          <BaseButton size="small">{{ t('contacts.empty.action') }}</BaseButton>
        </RouterLink>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        <SavedContactCard
            v-for="contact in contactsStore.contacts"
            :key="contact.id"
            :contact="contact"
            @delete="handleDelete"
            @chat="handleChat"
        />
      </div>

      <ChatModal
          :show="showChat"
          :other-user-id="selectedContact?.userId || ''"
          :other-username="selectedContact?.username || ''"
          @close="closeChat"
      />
    </div>
  </AppContainer>
</template>