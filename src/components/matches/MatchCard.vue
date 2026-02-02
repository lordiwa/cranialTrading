<template>
  <div class="border border-silver-30 p-6 md:p-8 hover:border-neon-30 hover:shadow-lg transition-all duration-300">
    <!-- Header: Match Title + Compatibility -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h3 class="text-h3 text-silver font-bold">
          {{ t('matches.card.header', { index: matchIndex, compatibility: match.compatibility }) }}
        </h3>
        <p class="text-small text-silver-70 mt-1">
          {{ t('matches.card.with', { username: '', location: match.otherLocation }).split('@')[0] }}
          <router-link
              :to="`/@${match.otherUsername}`"
              class="text-neon hover:underline font-bold"
          >
            @{{ match.otherUsername }}
          </router-link>
          • 📍 {{ match.otherLocation }}
        </p>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-silver-20 my-6"></div>

    <!-- Match Content Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
      <!-- TÚ OFRECES -->
      <div>
        <h4 class="text-small font-bold text-silver-70 uppercase mb-4">{{ t('matches.card.youOffer') }}</h4>
        <div class="space-y-2">
          <div v-if="match.myCards && match.myCards.length > 0">
            <div v-for="card in match.myCards" :key="card.id" class="bg-silver-5 border border-silver-20 p-3">
              <p class="text-body font-bold text-silver">{{ card.name }}</p>
              <p class="text-small text-silver-70">{{ card.edition }} | {{ card.condition }}</p>
              <p class="text-small text-neon font-bold mt-1">x{{ card.quantity }} @ ${{ card.price?.toFixed(2) || '0.00' }}</p>
            </div>
          </div>
          <div v-else class="text-small text-silver-50 italic">
            {{ t('matches.card.noSpecificCards') }}
          </div>
        </div>
        <p class="text-h3 text-neon font-bold mt-4">${{ match.myTotalValue?.toFixed(2) || '0.00' }}</p>
        <p class="text-tiny text-silver-70">{{ t('matches.card.totalValue') }}</p>
      </div>

      <!-- RECIBES -->
      <div>
        <h4 class="text-small font-bold text-silver-70 uppercase mb-4">{{ t('matches.card.youReceive') }}</h4>
        <div class="space-y-2">
          <div v-if="match.otherCards && match.otherCards.length > 0">
            <div v-for="card in match.otherCards" :key="card.id" class="bg-silver-5 border border-silver-20 p-3">
              <p class="text-body font-bold text-silver">{{ card.name }}</p>
              <p class="text-small text-silver-70">{{ card.edition }} | {{ card.condition }}</p>
              <p class="text-small text-neon font-bold mt-1">x{{ card.quantity }} @ ${{ card.price?.toFixed(2) || '0.00' }}</p>
            </div>
          </div>
          <div v-else class="text-small text-silver-50 italic">
            {{ t('matches.card.noSpecificCards') }}
          </div>
        </div>
        <p class="text-h3 text-neon font-bold mt-4">${{ match.theirTotalValue?.toFixed(2) || '0.00' }}</p>
        <p class="text-tiny text-silver-70">{{ t('matches.card.totalValue') }}</p>
      </div>
    </div>

    <!-- Price Difference -->
    <div class="bg-silver-5 border border-silver-20 p-4 mb-6">
      <div class="flex justify-between items-center">
        <p class="text-small text-silver-70">{{ t('matches.card.priceDifference') }}</p>
        <p :class="[
          'text-h3 font-bold',
          match.valueDifference >= 0 ? 'text-neon' : 'text-silver-50'
        ]">
          {{ match.valueDifference >= 0 ? '+' : '' }}${{ Math.abs(match.valueDifference).toFixed(2) }}
        </p>
      </div>
      <p class="text-tiny text-silver-70 mt-2">
        {{ match.valueDifference >= 0 ? t('matches.card.youReceiveAdvantage') : t('matches.card.otherReceivesAdvantage') }}
      </p>
    </div>

    <!-- Match Type Badge -->
    <div class="flex gap-2 mb-6">
      <span v-if="match.type === 'BIDIRECTIONAL'" class="inline-flex items-center gap-2 bg-neon-10 border border-neon px-3 py-1">
        <SpriteIcon name="check" size="tiny" />
        <p class="text-tiny font-bold text-neon">{{ t('matches.card.bidirectional') }}</p>
      </span>
      <span v-else class="inline-block bg-silver-10 border border-silver-30 px-3 py-1">
        <p class="text-tiny font-bold text-silver-70">{{ t('matches.card.unidirectional') }}</p>
      </span>
    </div>

    <!-- Divider -->
    <div class="border-t border-silver-20 my-6"></div>

    <!-- Actions - DIFERENCIADAS POR TAB -->
    <div class="flex flex-col md:flex-row gap-3">
      <!-- TAB: NEW (nuevos matches) -->
      <template v-if="tab === 'new'">
        <BaseButton
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleSaveMatch"
            :disabled="saving"
        >
          <SpriteIcon :name="saving ? 'loading' : 'star'" size="tiny" />
          {{ saving ? t('common.actions.saving') : t('matches.actions.interested') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleOpenChat"
        >
          <SpriteIcon name="chat" size="tiny" />
          {{ t('matches.actions.message') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleDiscard"
        >
          <SpriteIcon name="x-mark" size="tiny" />
          {{ t('matches.actions.ignore') }}
        </BaseButton>
      </template>

      <!-- TAB: SAVED (mis matches guardados) -->
      <template v-else-if="tab === 'saved'">
        <BaseButton
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleOpenChat"
        >
          <SpriteIcon name="chat" size="tiny" />
          {{ t('matches.actions.message') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="showContactModal = true"
        >
          <SpriteIcon name="user" size="tiny" />
          {{ t('matches.actions.contact') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleMarcarCompletado"
        >
          <SpriteIcon name="check" size="tiny" />
          {{ t('matches.actions.completed') }}
        </BaseButton>
        <BaseButton
            variant="danger"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleDiscard"
        >
          <SpriteIcon name="x-mark" size="tiny" />
          {{ t('matches.actions.delete') }}
        </BaseButton>
      </template>

      <!-- TAB: DELETED (matches eliminados) -->
      <template v-else-if="tab === 'deleted'">
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleRecuperar"
        >
          <SpriteIcon name="recover" size="tiny" />
          {{ t('matches.actions.recover') }}
        </BaseButton>
        <BaseButton
            variant="danger"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleDeletePermanent"
        >
          <SpriteIcon name="trash" size="tiny" />
          {{ t('matches.actions.delete') }}
        </BaseButton>
      </template>
    </div>

    <!-- Modal de Contacto -->
    <BaseModal
        :show="showContactModal"
        :title="t('matches.contactModal.title')"
        @close="showContactModal = false"
    >
      <div class="space-y-4 mb-6">
        <!-- Usuario -->
        <div>
          <p class="text-tiny text-silver-70 uppercase font-bold mb-1">{{ t('matches.contactModal.user') }}</p>
          <router-link
              :to="`/@${match.otherUsername}`"
              class="text-body font-bold text-neon hover:underline"
          >
            @{{ match.otherUsername }}
          </router-link>
        </div>

        <!-- Ubicación -->
        <div>
          <p class="text-tiny text-silver-70 uppercase font-bold mb-1">{{ t('matches.contactModal.location') }}</p>
          <p class="text-body text-silver">📍 {{ match.otherLocation }}</p>
        </div>

        <!-- Email -->
        <div>
          <p class="text-tiny text-silver-70 uppercase font-bold mb-1">{{ t('matches.contactModal.email') }}</p>
          <p class="text-body text-silver">{{ match.otherEmail }}</p>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-silver-20 my-4"></div>

      <!-- Acciones de Contacto -->
      <div class="flex flex-col gap-2 pt-4">
        <!-- Botón: Copiar Email -->
        <BaseButton
            variant="secondary"
            class="w-full flex items-center justify-center gap-2"
            @click="copyEmailToClipboard"
        >
          <SpriteIcon name="chat" size="tiny" />
          {{ t('matches.contactModal.copyEmail') }}
        </BaseButton>

        <!-- Botón: Guardar Contacto -->
        <BaseButton
            variant="secondary"
            class="w-full flex items-center justify-center gap-2"
            @click="handleSaveContact"
            :disabled="contactSaving"
        >
          <SpriteIcon :name="contactSaving ? 'loading' : 'star'" size="tiny" />
          {{ contactSaving ? t('common.actions.saving') : t('matches.contactModal.saveContact') }}
        </BaseButton>

        <!-- Botón: Cerrar -->
        <BaseButton
            variant="secondary"
            class="w-full flex items-center justify-center gap-2"
            @click="showContactModal = false"
        >
          <SpriteIcon name="x-mark" size="tiny" />
          {{ t('matches.contactModal.close') }}
        </BaseButton>
      </div>
    </BaseModal>

    <!-- Chat Modal -->
    <ChatModal
        :show="showChatModal"
        :other-user-id="match.otherUserId"
        :other-username="match.otherUsername"
        @close="showChatModal = false"
    />
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import ChatModal from '../chat/ChatModal.vue'
import SpriteIcon from '../ui/SpriteIcon.vue'
import { useContactsStore } from '../../stores/contacts'
import { useToastStore } from '../../stores/toast'
import { useMessagesStore } from '../../stores/messages'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()

interface Props {
  match: any
  matchIndex?: number
  tab?: 'new' | 'sent' | 'saved' | 'deleted'
}

const props = withDefaults(defineProps<Props>(), {
  matchIndex: 0,
  tab: 'new'
})

const emit = defineEmits(['save', 'discard'])

const router = useRouter()
const saving = ref(false)
const showContactModal = ref(false)
const showChatModal = ref(false)
const contactSaving = ref(false)
const contactsStore = useContactsStore()
const toastStore = useToastStore()
const messagesStore = useMessagesStore()

// TAB: NEW - Guardar match
const handleSaveMatch = async () => {
  saving.value = true
  try {
    emit('save', props.match)
  } finally {
    saving.value = false
  }
}

// TAB: NEW/SAVED/DELETED - Descartar match
const handleDiscard = () => {
  emit('discard', props.match.id || props.match.docId)
}

// TAB: SAVED - Marcar como completado
const handleMarcarCompletado = () => {
  emit('discard', props.match.id || props.match.docId)
}

// TAB: DELETED - Recuperar match
const handleRecuperar = () => {
  emit('save', props.match)
}

// TAB: DELETED - Eliminar permanentemente
const handleDeletePermanent = () => {
  emit('discard', props.match.id || props.match.docId)
}

// CONTACTO - Copiar email
const copyEmailToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.match.otherEmail)
    toastStore.show(t('matches.contactModal.emailCopied'), 'success')
  } catch (err) {
    toastStore.show(t('messages.errors.sendError'), 'error')
  }
}

// MENSAJE - Abrir chat con el usuario
const handleOpenChat = async () => {
  const otherUserId = props.match.otherUserId
  const otherUsername = props.match.otherUsername

  if (!otherUserId) {
    toastStore.show(t('messages.errors.createError'), 'error')
    return
  }

  // Crear conversación si no existe
  const conversationId = await messagesStore.createConversation(otherUserId, otherUsername)

  if (conversationId) {
    showChatModal.value = true
  }
}

// CONTACTO - Guardar contacto
const handleSaveContact = async () => {
  contactSaving.value = true
  try {
    const otherUserId = props.match.otherUserId

    if (!otherUserId) {
      toastStore.show(t('contacts.messages.saveError'), 'error')
      return
    }

    await contactsStore.saveContact({
      userId: otherUserId,
      username: props.match.otherUsername,
      email: props.match.otherEmail,
      location: props.match.otherLocation || 'Unknown',
    })

    toastStore.show(t('matches.contactModal.contactSaved', { username: props.match.otherUsername }), 'success')
    showContactModal.value = false
  } catch (error) {
    const message = error instanceof Error ? error.message : t('contacts.messages.saveError')
    toastStore.show(message, 'error')
    console.error('Error saving contact:', error)
  } finally {
    contactSaving.value = false
  }
}
</script>

<style scoped>
/* Los estilos se aplican directamente con clases Tailwind en el template */
</style>