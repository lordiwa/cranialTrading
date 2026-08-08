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
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../composables/useI18n';
import AppContainer from '../components/layout/AppContainer.vue';
import AnnouncementsCarousel from '../components/home/AnnouncementsCarousel.vue';
import GlobalSearch from '../components/ui/GlobalSearch.vue';
import IconV2 from '../components/ui/IconV2.vue';

const { t } = useI18n();
const router = useRouter();

// Rafael on dev: "el buscador de inicio no muestra sugerencias parece roto". It was
// never broken — it was a bare input, while the header search is a real combobox
// backed by useGlobalSearch. Shipping a hand-rolled autocomplete here would have
// created a SIXTH independent search surface, which is exactly the shape that
// produced the debounce/race bug fixed across five surfaces in v1.53.1. So the hero
// now renders the same GlobalSearch component the header uses: identical
// suggestions, debounce, keyboard navigation and ARIA wiring, one implementation.
const searchRef = ref<{ focus: () => void } | null>(null);

// AppHeader hides its own search on this route and stops handling "/" here, so the
// shortcut is ours to own — it focuses the hero search, which IS this page's search.
// Same guards as the header's handler so it never steals a keystroke from someone
// already typing.
const handleSlash = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    searchRef.value?.focus();
  }
};

onMounted(() => {
  globalThis.addEventListener('keydown', handleSlash);
});
onUnmounted(() => {
  globalThis.removeEventListener('keydown', handleSlash);
});

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

      <!-- The header's own search component, reused verbatim: suggestions, debounce,
           keyboard nav and ARIA all come from useGlobalSearch instead of a second
           implementation that would drift from it. -->
      <div class="mt-8 text-left" data-testid="home-search">
        <GlobalSearch ref="searchRef" class="w-full" />
      </div>

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

      <!-- Announcements — content ships in the bundle (src/data/announcements.ts),
           so this costs no Firestore reads. -->
      <div class="mt-10">
        <AnnouncementsCarousel />
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
