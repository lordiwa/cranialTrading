<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { formatCardMeta, type MinimalCardResult, shouldShowNoResults } from '../../utils/loginCardSearch';
import BaseLoader from '../ui/BaseLoader.vue';

// Marketplace results grid (TASK-086). Only mounted by LoginView while the
// query is active (non-empty) — the "no query" idle state lives in the
// hero section instead, so this component only needs to cover the
// loading / no-results / grid states.
//
// Review fix (MEDIUM-1): `lastSearchedQuery` (the query a search actually
// completed for) gates the "no results" message so it never flashes for
// a query the user is still typing but hasn't submitted yet.

const props = defineProps<{
  query: string;
  loading: boolean;
  results: MinimalCardResult[];
  lastSearchedQuery: string;
}>();

const emit = defineEmits<{
  want: [card: MinimalCardResult];
}>();

const { t } = useI18n();

const showNoResults = computed(() => shouldShowNoResults({
  loading: props.loading,
  query: props.query,
  lastSearchedQuery: props.lastSearchedQuery,
  resultsCount: props.results.length,
}));
</script>

<template>
  <section class="max-w-[1280px] mx-auto px-6 py-8">
    <h2 class="text-h3 font-bold text-silver mb-6">
      {{ t('landing.marketplace.results.titleFor', { query: props.query }) }}
    </h2>

    <div v-if="loading" class="py-16">
      <BaseLoader size="large" />
    </div>

    <div v-else-if="results.length > 0" class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));">
      <div
          v-for="card in results"
          :key="card.id"
          class="bg-primary/90 border border-silver-20 rounded-md p-2 hover:border-neon transition-fast flex flex-col"
      >
        <div class="aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden rounded">
          <img
              v-if="card.imageUrl"
              :src="card.imageUrl"
              :alt="card.name"
              loading="lazy"
              class="w-full h-full object-cover"
          />
        </div>
        <p class="text-tiny font-bold text-silver mt-2 truncate" :title="card.name">{{ card.name }}</p>
        <p v-if="formatCardMeta(card.setName, card.typeLine)" class="text-tiny text-silver-50 truncate">
          {{ formatCardMeta(card.setName, card.typeLine) }}
        </p>
        <p class="text-small font-bold text-neon mt-1">
          {{ card.priceUsd !== null ? `$${card.priceUsd.toFixed(2)}` : 'N/A' }}
        </p>
        <button
            type="button"
            class="mt-2 w-full px-2 py-1.5 border border-neon text-neon text-tiny font-bold rounded hover:bg-neon-10 transition-fast"
            @click="emit('want', card)"
        >
          {{ t('landing.marketplace.results.wantThis') }}
        </button>
      </div>
    </div>

    <!--
      Neither loading nor a completed search for the CURRENT query yet
      (user is still typing — see shouldShowNoResults docstring): render
      nothing rather than a misleading "no results" message.
    -->
    <p v-else-if="showNoResults" class="text-body text-silver-50 py-8">
      {{ t('landing.marketplace.results.noResults') }}
    </p>
  </section>
</template>
