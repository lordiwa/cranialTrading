<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import ChatModal from '../chat/ChatModal.vue'
import SvgIcon from '../ui/SvgIcon.vue'
import IconV2 from '../ui/IconV2.vue'
import HelpTooltip from '../ui/HelpTooltip.vue'
import { useContactsStore } from '../../stores/contacts'
import { type MatchCard as MatchCardType, type SimpleMatch } from '../../stores/matches'
import { useToastStore } from '../../stores/toast'
import { isDisplayableImageUrl } from '../../utils/cardImageUrl'
import { useMessagesStore } from '../../stores/messages'
import { useI18n } from '../../composables/useI18n'
import { getAvatarUrlForUser } from '../../utils/avatar'
import { type CardPrices, formatPrice, getCardPrices } from '../../services/mtgjson'

const props = withDefaults(defineProps<Props>(), {
  matchIndex: 0,
  tab: 'new'
})

const emit = defineEmits(['save', 'discard'])

const { t } = useI18n()

interface Props {
  match: SimpleMatch
  matchIndex?: number
  tab?: 'new' | 'sent' | 'saved' | 'deleted'
}

const saving = ref(false)
const showContactModal = ref(false)
const showChatModal = ref(false)
const contactSaving = ref(false)
const contactsStore = useContactsStore()
const toastStore = useToastStore()
const messagesStore = useMessagesStore()

// Live CK/TCG/BL prices for match cards
const matchPrices = shallowRef<Map<string, CardPrices | null>>(new Map())

const getCKRetail = (card: MatchCardType): number | null => {
  return matchPrices.value.get(card.scryfallId)?.cardKingdom?.retail ?? null
}

const getCKBuylist = (card: MatchCardType): number | null => {
  return matchPrices.value.get(card.scryfallId)?.cardKingdom?.buylist ?? null
}

onMounted(async () => {
  const allCards = [...(props.match.myCards ?? []), ...(props.match.otherCards ?? [])]
  const uniqueIds = [...new Set(allCards.map(c => c.scryfallId).filter(Boolean))]
  const results = new Map<string, CardPrices | null>()

  for (const scryfallId of uniqueIds) {
    try {
      const prices = await getCardPrices(scryfallId)
      results.set(scryfallId, prices)
    } catch {
      results.set(scryfallId, null)
    }
  }

  matchPrices.value = results
})

// v2 redesign — compact swap-set summary bar: mini "Das/Recibís" placeholders +
// i-swap + tabular price diff (F2, DESIGN-DIRECTION.md §8.2). Reuses the exact
// status→badge mapping already used for collection cards (collection.badges.*)
// instead of inventing new vendo/cambio/deseado semantics.
const badgeMap: Record<string, { labelKey: string; classes: string }> = {
  sale: { labelKey: 'collection.badges.vendo', classes: 'bg-[rgba(13,13,15,.85)] text-[#C4553F]' },
  trade: { labelKey: 'collection.badges.cambio', classes: 'bg-[rgba(13,13,15,.85)] text-[#60A5FA]' },
  wishlist: { labelKey: 'collection.badges.deseado', classes: 'bg-[rgba(13,13,15,.85)] text-gold' },
}

const giveCard = computed(() => props.match.myCards?.[0])
const receiveCard = computed(() => props.match.otherCards?.[0])

const rowBadge = computed(() => {
  const status = giveCard.value?.status
  // eslint-disable-next-line security/detect-object-injection
  const entry = status ? badgeMap[status] : undefined
  if (!entry) return null
  return { label: t(entry.labelKey), classes: entry.classes }
})

// TAB: NEW - Guardar match
const handleSaveMatch = () => {
  saving.value = true
  try {
    emit('save', props.match)
  } finally {
    saving.value = false
  }
}

// TAB: NEW/SAVED/DELETED - Descartar match
const handleDiscard = () => {
  emit('discard', props.match.id ?? props.match.docId)
}

// TAB: SAVED - Marcar como completado
const handleMarcarCompletado = () => {
  emit('discard', props.match.id ?? props.match.docId)
}

// TAB: DELETED - Recuperar match
const handleRecuperar = () => {
  emit('save', props.match)
}

// TAB: DELETED - Eliminar permanentemente
const handleDeletePermanent = () => {
  emit('discard', props.match.id ?? props.match.docId)
}

// CONTACTO - email
//
// TASK-169: el email ya no viaja dentro del match. Venia copiado en cada
// documento de public_cards, que se lee SIN login, asi que se podian bajar en
// masa los emails de toda la plataforma. Ahora vive en contact_info/{uid}, que
// exige sesion, y se pide en el momento de abrir el modal — que es el unico
// lugar donde hace falta y siempre hay usuario logueado.
const resolvedEmail = ref<string | null>(null)
const emailLoading = ref(false)

const openContactModal = async () => {
  showContactModal.value = true
  const otherUserId = props.match.otherUserId
  if (!otherUserId || resolvedEmail.value !== null) return
  emailLoading.value = true
  try {
    const { getContactInfo } = await import('../../services/contactInfo')
    const info = await getContactInfo(otherUserId)
    resolvedEmail.value = info?.email ?? ''
  } catch {
    resolvedEmail.value = ''
  } finally {
    emailLoading.value = false
  }
}

const copyEmailToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(resolvedEmail.value ?? '')
    toastStore.show(t('matches.contactModal.emailCopied'), 'success')
  } catch {
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
      email: resolvedEmail.value ?? '',
      location: props.match.otherLocation ?? 'Unknown',
      avatarUrl: props.match.otherAvatarUrl ?? null,
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

<template>
  <div class="border border-silver-30 p-6 md:p-8 hover:border-neon-30 hover:shadow-lg transition-all duration-300 rounded-none bg-primary/80">
    <!-- Meta: user + compatibility (compact — group header already shows @username) -->
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <p class="text-small text-silver-70 flex items-center gap-2">
        <router-link
            :to="`/@${match.otherUsername}`"
            class="text-neon hover:underline font-bold inline-flex items-center gap-1"
        >
          <img
              :src="getAvatarUrlForUser(match.otherUsername, 20, match.otherAvatarUrl)"
              alt=""
              class="w-5 h-5 rounded-full"
          />
          @{{ match.otherUsername }}
        </router-link>
        <span v-if="match.otherLocation">• {{ match.otherLocation }}</span>
      </p>
      <p class="text-tiny text-silver-50 flex items-center gap-1">
        {{ t('matches.card.header', { index: matchIndex, compatibility: match.compatibility ?? 0 }) }}
        <HelpTooltip
            :text="t('help.tooltips.matches.compatibility')"
            :title="t('help.titles.compatibility')"
        />
      </p>
    </div>

    <!-- v2 redesign — swap-set summary bar: mini "Das/Recibís" + i-swap + tabular price diff -->
    <div class="flex items-center gap-4 md:gap-5 mb-6">
      <div class="w-16 md:w-[72px] flex-shrink-0">
        <p class="text-[9px] md:text-[10px] font-bold uppercase tracking-[.12em] text-silver-30 mb-1.5">{{ t('matches.card.youOffer') }}</p>
        <div class="relative aspect-[63/88] rounded-md border border-line overflow-hidden bg-gradient-to-br from-[#101c12] via-[#060a07] to-[#0c130d]">
          <img
              v-if="isDisplayableImageUrl(giveCard?.image)"
              :src="giveCard?.image"
              alt=""
              class="absolute inset-0 w-full h-full object-cover"
          />
          <span
              v-if="(match.myCards?.length ?? 0) > 1"
              class="absolute top-1 right-1 text-[9px] font-bold bg-black/70 text-silver-70 px-1 rounded"
          >+{{ (match.myCards?.length ?? 1) - 1 }}</span>
          <div class="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1">
            <p class="text-[9px] leading-tight text-silver-70 truncate">{{ giveCard?.name ?? t('matches.card.noSpecificCards') }}</p>
          </div>
        </div>
      </div>
      <IconV2 name="swap" :size="22" class="text-silver-30 flex-shrink-0" />
      <div class="w-16 md:w-[72px] flex-shrink-0">
        <p class="text-[9px] md:text-[10px] font-bold uppercase tracking-[.12em] text-silver-30 mb-1.5">{{ t('matches.card.youReceive') }}</p>
        <div class="relative aspect-[63/88] rounded-md border border-line overflow-hidden bg-gradient-to-br from-[#0d1626] via-[#060a12] to-[#0a1220]">
          <img
              v-if="isDisplayableImageUrl(receiveCard?.image)"
              :src="receiveCard?.image"
              alt=""
              class="absolute inset-0 w-full h-full object-cover"
          />
          <span
              v-if="(match.otherCards?.length ?? 0) > 1"
              class="absolute top-1 right-1 text-[9px] font-bold bg-black/70 text-silver-70 px-1 rounded"
          >+{{ (match.otherCards?.length ?? 1) - 1 }}</span>
          <div class="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1">
            <p class="text-[9px] leading-tight text-silver-70 truncate">{{ receiveCard?.name ?? t('matches.card.noSpecificCards') }}</p>
          </div>
        </div>
      </div>

      <div class="ml-auto flex flex-col items-end gap-1.5">
        <span
            v-if="rowBadge"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-tiny font-bold uppercase tracking-wide"
            :class="rowBadge.classes"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
          {{ rowBadge.label }}
        </span>
        <div class="text-right">
          <span
              class="block font-display font-tnum text-[16px] font-bold"
              :class="(match.valueDifference ?? 0) >= 0 ? 'text-neon' : 'text-[#C4553F]'"
          >
            {{ (match.valueDifference ?? 0) >= 0 ? '+' : '−' }}${{ Math.abs(match.valueDifference ?? 0).toFixed(0) }}
          </span>
          <span class="block text-[10px] font-bold uppercase tracking-[.08em] text-silver-30">
            {{ (match.valueDifference ?? 0) >= 0 ? t('matches.card.priceDiffFavor') : t('matches.card.priceDiffAgainst') }}
          </span>
        </div>
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
            <div v-for="card in match.myCards" :key="card.scryfallId" class="bg-silver-5 border border-silver-20 p-3 rounded">
              <p class="text-body font-bold text-silver">{{ card.name }}</p>
              <p class="text-small text-silver-70">{{ card.edition }} | {{ card.condition }}</p>
              <p class="text-small text-neon font-bold mt-1">x{{ card.quantity }} @ {{ getCKRetail(card) != null ? `CK ${formatPrice(getCKRetail(card))}` : `$${card.price?.toFixed(2) || '0.00'}` }}</p>
              <p class="text-tiny text-silver-50">TCG: ${{ card.price?.toFixed(2) || '0.00' }}<template v-if="getCKBuylist(card) != null"> | BL: {{ formatPrice(getCKBuylist(card)) }}</template></p>
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
            <div v-for="card in match.otherCards" :key="card.scryfallId" class="bg-silver-5 border border-silver-20 p-3 rounded">
              <p class="text-body font-bold text-silver">{{ card.name }}</p>
              <p class="text-small text-silver-70">{{ card.edition }} | {{ card.condition }}</p>
              <p class="text-small text-neon font-bold mt-1">x{{ card.quantity }} @ {{ getCKRetail(card) != null ? `CK ${formatPrice(getCKRetail(card))}` : `$${card.price?.toFixed(2) || '0.00'}` }}</p>
              <p class="text-tiny text-silver-50">TCG: ${{ card.price?.toFixed(2) || '0.00' }}<template v-if="getCKBuylist(card) != null"> | BL: {{ formatPrice(getCKBuylist(card)) }}</template></p>
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

    <!-- Match Type Badge -->
    <div class="flex gap-2 mb-6 items-center">
      <span v-if="match.type === 'BIDIRECTIONAL'" class="inline-flex items-center gap-2 bg-neon-10 border border-neon px-3 py-1 rounded-none">
        <SvgIcon name="check" size="tiny" />
        <p class="text-tiny font-bold text-neon">{{ t('matches.card.bidirectional') }}</p>
      </span>
      <span v-else class="inline-block bg-silver-10 border border-silver-30 px-3 py-1 rounded-none">
        <p class="text-tiny font-bold text-silver-70">{{ t('matches.card.unidirectional') }}</p>
      </span>
      <HelpTooltip
          :text="match.type === 'BIDIRECTIONAL' ? t('help.tooltips.matches.bidirectional') : t('help.tooltips.matches.unidirectional')"
          :title="t('help.titles.matchType')"
      />
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
          <SvgIcon :name="saving ? 'loading' : 'star'" size="tiny" />
          {{ saving ? t('common.actions.saving') : t('matches.actions.interested') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleOpenChat"
        >
          <SvgIcon name="chat" size="tiny" />
          {{ t('matches.actions.message') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleDiscard"
        >
          <SvgIcon name="x-mark" size="tiny" />
          {{ t('matches.actions.ignore') }}
        </BaseButton>
      </template>

      <!-- TAB: SAVED (mis matches guardados) -->
      <template v-else-if="tab === 'saved'">
        <BaseButton
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleOpenChat"
        >
          <SvgIcon name="chat" size="tiny" />
          {{ t('matches.actions.message') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="openContactModal"
        >
          <SvgIcon name="user" size="tiny" />
          {{ t('matches.actions.contact') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleMarcarCompletado"
        >
          <SvgIcon name="check" size="tiny" />
          {{ t('matches.actions.completed') }}
        </BaseButton>
        <BaseButton
            variant="danger"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleDiscard"
        >
          <SvgIcon name="x-mark" size="tiny" />
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
          <SvgIcon name="recover" size="tiny" />
          {{ t('matches.actions.recover') }}
        </BaseButton>
        <BaseButton
            variant="danger"
            class="flex-1 flex items-center justify-center gap-2"
            @click="handleDeletePermanent"
        >
          <SvgIcon name="trash" size="tiny" />
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
              class="text-body font-bold text-neon hover:underline inline-flex items-center gap-2"
          >
            <img
                :src="getAvatarUrlForUser(match.otherUsername, 24, match.otherAvatarUrl)"
                alt=""
                class="w-6 h-6 rounded-full"
            />
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
          <p class="text-body text-silver">{{ emailLoading ? '…' : (resolvedEmail || '—') }}</p>
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
          <SvgIcon name="chat" size="tiny" />
          {{ t('matches.contactModal.copyEmail') }}
        </BaseButton>

        <!-- Botón: Guardar Contacto -->
        <BaseButton
            variant="secondary"
            class="w-full flex items-center justify-center gap-2"
            @click="handleSaveContact"
            :disabled="contactSaving"
        >
          <SvgIcon :name="contactSaving ? 'loading' : 'star'" size="tiny" />
          {{ contactSaving ? t('common.actions.saving') : t('matches.contactModal.saveContact') }}
        </BaseButton>

        <!-- Botón: Cerrar -->
        <BaseButton
            variant="secondary"
            class="w-full flex items-center justify-center gap-2"
            @click="showContactModal = false"
        >
          <SvgIcon name="x-mark" size="tiny" />
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

<style scoped>
/* Los estilos se aplican directamente con clases Tailwind en el template */
</style>