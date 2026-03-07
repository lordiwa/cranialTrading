<script setup lang="ts">
import { computed } from 'vue'
import { useExchangeCartStore } from '../../stores/exchangeCart'
import { useI18n } from '../../composables/useI18n'
import SvgIcon from '../ui/SvgIcon.vue'
import BaseButton from '../ui/BaseButton.vue'

const props = defineProps<{
  username: string
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  share: []
  loginToMatch: []
  registerToMatch: []
}>()

const { t } = useI18n()
const cartStore = useExchangeCartStore()

const cart = computed(() => cartStore.getCart(props.username))
const items = computed(() => cart.value?.items ?? [])
const totalValue = computed(() => cartStore.getCartTotalValue(props.username))

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
        class="fixed inset-0 bg-black/60 z-[60]"
        @click="emit('close')"
      />
    </Transition>

    <!-- Drawer -->
    <Transition name="slide">
      <div
        v-if="show"
        class="fixed top-0 right-0 h-full w-full max-w-md bg-primary border-l border-silver-30 z-[61] flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-silver-30">
          <h2 class="text-h3 font-bold text-silver">{{ t('cart.title') }}</h2>
          <button @click="emit('close')" class="text-silver-50 hover:text-silver transition-colors">
            <SvgIcon name="x-mark" size="small" />
          </button>
        </div>

        <!-- Items list -->
        <div class="flex-1 overflow-y-auto px-4 py-3">
          <!-- Empty state -->
          <div v-if="items.length === 0" class="flex flex-col items-center justify-center h-full text-center">
            <p class="text-body text-silver-50">{{ t('cart.emptyState') }}</p>
          </div>

          <!-- Cart items -->
          <div v-else class="space-y-3">
            <div
              v-for="item in items"
              :key="`${item.scryfallId}-${item.cardId}`"
              class="flex gap-3 bg-secondary/30 border border-silver-20 p-2 rounded"
            >
              <!-- Card image -->
              <img
                v-if="item.image"
                :src="item.image"
                :alt="item.name"
                class="w-14 h-20 object-cover rounded flex-shrink-0"
              />
              <div v-else class="w-14 h-20 bg-secondary flex items-center justify-center rounded flex-shrink-0">
                <span class="text-tiny text-silver-50">N/A</span>
              </div>

              <!-- Card info -->
              <div class="flex-1 min-w-0">
                <p class="text-small font-bold text-silver truncate">{{ item.name }}</p>
                <p class="text-tiny text-silver-50 truncate">{{ item.edition }} - {{ item.condition }}</p>
                <p class="text-tiny font-bold text-neon">
                  ${{ item.price ? item.price.toFixed(2) : 'N/A' }}
                  <span v-if="item.quantity > 1" class="text-silver-50 font-normal">{{ t('cart.each') }}</span>
                </p>

                <!-- Qty controls -->
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-tiny text-silver-50">{{ t('cart.qtyLabel') }}:</span>
                  <button
                    @click="updateQty(item.scryfallId, item.cardId, item.quantity - 1)"
                    :disabled="item.quantity <= 1"
                    class="w-6 h-6 border border-silver-30 text-silver text-tiny font-bold flex items-center justify-center rounded hover:border-neon disabled:opacity-30 disabled:cursor-not-allowed"
                  >-</button>
                  <span class="text-small font-bold text-neon w-6 text-center">{{ item.quantity }}</span>
                  <button
                    @click="updateQty(item.scryfallId, item.cardId, item.quantity + 1)"
                    :disabled="item.quantity >= item.maxQuantity"
                    class="w-6 h-6 border border-silver-30 text-silver text-tiny font-bold flex items-center justify-center rounded hover:border-neon disabled:opacity-30 disabled:cursor-not-allowed"
                  >+</button>
                </div>
              </div>

              <!-- Remove button -->
              <button
                @click="removeItem(item.scryfallId, item.cardId)"
                class="self-start text-silver-50 hover:text-rust transition-colors flex-shrink-0"
              >
                <SvgIcon name="trash" size="tiny" />
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div v-if="items.length > 0" class="border-t border-silver-30 px-4 py-3 space-y-3">
          <!-- Total -->
          <div class="flex items-center justify-between">
            <span class="text-body font-bold text-silver">{{ t('cart.total') }}</span>
            <span class="text-body font-bold text-neon">${{ totalValue.toFixed(2) }}</span>
          </div>

          <!-- Actions -->
          <div class="space-y-2">
            <BaseButton class="w-full" @click="emit('share')">
              {{ t('cart.share') }}
            </BaseButton>
            <BaseButton class="w-full" variant="secondary" @click="emit('loginToMatch')">
              {{ t('cart.loginToMatch') }}
            </BaseButton>
            <button
              @click="emit('registerToMatch')"
              class="w-full text-center text-small text-silver-70 hover:text-neon transition-colors py-1"
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
