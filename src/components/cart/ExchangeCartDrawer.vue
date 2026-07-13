<script setup lang="ts">
import { computed, ref } from 'vue'
import { useExchangeCartStore } from '../../stores/exchangeCart'
import { useI18n } from '../../composables/useI18n'
import IconV2 from '../ui/IconV2.vue'
import BaseButton from '../ui/BaseButton.vue'
import type { BuyerContact } from '../../types/buyRequest'

const props = defineProps<{
  username: string
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  share: []
  sendRequest: [contact: BuyerContact]
  loginToMatch: []
  registerToMatch: []
}>()

const { t } = useI18n()
const cartStore = useExchangeCartStore()

const cart = computed(() => cartStore.getCart(props.username))
const items = computed(() => cart.value?.items ?? [])
const totalValue = computed(() => cartStore.getCartTotalValue(props.username))

// SCRUM-70: contacto del comprador para que el dueño pueda responderle
const buyerName = ref('')
const buyerPhone = ref('')
const buyerEmail = ref('')
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.value.trim()))
const canSend = computed(() => buyerPhone.value.trim().length > 0 && emailValid.value)
// v2 redesign — per-field ok/err input states (design→app v2 F2b, proto 76): purely
// presentational (border/glow color), reuses the existing emailValid/canSend logic above.
const emailHasError = computed(() => buyerEmail.value.trim().length > 0 && !emailValid.value)

const submitRequest = () => {
  if (!canSend.value) return
  emit('sendRequest', { name: buyerName.value.trim(), phone: buyerPhone.value.trim(), email: buyerEmail.value.trim() })
}

const updateQty = (scryfallId: string, cardId: string, qty: number) => {
  cartStore.updateItemQuantity(props.username, scryfallId, cardId, qty)
}

