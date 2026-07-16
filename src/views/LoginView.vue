<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useSeoMeta } from '@unhead/vue';
import { type SupportedLocale, useI18n } from '../composables/useI18n';
import { useScrollReveal } from '../composables/useScrollReveal';
import { useSearchStore } from '../stores/search';
import { searchPublicCards } from '../services/publicCardSearch';
import { applyPricedFirstFilter, isSearchActive, mapSellers, type MinimalCardResult, type SellerResult, toMinimalResult } from '../utils/loginCardSearch';
import IconV2 from '../components/ui/IconV2.vue';
import LandingHeader from '../components/landing/LandingHeader.vue';
import LandingResults from '../components/landing/LandingResults.vue';
import LandingSellers from '../components/landing/LandingSellers.vue';
import RegisterPromptModal from '../components/landing/RegisterPromptModal.vue';

// TASK-085 seller-teaser cap — small on purpose, this is a landing teaser,
// not the full /search "other users" list (which uses the default max=20).
const SELLERS_MAX = 6;

// Marketplace, search-first landing (TASK-086) — full structural
// replacement of the old two-column LoginView. Header owns the search bar
// + login dropdown; this view owns the idle (hero/marketing) vs active
// (results grid) body toggle plus the registration-prompt gate.

const { t, locale, setLocale } = useI18n();

const languages = [
  { code: 'es' as SupportedLocale, label: 'ES', name: 'Español' },
  { code: 'en' as SupportedLocale, label: 'EN', name: 'English' },
  { code: 'pt' as SupportedLocale, label: 'PT', name: 'Português' },
];

const searchStore = useSearchStore();

useScrollReveal();

useSeoMeta({
  ogTitle: t('seo.pages.login.title') + ' | Cranial Trading',
  ogDescription: t('seo.pages.login.description'),
  ogType: 'website',
  ogUrl: 'https://cranial-trading.web.app/login',
  ogSiteName: 'Cranial Trading',
  twitterCard: 'summary_large_image',
});

// --- Search state (idle <-> active body toggle) ---
const query = ref('');
const active = computed(() => isSearchActive(query.value));
const results = computed<MinimalCardResult[]>(() =>
  applyPricedFirstFilter(searchStore.results).map(toMinimalResult)
);

// Review fix (MEDIUM-1): tracks the query a search actually completed for,
// so LandingResults can tell "still typing, never searched" apart from
// "searched this exact text and got zero results" — see
// shouldShowNoResults in utils/loginCardSearch.ts.
const lastSearchedQuery = ref('');

// TASK-085: "Quién la vende" — independent from the Scryfall catalog's own
// loading state so a slow public_cards read never blocks the catalog render
// (or vice versa). Fired-and-forgotten from runSearch, not awaited.
const sellers = ref<SellerResult[]>([]);
const loadingSellers = ref(false);

const headerRef = ref<{ focusSearch: () => void; openLogin: () => void } | null>(null);
const howItWorksRef = ref<HTMLElement | null>(null);
const footerRef = ref<HTMLElement | null>(null);

// Review fix (M2, polished): two quick submits fire two overlapping
// loadSellers calls for different terms — nothing guarantees they resolve
// in the order they were issued. Compare against lastSearchedQuery (the
// last SUBMITTED term), not query (the live v-model) — otherwise typing
// further without re-submitting would drop the in-flight response and
// leave loadingSellers wedged true until the next submit. Only apply a
// response (and clear loading) if its term is still the last submitted
// term when it resolves; an out-of-order stale response is silently
// dropped instead of clobbering a newer one.
const loadSellers = async (term: string) => {
  loadingSellers.value = true;
  try {
    const cards = await searchPublicCards(term, null, SELLERS_MAX);
    if (term !== lastSearchedQuery.value) return;
    sellers.value = mapSellers(cards);
  } finally {
    if (term === lastSearchedQuery.value) loadingSellers.value = false;
  }
};

const runSearch = async () => {
  if (!isSearchActive(query.value)) return;
  lastSearchedQuery.value = query.value;
  void loadSellers(query.value);
  await searchStore.search({ name: query.value });
};

