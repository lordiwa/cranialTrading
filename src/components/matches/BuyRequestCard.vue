<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { formatDate } from '../../utils/formatDate'
import BaseButton from '../ui/BaseButton.vue'
import IconV2 from '../ui/IconV2.vue'
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

// v2 redesign — status dot-badge (design→app v2 F2b, proto 77): tinted bg + colored
// text + dot, same vocabulary CollectionGridCardFull/MatchCard already use for status chips.
const STATUS_CLASSES: Record<BuyRequest['status'], string> = {
  pending: 'bg-warning-15 text-warning',
  seen: 'bg-surface-3 text-silver-70',
  fulfilled: 'bg-neon-15 text-neon',
}

const avatarInitial = computed(() => (props.request.buyerName || '?').charAt(0).toUpperCase())
</script>

<template>
  <div class="bg-surface-1 border border-line rounded-lg overflow-hidden transition-colors hover:border-line-strong">
    <!-- Header -->
    <div class="bg-surface-2 px-4 py-3.5 flex items-start gap-3">
      <span
          class="w-[38px] h-[38px] rounded-full flex items-center justify-center font-display font-bold text-[14px] flex-shrink-0"
          :class="request.status === 'pending' ? 'bg-neon-15 text-neon shadow-[0_0_0_2px_rgba(90,193,104,.4)]' : 'bg-surface-3 text-silver-70'"
      >
        {{ avatarInitial }}
      </span>
      <div class="flex-1 min-w-0">
        <p class="font-display font-bold text-silver truncate">{{ request.buyerName }}</p>
        <p class="text-tiny text-silver-50 mt-0.5">{{ formatDate(request.createdAt, locale) }}</p>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
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
      <span
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide flex-shrink-0"
          :class="STATUS_CLASSES[request.status]"
      >
        <IconV2 v-if="request.status === 'fulfilled'" name="check" :size="12" class="-ml-0.5" />
        <span v-else class="w-1.5 h-1.5 rounded-full bg-current"></span>
        {{ t(`matches.buyRequests.status.${request.status}`) }}
      </span>
    </div>

    <!-- Items with images -->
    <ul class="px-4 py-3.5 flex flex-col gap-3">
      <li
          v-for="(item, idx) in request.items"
          :key="`${item.cardId}-${idx}`"
          class="flex items-center gap-3"
      >
        <div class="w-9 h-[50px] flex-shrink-0 rounded-md border border-line overflow-hidden bg-gradient-to-br from-[#101c12] via-[#060a07] to-[#0c130d]">
          <img
              :src="item.image"
              :alt="item.name"
              loading="lazy"
              class="w-full h-full object-cover"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-small font-bold text-silver truncate">
            <span class="font-display font-tnum">{{ item.quantity }}×</span> {{ item.name }}
          </p>
          <p class="text-tiny text-silver-50 truncate">{{ item.edition }}</p>
        </div>
        <span class="font-display font-tnum text-small font-semibold text-silver-70 whitespace-nowrap">
          {{ item.price > 0 ? `$${(item.price * item.quantity).toFixed(2)}` : 'N/A' }}
        </span>
      </li>
    </ul>

    <!-- Footer: total + actions -->
    <div class="px-4 py-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
      <span class="text-small text-silver-50">
        {{ t('matches.buyRequests.total') }}
        <b class="font-display font-tnum text-[16px] font-bold text-neon ml-1.5">${{ request.totalValue.toFixed(2) }}</b>
      </span>
      <div class="flex items-center gap-2">
        <BaseButton variant="danger" size="small" class="flex items-center gap-1.5" @click="emit('delete', request.id)">
          <IconV2 name="trash" :size="15" />
          {{ t('matches.buyRequests.delete') }}
        </BaseButton>
        <BaseButton
            v-if="request.status !== 'fulfilled'"
            size="small"
            class="flex items-center gap-1.5"
            @click="emit('fulfill', request.id)"
        >
          <IconV2 name="check" :size="15" />
          {{ t('matches.buyRequests.fulfill') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
