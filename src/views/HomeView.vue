<script setup lang="ts">
/**
 * HomeView — the authenticated landing (/inicio).
 *
 * Rafael's constraint, and the whole reason this view exists: ZERO Firestore reads
 * on mount. Landing on /saved-matches meant the first thing after login was the
 * match recalculation (144s → 36s after the v1.53.2 batch, but still the ceiling).
 * This view reads nothing — no collection, no card_index, no matches, no counters —
 * so it paints as soon as the bundle does.
 *
 * That constraint is why there are no numbers on this screen. Every counter worth
 * showing (cards owned, new matches, unread messages) costs at least one read, so
 * adding one later is a deliberate reversal of this decision, not a tweak.
 *
 * Match recalculation now happens when you actually open /saved-matches.
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../composables/useI18n';
import AppContainer from '../components/layout/AppContainer.vue';
import IconV2 from '../components/ui/IconV2.vue';

const { t } = useI18n();
const router = useRouter();

const searchQuery = ref('');

// Static list on purpose — pulling "popular" from real data would mean a read.
const popularSearches = ['Black Lotus', 'Lightning Bolt', 'Sol Ring', 'Counterspell', 'Brainstorm'];

// The three post-RED nav destinations. Decks is deliberately NOT here: there is no
// `header.nav.decks` key in the locales and no deck symbol in the v2 sprite, so adding
// it means inventing both — a call for Rafael, not a silent one.
const quickLinks = [
  { to: '/collection', labelKey: 'header.nav.collection', icon: 'cards' },
  { to: '/saved-matches', labelKey: 'header.nav.matches', icon: 'swap' },
  { to: '/collection?filter=wishlist', labelKey: 'header.nav.wishlist', icon: 'star' },
] as const;

const submitSearch = () => {
  const q = searchQuery.value.trim();
  void router.push(q ? { path: '/search', query: { q } } : '/search');
};

const searchTerm = (term: string) => {
  void router.push({ path: '/search', query: { q: term } });
};
</script>

<template>
  <!-- AppContainer owns the shell (header, nav, tab bar) AND the single
       <main id="main-content"> landmark — this view must not declare its own. -->
  <AppContainer>
    <div class="min-h-[60vh] flex flex-col items-center justify-center">
    <div class="w-full max-w-[640px] text-center">
      <h1 class="text-h2 md:text-h1 font-display font-bold text-silver">{{ t('home.title') }}</h1>
      <p class="mt-3 text-small md:text-body text-silver-50">{{ t('home.subtitle') }}</p>

      <!-- v2 search pill — same vocabulary as LandingHeader/GlobalSearch -->
      <form
          class="mt-8 flex items-center gap-2 border border-line rounded-full pl-5 pr-1.5 py-1.5 bg-surface-1 focus-within:border-neon focus-within:shadow-glow-neon transition-all duration-200 ease-v2"
          @submit.prevent="submitSearch"
      >
        <IconV2 name="search" :size="20" class="text-silver-30 pointer-events-none flex-shrink-0" />
        <input
            v-model="searchQuery"
            data-testid="home-search-input"
            type="search"
            :aria-label="t('home.placeholder')"
            :placeholder="t('home.placeholder')"
            class="flex-1 min-w-0 bg-transparent border-none py-2 text-body text-silver placeholder-silver-30 outline-none focus:outline-none"
        />
        <button
            type="submit"
            data-testid="home-search-submit"
            class="px-4 py-2 bg-neon text-primary font-bold text-[11px] uppercase tracking-[.1em] rounded-full hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 flex-shrink-0"
        >
          {{ t('header.nav.search') }}
        </button>
      </form>

      <!-- Popular searches -->
      <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
        <span class="text-tiny text-silver-30 uppercase tracking-[.12em]">{{ t('home.popularLabel') }}</span>
        <button
            v-for="term in popularSearches"
            :key="term"
            type="button"
            class="min-h-[34px] px-3 rounded-full border border-line bg-surface-1 text-small text-silver-50 hover:text-silver hover:border-line-strong transition-all duration-200 ease-v2"
            @click="searchTerm(term)"
        >
          {{ term }}
        </button>
      </div>

      <!-- Quick links -->
      <div class="mt-10">
        <p class="text-tiny text-silver-30 uppercase tracking-[.12em]">{{ t('home.quickLinks') }}</p>
        <div class="mt-3 flex flex-wrap items-center justify-center gap-3">
          <RouterLink
              v-for="link in quickLinks"
              :key="link.to"
              :to="link.to"
              class="min-h-[44px] inline-flex items-center gap-2 px-lg rounded-md border border-line-strong text-silver-70 font-bold text-[12px] uppercase tracking-[.1em] hover:border-silver-30 hover:text-silver hover:bg-surface-1 transition-all duration-200 ease-v2"
          >
            <IconV2 :name="link.icon" :size="18" />
            {{ t(link.labelKey) }}
          </RouterLink>
        </div>
      </div>
    </div>
    </div>
  </AppContainer>
</template>