const handleChipClick = (term: string) => {
  query.value = term;
  void runSearch();
};

const focusHeaderSearch = () => {
  headerRef.value?.focusSearch();
};

const scrollToHowItWorks = async () => {
  if (active.value) query.value = '';
  await nextTick();
  howItWorksRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// COMUNIDAD has no dedicated page yet — the lightest option is to scroll
// to the footer (platform/help/legal links) rather than add a new route.
const scrollToCommunity = async () => {
  if (active.value) query.value = '';
  await nextTick();
  footerRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const popularSearches = ['Black Lotus', 'Lightning Bolt', 'Sol Ring', 'Counterspell', 'Brainstorm'];

// --- Registration-prompt gate ---
const regCard = ref<MinimalCardResult | null>(null);
const showRegModal = computed(() => regCard.value !== null);

const handleWant = (card: MinimalCardResult) => {
  regCard.value = card;
};

const closeRegModal = () => {
  regCard.value = null;
};

const openLoginFromModal = () => {
  closeRegModal();
  headerRef.value?.openLogin();
};

// Icon names map to the IconV2 sprite (design→app v2 F1) — swap/cards/chat
// mirror the equivalent DESIGN-DIRECTION §5 feature icons (i-swap, i-cards,
// i-chat) used by cranial-design/prototype/01-login-desktop.html.
const features = computed(() => [
  {
    icon: 'swap',
    title: t('landing.features.matching.title'),
    description: t('landing.features.matching.description')
  },
  {
    icon: 'cards',
    title: t('landing.features.collection.title'),
    description: t('landing.features.collection.description')
  },
  {
    icon: 'cards',
    title: t('landing.features.decks.title'),
    description: t('landing.features.decks.description')
  },
  {
    icon: 'chat',
    title: t('landing.features.messaging.title'),
    description: t('landing.features.messaging.description')
  }
]);

const comparisonRows = computed(() => [
  'allInOne', 'matching', 'messaging', 'price'
]);
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <LandingHeader
        ref="headerRef"
        v-model:query="query"
        :searching="searchStore.loading"
        @search="runSearch"
        @how-it-works="scrollToHowItWorks"
        @community="scrollToCommunity"
    />

    <main id="main-content" class="flex-1">
      <!-- Active: search results -->
      <div v-show="active">
        <LandingResults
            :query="query"
            :loading="searchStore.loading"
            :results="results"
            :last-searched-query="lastSearchedQuery"
            @want="handleWant"
        />
        <LandingSellers :sellers="sellers" :loading="loadingSellers" />
      </div>

      <!-- Idle: hero + marketing -->
      <div v-show="!active">
        <!-- Hero -->
        <section class="max-w-[1000px] mx-auto px-6 py-16 lg:py-20 text-center">
          <p class="rise font-display text-[11px] font-bold tracking-[.18em] uppercase text-neon mb-4">
            {{ t('landing.marketplace.hero.badge') }}
          </p>

          <h1 class="rise font-display text-h1 lg:text-[54px] font-bold text-silver leading-[1.1] mb-4">
            From Trash<br/>
            <span class="text-neon">to Treasures</span>
          </h1>

          <p class="rise text-body text-silver-50 max-w-xl mx-auto mb-8">
            {{ t('landing.subtitle') }}
          </p>

          <div class="rise flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <button
                type="button"
                class="min-h-[44px] px-6 bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
                @click="focusHeaderSearch"
            >
              {{ t('landing.marketplace.hero.ctaSearch') }}
            </button>
            <RouterLink
                to="/register"
                class="min-h-[44px] flex items-center px-6 border border-line-strong text-silver-70 font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:border-silver-30 hover:text-silver hover:bg-surface-1 transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              {{ t('landing.hero.cta') }}
            </RouterLink>
          </div>

          <div class="rise flex flex-col items-center gap-2">
            <p class="text-tiny text-silver-30 uppercase tracking-[.12em]">{{ t('landing.marketplace.hero.popularLabel') }}</p>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <button
                  v-for="term in popularSearches"
                  :key="term"
                  type="button"
                  class="min-h-[36px] px-3.5 text-small font-semibold text-silver-50 bg-surface-1 border border-line rounded-full hover:text-silver hover:border-line-strong hover:bg-surface-2 transition-all duration-200 ease-v2"
                  @click="handleChipClick(term)"
              >
                {{ term }}
              </button>
            </div>
          </div>
        </section>

        <!-- How It Works -->
        <section ref="howItWorksRef" class="scroll-reveal max-w-[1000px] mx-auto px-6 py-14 border-t border-line">
          <h2 class="font-display text-h2 font-bold text-silver mb-10 text-center">{{ t('landing.howItWorks.title') }}</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div class="text-center p-7 bg-surface-1 border border-line rounded-lg hover:bg-surface-2 hover:border-line-strong hover:-translate-y-0.5 transition-all duration-200 ease-v2">
              <div class="inline-flex items-center justify-center w-[52px] h-[52px] rounded-full bg-neon-10 border border-neon-40 mb-4 text-neon">
                <IconV2 name="plus" :size="24" />
              </div>
              <h3 class="text-h3 font-bold text-silver mb-2">{{ t('landing.howItWorks.step1.title') }}</h3>
              <p class="text-small text-silver-50">{{ t('landing.howItWorks.step1.desc') }}</p>
            </div>

            <div class="text-center p-7 bg-surface-1 border border-line rounded-lg hover:bg-surface-2 hover:border-line-strong hover:-translate-y-0.5 transition-all duration-200 ease-v2">
              <div class="inline-flex items-center justify-center w-[52px] h-[52px] rounded-full bg-neon-10 border border-neon-40 mb-4 text-neon">
                <IconV2 name="search" :size="24" />
              </div>
              <h3 class="text-h3 font-bold text-silver mb-2">{{ t('landing.howItWorks.step2.title') }}</h3>
              <p class="text-small text-silver-50">{{ t('landing.howItWorks.step2.desc') }}</p>
            </div>

            <div class="text-center p-7 bg-surface-1 border border-line rounded-lg hover:bg-surface-2 hover:border-line-strong hover:-translate-y-0.5 transition-all duration-200 ease-v2">
              <div class="inline-flex items-center justify-center w-[52px] h-[52px] rounded-full bg-neon-10 border border-neon-40 mb-4 text-neon">
                <IconV2 name="chat" :size="24" />
              </div>
              <h3 class="text-h3 font-bold text-silver mb-2">{{ t('landing.howItWorks.step3.title') }}</h3>
              <p class="text-small text-silver-50">{{ t('landing.howItWorks.step3.desc') }}</p>
            </div>
          </div>
        </section>

        <!-- Feature Deep-Dive -->
        <section class="scroll-reveal max-w-[1000px] mx-auto px-6 py-14 border-t border-line">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
                v-for="feature in features"
                :key="feature.title"
                class="flex gap-4 bg-surface-1 border border-line p-5 hover:bg-surface-2 hover:border-line-strong transition-all duration-200 ease-v2 rounded-lg"
            >
              <div class="flex-shrink-0 w-[42px] h-[42px] bg-surface-3 rounded-md flex items-center justify-center text-neon">
                <IconV2 :name="feature.icon" :size="22" />
              </div>
              <div>
                <h3 class="text-h3 font-bold text-silver mb-1">{{ feature.title }}</h3>
                <p class="text-small text-silver-50">{{ feature.description }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Why Cranial Trading + footer-strip CTA -->
        <section class="scroll-reveal max-w-[1000px] mx-auto px-6 py-14 border-t border-line">
          <h2 class="font-display text-h2 font-bold text-silver mb-6 text-center">{{ t('landing.comparison.title') }}</h2>
          <ul class="space-y-3 max-w-xl mx-auto">
            <li
              v-for="row in comparisonRows"
              :key="row"
              class="flex items-start gap-3 p-4 bg-surface-1 border border-line rounded-lg"
            >
              <IconV2 name="check" :size="18" class="text-neon mt-0.5 flex-shrink-0" />
              <div>
                <h3 class="text-small font-bold text-silver">{{ t(`landing.comparison.rows.${row}.label`) }}</h3>
                <p class="text-tiny text-silver-50">{{ t(`landing.comparison.rows.${row}.us`) }}</p>
              </div>
            </li>
          </ul>
          <div class="mt-8 text-center">
            <RouterLink
                to="/register"
                class="inline-flex items-center justify-center min-h-[44px] px-6 bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              {{ t('landing.comparison.cta') }}
            </RouterLink>
          </div>
        </section>
      </div>
    </main>

    <!-- Footer -->
    <footer ref="footerRef" class="border-t border-line">
      <div class="max-w-[1000px] mx-auto px-6 py-12">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <!-- Platform -->
          <div>
            <h4 class="font-display text-[12px] font-semibold uppercase tracking-[.1em] text-silver-50 mb-3.5">{{ t('landing.footer.platform') }}</h4>
            <ul class="space-y-2.5 text-small text-silver-30">
              <li><RouterLink to="/login" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('auth.login.title') }}</RouterLink></li>
              <li><RouterLink to="/register" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('auth.register.title') }}</RouterLink></li>
              <li><span class="text-silver-30">{{ t('header.nav.collection') }}</span></li>
              <li><span class="text-silver-30">Matches</span></li>
            </ul>
          </div>

          <!-- Help -->
          <div>
            <h4 class="font-display text-[12px] font-semibold uppercase tracking-[.1em] text-silver-50 mb-3.5">{{ t('landing.footer.help') }}</h4>
            <ul class="space-y-2.5 text-small text-silver-30">
              <li><RouterLink to="/faq" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('landing.footer.faq') }}</RouterLink></li>
              <li><RouterLink to="/guide/card-conditions" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('landing.footer.cardConditionGuide') }}</RouterLink></li>
              <li><RouterLink to="/guide/how-to-trade" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('landing.footer.howToTradeSafely') }}</RouterLink></li>
              <li><RouterLink to="/about" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('landing.footer.about') }}</RouterLink></li>
              <li><RouterLink to="/contact" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('landing.footer.contactUs') }}</RouterLink></li>
            </ul>
          </div>

          <!-- Legal -->
          <div>
            <h4 class="font-display text-[12px] font-semibold uppercase tracking-[.1em] text-silver-50 mb-3.5">{{ t('landing.footer.legal') }}</h4>
            <ul class="space-y-2.5 text-small text-silver-30">
              <li><RouterLink to="/terms" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('legal.terms.title') }}</RouterLink></li>
              <li><RouterLink to="/privacy" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('legal.privacy.title') }}</RouterLink></li>
              <li><RouterLink to="/cookies" class="hover:text-neon transition-colors duration-200 ease-v2">{{ t('legal.cookies.title') }}</RouterLink></li>
            </ul>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="pt-6 border-t border-line flex flex-col md:flex-row items-center justify-between gap-4">
          <p class="text-tiny text-silver-30">
            {{ t('legal.footer.copyright') }}
          </p>

          <!-- Language Selector -->
          <div class="flex items-center gap-2">
            <span class="text-tiny text-silver-30">{{ t('footer.language') }}:</span>
            <div class="flex items-center gap-1">
              <button
                v-for="lang in languages"
                :key="lang.code"
                @click="setLocale(lang.code)"
                :title="lang.name"
                :class="[
                  'px-2 py-0.5 font-display text-tiny font-bold rounded transition-colors duration-200 ease-v2',
                  locale === lang.code
                    ? 'bg-neon-15 text-neon'
                    : 'text-silver-30 hover:text-neon hover:bg-surface-2'
                ]"
              >
                {{ lang.label }}
              </button>
            </div>
          </div>

          <p class="text-tiny text-silver-30">
            Magic: The Gathering™ Wizards of the Coast
          </p>
        </div>
      </div>
    </footer>

    <RegisterPromptModal
        :show="showRegModal"
        :card-name="regCard?.name ?? ''"
        @close="closeRegModal"
        @login="openLoginFromModal"
    />
  </div>
</template>

<style scoped>
/* Scroll reveal */
.scroll-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}
.scroll-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}
</style>