const removeItem = (scryfallId: string, cardId: string) => {
  cartStore.removeItem(props.username, scryfallId, cardId)
  if (items.value.length === 0) emit('close')
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
        @click="emit('close')"
      />
    </Transition>

    <!-- Drawer -->
    <Transition name="slide">
      <div
        v-if="show"
        role="dialog"
        :aria-label="t('cart.title')"
        class="fixed top-0 right-0 h-full w-full max-w-md bg-[#0d0d0f] border-l border-line-strong shadow-strong z-[61] flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h2 class="font-display text-h3 font-bold text-silver flex items-center gap-2">
            <IconV2 name="cart" :size="20" class="text-neon" />
            {{ t('cart.title') }}
          </h2>
          <button
            @click="emit('close')"
            :aria-label="t('common.actions.close')"
            class="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-md text-silver-50 transition-all ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
          >
            <IconV2 name="x" :size="20" />
          </button>
        </div>

        <!-- Items list -->
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <!-- Empty state -->
          <div v-if="items.length === 0" class="flex flex-col items-center justify-center h-full text-center">
            <p class="text-body text-silver-50">{{ t('cart.emptyState') }}</p>
          </div>

          <!-- Cart items -->
          <template v-else>
            <p class="flex flex-wrap items-center gap-1.5 text-small text-silver-50 mb-3">
              {{ t('cart.itemsFromLabel') }}
              <router-link :to="`/@${username}`" class="text-neon font-bold hover:underline">@{{ username }}</router-link>
              · <span class="font-display font-tnum text-silver-70">{{ items.length }}</span> {{ t('cart.itemsSuffix') }}
            </p>
            <div class="space-y-3">
              <div
                v-for="item in items"
                :key="`${item.scryfallId}-${item.cardId}`"
                class="flex gap-3 bg-surface-1 border border-line rounded-lg p-2.5"
              >
                <!-- Card image -->
                <div class="w-14 h-[73px] flex-shrink-0 rounded-md border border-line overflow-hidden bg-gradient-to-br from-[#101c12] via-[#060a07] to-[#0c130d]">
                  <img
                    v-if="item.image"
                    :src="item.image"
                    :alt="item.name"
                    class="w-full h-full object-cover"
                  />
                </div>

                <!-- Card info -->
                <div class="flex-1 min-w-0">
                  <p class="text-small font-bold text-silver truncate">{{ item.name }}</p>
                  <p class="text-tiny text-silver-50 truncate">{{ item.edition }} · {{ item.condition }}</p>
                  <p class="font-display font-tnum text-small font-bold text-neon mt-0.5">
                    ${{ item.price ? item.price.toFixed(2) : 'N/A' }}
                    <span v-if="item.quantity > 1" class="text-silver-50 font-normal">{{ t('cart.each') }}</span>
                  </p>

                  <!-- Qty controls -->
                  <div class="flex items-center gap-2 mt-2">
                    <span class="text-tiny text-silver-50">{{ t('cart.qtyLabel') }}:</span>
                    <button
                      @click="updateQty(item.scryfallId, item.cardId, item.quantity - 1)"
                      :disabled="item.quantity <= 1"
                      :aria-label="t('cart.decreaseQty')"
                      class="w-7 h-7 border border-line-strong rounded text-silver text-[15px] font-bold flex items-center justify-center transition-all ease-v2 hover:border-neon hover:text-neon disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line-strong disabled:hover:text-silver"
                    >
                      −
                    </button>
                    <span class="font-display font-tnum text-small font-bold text-neon w-6 text-center">{{ item.quantity }}</span>
                    <button
                      @click="updateQty(item.scryfallId, item.cardId, item.quantity + 1)"
                      :disabled="item.quantity >= item.maxQuantity"
                      :aria-label="t('cart.increaseQty')"
                      class="w-7 h-7 border border-line-strong rounded text-silver text-[15px] font-bold flex items-center justify-center transition-all ease-v2 hover:border-neon hover:text-neon disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-line-strong disabled:hover:text-silver"
                    >
                      +
                    </button>
                  </div>
                </div>

                <!-- Remove button -->
                <button
                  @click="removeItem(item.scryfallId, item.cardId)"
                  :aria-label="t('cart.remove')"
                  class="self-start flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-silver-50 transition-all ease-v2 hover:text-[#C4553F] hover:bg-rust-10"
                >
                  <IconV2 name="trash" :size="16" />
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div v-if="items.length > 0" class="border-t border-line px-5 py-4 flex flex-col gap-3.5">
          <!-- Total -->
          <div class="flex items-baseline justify-between">
            <span class="text-[13px] font-bold uppercase tracking-[.08em] text-silver-50">{{ t('cart.total') }}</span>
            <span class="font-display font-tnum text-[26px] font-bold text-neon">${{ totalValue.toFixed(2) }}</span>
          </div>

          <!-- Contact form (SCRUM-70: para que el dueño pueda responder este pedido) -->
          <div class="flex flex-col gap-2.5">
            <p class="text-tiny text-silver-50">{{ t('cart.contactPrompt') }}</p>
            <div>
              <label for="cart-buyer-name" class="block text-tiny text-silver-50 mb-1">{{ t('cart.namePlaceholder') }}</label>
              <span class="flex items-center min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md transition-all ease-v2 focus-within:border-neon focus-within:shadow-glow-neon">
                <input
                  id="cart-buyer-name"
                  v-model="buyerName"
                  type="text"
                  :placeholder="t('cart.namePlaceholder')"
                  class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver text-small placeholder-silver-30"
                />
              </span>
            </div>
            <div>
              <label for="cart-buyer-phone" class="block text-tiny text-silver-50 mb-1">{{ t('cart.phonePlaceholder') }}</label>
              <span
                class="flex items-center min-h-[44px] px-3.5 bg-surface-1 border rounded-md transition-all ease-v2 focus-within:border-neon focus-within:shadow-glow-neon"
                :class="buyerPhone.trim().length > 0 ? 'border-neon-40' : 'border-line'"
              >
                <input
                  id="cart-buyer-phone"
                  v-model="buyerPhone"
                  type="tel"
                  :placeholder="t('cart.phonePlaceholder')"
                  class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver text-small placeholder-silver-30"
                />
              </span>
            </div>
            <div>
              <label for="cart-buyer-email" class="block text-tiny text-silver-50 mb-1">{{ t('cart.emailPlaceholder') }}</label>
              <span
                class="flex items-center min-h-[44px] px-3.5 bg-surface-1 border rounded-md transition-all ease-v2 focus-within:border-neon focus-within:shadow-glow-neon"
                :class="emailHasError ? 'border-rust shadow-[0_0_0_1px_rgba(139,46,31,.14)]' : 'border-line'"
              >
                <input
                  id="cart-buyer-email"
                  v-model="buyerEmail"
                  type="email"
                  :placeholder="t('cart.emailPlaceholder')"
                  class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver text-small placeholder-silver-30"
                  :aria-invalid="emailHasError"
                  :aria-describedby="emailHasError ? 'cart-buyer-email-err' : undefined"
                />
              </span>
              <span v-if="emailHasError" id="cart-buyer-email-err" class="flex items-center gap-1.5 text-tiny text-[#C4553F] mt-1">
                <IconV2 name="alert" :size="13" />
                {{ t('cart.emailInvalid') }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-col gap-2">
            <BaseButton variant="filled" class="w-full" :disabled="!canSend" @click="submitRequest">
              {{ t('cart.sendRequest') }}
            </BaseButton>
            <BaseButton variant="secondary" class="w-full" @click="emit('share')">
              {{ t('cart.share') }}
            </BaseButton>
            <BaseButton variant="secondary" class="w-full" @click="emit('loginToMatch')">
              {{ t('cart.loginToMatch') }}
            </BaseButton>
            <button
              @click="emit('registerToMatch')"
              class="w-full text-center text-small text-silver-70 transition-colors py-1 hover:text-neon"
            >
              {{ t('cart.registerToMatch') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
