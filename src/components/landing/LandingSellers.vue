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
  <section v-if="loading || sellers.length > 0" class="max-w-[1280px] mx-auto px-6 pb-8">
    <h2 class="text-h4 font-bold text-silver mb-3">{{ t('landing.marketplace.sellers.title') }}</h2>

    <div v-if="loading" class="py-8">
      <BaseLoader size="small" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-2">
      <RouterLink
          v-for="seller in sellers"
          :key="seller.id"
          :to="`/@${seller.username}`"
          class="flex items-center gap-3 px-4 py-3 bg-primary/90 border border-silver-20 rounded-md hover:border-neon transition-fast"
      >
        <img
            :src="getAvatarUrlForUser(seller.username, 32, seller.avatarUrl)"
            :alt="`${seller.username} avatar`"
            width="32"
            height="32"
            class="w-8 h-8 rounded-full flex-shrink-0"
        />
        <div class="flex-1 min-w-0">
          <p v-if="seller.cardName" translate="no" class="text-small font-bold text-silver truncate">{{ seller.cardName }}</p>
          <p class="text-tiny text-silver-50 truncate">
            @{{ seller.username }} · {{ t(`common.status.${seller.status}`) }}
          </p>
        </div>
        <span v-if="seller.price !== null" class="text-small font-bold text-neon flex-shrink-0">
          ${{ seller.price.toFixed(2) }}
        </span>
      </RouterLink>
    </div>
  </section>
</template>
