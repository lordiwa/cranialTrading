<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useContactsStore } from '../stores/contacts'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import SavedContactCard from '../components/contacts/SavedContactCard.vue'
import ChatModal from '../components/chat/ChatModal.vue'

const contactsStore = useContactsStore()

const showChat = ref(false)
const selectedContact = ref<any>(null)

onMounted(async () => {
  await contactsStore.loadSavedContacts()
})

onUnmounted(() => {
  contactsStore.stopListeningContacts()
})

const handleDelete = async (contactId: string) => {
  const confirmed = confirm('¿Eliminar este contacto?')
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
        <h1 class="text-h2 md:text-h1 font-bold text-silver">MIS CONTACTOS GUARDADOS</h1>
        <p class="text-small text-silver-70 mt-2">{{ contactsStore.contacts.length }} contactos</p>
      </div>

      <BaseLoader v-if="contactsStore.loading" size="large" />

      <div v-else-if="contactsStore.contacts.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">No tienes contactos guardados</p>
        <p class="text-small text-silver-50 mt-2">
          Guarda contactos desde los matches para acceder rápidamente
        </p>
        <RouterLink to="/saved-matches" class="mt-6 inline-block">
          <BaseButton size="small">VER MIS MATCHES</BaseButton>
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