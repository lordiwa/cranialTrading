<script setup lang="ts">
import { useI18n } from '../../composables/useI18n';
import { getAvatarUrlForUser } from '../../utils/avatar';
import type { SellerResult } from '../../utils/loginCardSearch';
import BaseLoader from '../ui/BaseLoader.vue';

// TASK-085: compact "who's selling it" section on the anonymous login-page
// search. Driven by an independent loading/result pair in LoginView (see
// loadSellers there) so a slow public_cards read never blocks the Scryfall
// catalog in LandingResults. Hidden entirely when there's nothing to show —
// no "no sellers" message, mirroring the ticket's "don't flash" requirement.

defineProps<{
  sellers: SellerResult[];
  loading: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <section v-if="loading || sellers.length > 0" class="max-w-[1000px] mx-auto px-6 pb-9 border-t border-line pt-9">
    <h2 class="font-display text-h2 font-bold text-silver mb-5">{{ t('landing.marketplace.sellers.title') }}</h2>

    <div v-if="loading" class="py-8">
      <BaseLoader size="small" />
    </div>

    <div v-else class="bg-surface-1 border border-line rounded-lg overflow-hidden">
      <RouterLink
          v-for="(seller, index) in sellers"
          :key="seller.id"
          :to="`/@${seller.username}`"
          :class="[
            'flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2 transition-colors duration-200 ease-v2',
            index > 0 ? 'border-t border-line' : ''
          ]"
      >
        <img
            :src="getAvatarUrlForUser(seller.username, 42, seller.avatarUrl)"
            :alt="`${seller.username} avatar`"
            width="42"
            height="42"
            class="w-[42px] h-[42px] rounded-full flex-shrink-0 border-2 border-neon-40"
        />
        <div class="flex-1 min-w-0">
          <p v-if="seller.cardName" translate="no" class="text-small font-bold text-silver truncate">{{ seller.cardName }}</p>
          <p class="text-tiny text-silver-50 truncate">
            @{{ seller.username }} · {{ t(`common.status.${seller.status}`) }}
          </p>
        </div>
        <span v-if="seller.price !== null" class="font-display font-tnum text-[17px] font-bold text-neon flex-shrink-0">
          ${{ seller.price.toFixed(2) }}
        </span>
      </RouterLink>
    </div>
  </section>
</template>
