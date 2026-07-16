<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { formatCardMeta, type MinimalCardResult, shouldShowNoResults } from '../../utils/loginCardSearch';
import BaseLoader from '../ui/BaseLoader.vue';
import IconV2 from '../ui/IconV2.vue';

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
  <section class="max-w-[1000px] mx-auto px-6 py-9 border-t border-line mt-8">
    <h2 class="font-display text-h2 font-bold text-silver mb-5">
      {{ t('landing.marketplace.results.titleFor', { query: props.query }) }}
    </h2>

    <div v-if="loading" class="py-16">
      <BaseLoader size="large" />
    </div>

    <div v-else-if="results.length > 0" class="grid gap-3.5" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));">
      <div
          v-for="card in results"
          :key="card.id"
          class="flex flex-col gap-2 p-2.5 bg-surface-1 border border-line rounded-lg hover:bg-surface-2 hover:border-line-strong hover:-translate-y-0.5 hover:shadow-medium transition-all duration-200 ease-v2"
      >
        <div class="aspect-[63/88] bg-primary border border-line rounded-md overflow-hidden">
          <img
              v-if="card.imageUrl"
              :src="card.imageUrl"
              :alt="card.name"
              loading="lazy"
              class="w-full h-full object-cover"
          />
        </div>
        <p class="text-small font-bold text-silver truncate" :title="card.name">{{ card.name }}</p>
        <p v-if="formatCardMeta(card.setName, card.typeLine)" class="text-tiny text-silver-50 truncate">
          {{ formatCardMeta(card.setName, card.typeLine) }}
        </p>
        <p class="font-display font-tnum text-[16px] font-bold text-neon">
          {{ card.priceUsd !== null ? `$${card.priceUsd.toFixed(2)}` : 'N/A' }}
        </p>
        <button
            type="button"
            class="w-full min-h-[38px] border border-neon text-neon text-[11px] font-bold uppercase tracking-[.1em] rounded-md hover:bg-neon-10 hover:shadow-glow-neon transition-all duration-200 ease-v2 flex items-center justify-center gap-1.5"
            @click="emit('want', card)"
        >
          <IconV2 name="heart" :size="14" />
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
