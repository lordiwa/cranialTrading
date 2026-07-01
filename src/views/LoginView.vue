<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useSeoMeta } from '@unhead/vue';
import { type SupportedLocale, useI18n } from '../composables/useI18n';
import { useScrollReveal } from '../composables/useScrollReveal';
import { useSearchStore } from '../stores/search';
import { applyPricedFirstFilter, isSearchActive, type MinimalCardResult, toMinimalResult } from '../utils/loginCardSearch';
import BaseButton from '../components/ui/BaseButton.vue';
import SvgIcon from '../components/ui/SvgIcon.vue';
import LandingHeader from '../components/landing/LandingHeader.vue';
import LandingResults from '../components/landing/LandingResults.vue';
import RegisterPromptModal from '../components/landing/RegisterPromptModal.vue';

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

const headerRef = ref<{ focusSearch: () => void; openLogin: () => void } | null>(null);
const howItWorksRef = ref<HTMLElement | null>(null);
const footerRef = ref<HTMLElement | null>(null);

const runSearch = async () => {
  if (!isSearchActive(query.value)) return;
  lastSearchedQuery.value = query.value;
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

const features = computed(() => [
  {
    icon: 'handshake',
    title: t('landing.features.matching.title'),
    description: t('landing.features.matching.description')
  },
  {
    icon: 'collection',
    title: t('landing.features.collection.title'),
    description: t('landing.features.collection.description')
  },
  {
    icon: 'box',
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
      </div>

      <!-- Idle: hero + marketing -->
      <div v-show="!active">
        <!-- Hero -->
        <section class="max-w-[1280px] mx-auto px-6 py-12 lg:py-16 text-center">
          <span class="inline-block px-3 py-1 mb-4 text-tiny font-bold text-neon border border-neon-40 rounded-full">
            {{ t('landing.marketplace.hero.badge') }}
          </span>

          <h1 class="text-h1 lg:text-h1 font-bold text-silver leading-tight mb-4">
            From Trash<br/>
            <span class="text-neon">to Treasures</span>
          </h1>

          <p class="text-body text-silver-70 max-w-xl mx-auto mb-8">
            {{ t('landing.subtitle') }}
          </p>

          <div class="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <BaseButton variant="filled" @click="focusHeaderSearch">
              {{ t('landing.marketplace.hero.ctaSearch') }}
            </BaseButton>
            <RouterLink to="/register">
              <BaseButton variant="secondary">{{ t('landing.hero.cta') }}</BaseButton>
            </RouterLink>
          </div>

          <div class="flex flex-col items-center gap-2">
            <p class="text-tiny text-silver-50">{{ t('landing.marketplace.hero.popularLabel') }}</p>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <button
                  v-for="term in popularSearches"
                  :key="term"
                  type="button"
                  class="px-3 py-1 text-tiny text-silver-70 border border-silver-20 rounded-full hover:border-neon hover:text-neon transition-fast"
                  @click="handleChipClick(term)"
              >
                {{ term }}
              </button>
            </div>
          </div>
        </section>

        <!-- How It Works -->
        <section ref="howItWorksRef" class="scroll-reveal max-w-[1280px] mx-auto px-6 py-12">
          <h2 class="text-h3 font-bold text-silver mb-8 text-center">{{ t('landing.howItWorks.title') }}</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neon-10 border-2 border-neon mb-4">
                <SvgIcon name="plus" size="large" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-2">{{ t('landing.howItWorks.step1.title') }}</h3>
              <p class="text-tiny text-silver-50">{{ t('landing.howItWorks.step1.desc') }}</p>
            </div>

            <div class="text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neon-10 border-2 border-neon mb-4">
                <SvgIcon name="search" size="large" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-2">{{ t('landing.howItWorks.step2.title') }}</h3>
              <p class="text-tiny text-silver-50">{{ t('landing.howItWorks.step2.desc') }}</p>
            </div>

            <div class="text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neon-10 border-2 border-neon mb-4">
                <SvgIcon name="chat" size="large" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-2">{{ t('landing.howItWorks.step3.title') }}</h3>
              <p class="text-tiny text-silver-50">{{ t('landing.howItWorks.step3.desc') }}</p>
            </div>
          </div>
        </section>

        <!-- Feature Deep-Dive -->
        <section class="scroll-reveal max-w-[1280px] mx-auto px-6 py-12">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
                v-for="feature in features"
                :key="feature.title"
                class="bg-primary/90 border border-silver-20 p-5 hover:border-neon-40 transition-all rounded-md group"
            >
              <div class="mb-3 w-10 h-10 bg-neon-10 rounded-full flex items-center justify-center group-hover:bg-neon-15 transition-colors">
                <SvgIcon :name="feature.icon" size="small" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-1">{{ feature.title }}</h3>
              <p class="text-tiny text-silver-50">{{ feature.description }}</p>
            </div>
          </div>
        </section>

        <!-- Why Cranial Trading + footer-strip CTA -->
        <section class="scroll-reveal max-w-[1280px] mx-auto px-6 py-12">
          <h2 class="text-h3 font-bold text-silver mb-6 text-center">{{ t('landing.comparison.title') }}</h2>
          <ul class="space-y-4 max-w-2xl mx-auto">
            <li
              v-for="row in comparisonRows"
              :key="row"
              class="flex items-start gap-3 p-4 bg-secondary/20 border border-silver-10 rounded-md"
            >
              <span class="text-neon text-body mt-0.5 flex-shrink-0">&#10003;</span>
              <div>
                <h3 class="text-small font-bold text-silver">{{ t(`landing.comparison.rows.${row}.label`) }}</h3>
                <p class="text-tiny text-silver-50">{{ t(`landing.comparison.rows.${row}.us`) }}</p>
              </div>
            </li>
          </ul>
          <div class="mt-8 text-center">
            <RouterLink to="/register" class="inline-block">
              <BaseButton variant="filled">{{ t('landing.comparison.cta') }}</BaseButton>
            </RouterLink>
          </div>
        </section>
      </div>
    </main>

    <!-- Footer -->
    <footer ref="footerRef" class="border-t border-silver-20 bg-secondary/30">
      <div class="max-w-[1280px] mx-auto px-6 py-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <!-- Platform -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">{{ t('landing.footer.platform') }}</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/login" class="hover:text-neon transition-fast">{{ t('auth.login.title') }}</RouterLink></li>
              <li><RouterLink to="/register" class="hover:text-neon transition-fast">{{ t('auth.register.title') }}</RouterLink></li>
              <li><span class="text-silver-30">{{ t('header.nav.collection') }}</span></li>
              <li><span class="text-silver-30">Matches</span></li>
            </ul>
          </div>

          <!-- Help -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">{{ t('landing.footer.help') }}</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/faq" class="hover:text-neon transition-fast">{{ t('landing.footer.faq') }}</RouterLink></li>
              <li><RouterLink to="/guide/card-conditions" class="hover:text-neon transition-fast">{{ t('landing.footer.cardConditionGuide') }}</RouterLink></li>
              <li><RouterLink to="/guide/how-to-trade" class="hover:text-neon transition-fast">{{ t('landing.footer.howToTradeSafely') }}</RouterLink></li>
              <li><RouterLink to="/about" class="hover:text-neon transition-fast">{{ t('landing.footer.about') }}</RouterLink></li>
              <li><RouterLink to="/contact" class="hover:text-neon transition-fast">{{ t('landing.footer.contactUs') }}</RouterLink></li>
            </ul>
          </div>

          <!-- Legal -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">{{ t('landing.footer.legal') }}</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/terms" class="hover:text-neon transition-fast">{{ t('legal.terms.title') }}</RouterLink></li>
              <li><RouterLink to="/privacy" class="hover:text-neon transition-fast">{{ t('legal.privacy.title') }}</RouterLink></li>
              <li><RouterLink to="/cookies" class="hover:text-neon transition-fast">{{ t('legal.cookies.title') }}</RouterLink></li>
            </ul>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="pt-6 border-t border-silver-20 flex flex-col md:flex-row items-center justify-between gap-4">
          <p class="text-tiny text-silver-50">
            {{ t('legal.footer.copyright') }}
          </p>

          <!-- Language Selector -->
          <div class="flex items-center gap-2">
            <span class="text-tiny text-silver-50">{{ t('footer.language') }}:</span>
            <div class="flex items-center gap-1">
              <button
                v-for="lang in languages"
                :key="lang.code"
                @click="setLocale(lang.code)"
                :title="lang.name"
                :class="[
                  'px-2 py-1 text-tiny font-bold rounded transition-colors',
                  locale === lang.code
                    ? 'bg-neon text-primary'
                    : 'text-silver-50 hover:text-neon hover:bg-silver-5'
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
