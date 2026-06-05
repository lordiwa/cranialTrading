<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { formatDate } from '../../utils/formatDate'
import BaseButton from '../ui/BaseButton.vue'
import type { BuyRequest } from '../../types/buyRequest'

const props = defineProps<{ request: BuyRequest }>()
const emit = defineEmits<{
  seen: [requestId: string]
  fulfill: [requestId: string]
  delete: [requestId: string]
}>()

const { t, locale } = useI18n()

// SCRUM-70.2: al mostrar una solicitud pendiente, marcarla como vista
onMounted(() => {
  if (props.request.status === 'pending') emit('seen', props.request.id)
})

const statusClass = (status: BuyRequest['status']) => {
  if (status === 'fulfilled') return 'bg-neon/20 text-neon'
  if (status === 'seen') return 'bg-silver-20 text-silver-70'
  return 'bg-rust/20 text-rust'
}
</script>

<template>
  <div class="border border-silver-30 rounded-md overflow-hidden">
    <!-- Header -->
    <div class="bg-silver-5 px-4 py-3 flex items-center gap-3 border-b border-silver-20">
      <div class="flex-1 min-w-0">
        <p class="text-body font-bold text-silver truncate">{{ request.buyerName }}</p>
        <p class="text-tiny text-silver-50">{{ formatDate(request.createdAt, locale) }}</p>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <a
              v-if="request.buyerPhone"
              :href="`https://wa.me/${request.buyerPhone.replace(/[^0-9]/g, '')}`"
              target="_blank"
              rel="noopener noreferrer"
              class="text-tiny text-neon hover:underline"
          >
            {{ t('matches.buyRequests.contactWhatsapp') }}: {{ request.buyerPhone }}
          </a>
          <a
              v-if="request.buyerEmail"
              :href="`mailto:${request.buyerEmail}`"
              class="text-tiny text-neon hover:underline truncate"
          >
            {{ request.buyerEmail }}
          </a>
        </div>
      </div>
      <span class="text-tiny px-2 py-1 rounded-sm font-bold uppercase" :class="statusClass(request.status)">
        {{ t(`matches.buyRequests.status.${request.status}`) }}
      </span>
    </div>

    <!-- Items with images -->
    <ul class="p-4 space-y-2">
      <li
          v-for="(item, idx) in request.items"
          :key="`${item.cardId}-${idx}`"
          class="flex items-center gap-3"
      >
        <img
            :src="item.image"
            :alt="item.name"
            loading="lazy"
            class="w-10 h-14 object-cover rounded-sm bg-silver-10 flex-shrink-0"
        />
        <div class="flex-1 min-w-0">
          <p class="text-small font-bold text-silver truncate">{{ item.quantity }}× {{ item.name }}</p>
          <p class="text-tiny text-silver-50 truncate">{{ item.edition }}</p>
        </div>
        <span class="text-small text-silver-70 whitespace-nowrap">
          {{ item.price > 0 ? `$${(item.price * item.quantity).toFixed(2)}` : 'N/A' }}
        </span>
      </li>
    </ul>

    <!-- Footer: total + actions -->
    <div class="px-4 py-3 border-t border-silver-20 flex flex-wrap items-center justify-between gap-3">
      <span class="text-small font-bold text-silver">
        {{ t('matches.buyRequests.total') }}: ${{ request.totalValue.toFixed(2) }}
      </span>
      <div class="flex items-center gap-2">
        <BaseButton variant="secondary" size="small" @click="emit('delete', request.id)">
          {{ t('matches.buyRequests.delete') }}
        </BaseButton>
        <BaseButton
            v-if="request.status !== 'fulfilled'"
            size="small"
            @click="emit('fulfill', request.id)"
        >
          {{ t('matches.buyRequests.fulfill') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
