<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import IconV2 from '../ui/IconV2.vue';
import HeaderLoginDropdown from './HeaderLoginDropdown.vue';

// Marketplace header (TASK-086): replaces the old two-column LoginView
// layout. Desktop = wordmark + centered full-width search + "Iniciar
// sesión" dropdown + category row. Mobile = sticky [hamburger | wordmark |
// person] bar with the search bar as the first content right below it
// (search-first, the whole point of the redesign).
//
// TASK-102 (F7a): visual-only v2 restyle (bg-hdr/blur, surface/line tokens,
// IconV2, font-display) — no structural/behavioral change from TASK-086.
//
// Review fix (HIGH-1): the desktop/mobile split used to be CSS-only
// (hidden lg:block / lg:hidden), so BOTH subtrees were always in the DOM —
// when loginOpen was true there were two <HeaderLoginDropdown> instances
// mounted at once (two input[type=email], two button[type=submit]), which
// broke e2e strict-mode locators AND was a real a11y duplicate-field bug.
// Now a reactive `isDesktop` breakpoint guard renders ONLY the active
// layout's subtree, so the login dropdown and the search input are each
// single-instance in the DOM at any time.

const props = defineProps<{
  query: string;
  searching?: boolean;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  search: [];
  'how-it-works': [];
  community: [];
}>();

const { t } = useI18n();

const queryModel = computed({
  get: () => props.query,
  set: (value: string) => { emit('update:query', value); },
});

const DESKTOP_QUERY = '(min-width: 1024px)';
const isDesktop = ref(
  typeof window !== 'undefined' ? window.matchMedia(DESKTOP_QUERY).matches : true
);
let mql: MediaQueryList | null = null;
const handleBreakpointChange = (e: MediaQueryListEvent) => { isDesktop.value = e.matches; };

const loginOpen = ref(false);
const mobileMenuOpen = ref(false);

const searchInputRef = ref<HTMLInputElement | null>(null);
const loginPanelRef = ref<HTMLElement | null>(null);
const mobileMenuPanelRef = ref<HTMLElement | null>(null);

const closeLogin = () => { loginOpen.value = false; };
const toggleLogin = () => { loginOpen.value = !loginOpen.value; mobileMenuOpen.value = false; };
const toggleMobileMenu = () => { mobileMenuOpen.value = !mobileMenuOpen.value; loginOpen.value = false; };

const submitSearch = () => { emit('search'); };

// CATÁLOGO focuses the (single, currently mounted) search input. Exposed
// too, so the hero CTA ("EMPEZÁ A BUSCAR ↑") outside this component can
// trigger the same focus.
const focusSearch = () => {
  searchInputRef.value?.focus();
  mobileMenuOpen.value = false;
};

const openLogin = () => { loginOpen.value = true; mobileMenuOpen.value = false; };

defineExpose({ focusSearch, openLogin });

const handleOutsideClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  // Trigger buttons (hamburger / person icon) already toggle their own
  // panel via @click — ignore them here so the open+outside-click checks
  // on the same event don't immediately close what was just opened.
  if (target.closest?.('[data-menu-trigger]')) return;

  if (loginOpen.value && loginPanelRef.value && !loginPanelRef.value.contains(target)) {
    loginOpen.value = false;
  }
  if (mobileMenuOpen.value && mobileMenuPanelRef.value && !mobileMenuPanelRef.value.contains(target)) {
    mobileMenuOpen.value = false;
  }
};

onMounted(() => {
  if (typeof window !== 'undefined') {
    mql = window.matchMedia(DESKTOP_QUERY);
    mql.addEventListener('change', handleBreakpointChange);
  }
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  mql?.removeEventListener('change', handleBreakpointChange);
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <header class="bg-hdr backdrop-blur-md sticky top-0 z-40 border-b border-line">
    <!-- ============ Desktop ============ -->
    <div v-if="isDesktop" class="max-w-[1200px] mx-auto px-6">
      <!-- Row 1: wordmark + centered search + actions -->
      <div class="flex items-center gap-6 h-16">
        <RouterLink to="/login" class="flex items-center gap-2.5 flex-shrink-0 focus-visible:outline-none focus-visible:shadow-glow-neon rounded-md">
          <svg class="w-9 h-9 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="font-display font-bold text-[17px] tracking-[.14em] text-neon whitespace-nowrap">CRANIAL TRADING</span>
        </RouterLink>

        <form class="flex-1 flex justify-center" @submit.prevent="submitSearch">
          <div class="w-full max-w-[560px] flex items-center gap-2 border border-line rounded-full px-4 py-2 bg-surface-1 focus-within:border-neon focus-within:shadow-glow-neon transition-all duration-200 ease-v2">
            <IconV2 name="search" :size="18" class="text-silver-30 flex-shrink-0" />
            <input
                ref="searchInputRef"
                v-model="queryModel"
                type="text"
                :placeholder="t('landing.marketplace.header.searchPlaceholder')"
                class="flex-1 min-w-0 bg-transparent text-silver placeholder-silver-30 outline-none text-small"
            />
            <!--
              type="button" (not "submit") is intentional: only ONE
              button[type="submit"] should exist on the page at a time (the
              login form's submit, inside the dropdown below) — e2e locates
              it with a non-strict selector. Enter-to-search still works via
              the form's implicit submission (single text input).
            -->
            <button
                type="button"
                :disabled="searching"
                class="px-4 py-1.5 bg-neon text-primary font-bold text-[11px] uppercase tracking-[.1em] rounded-full hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-50 flex-shrink-0"
                @click="submitSearch"
            >
              {{ searching ? t('common.actions.searching') : t('common.actions.search') }}
            </button>
          </div>
        </form>

        <div class="flex items-center gap-3 flex-shrink-0">
          <div ref="loginPanelRef" class="relative">
            <button
                type="button"
                data-testid="login-trigger"
                data-menu-trigger
                class="min-h-[44px] flex items-center gap-2 px-3.5 py-2 border border-line-strong text-silver-70 hover:text-silver hover:bg-surface-1 transition-all duration-200 ease-v2 rounded-md text-small font-bold focus-visible:outline-none focus-visible:shadow-glow-neon"
                @click="toggleLogin"
            >
              <IconV2 name="user" :size="18" />
              {{ t('landing.marketplace.header.loginTrigger') }}
            </button>

            <div
                v-if="loginOpen"
                class="absolute right-0 top-full mt-2 w-[360px] z-50"
            >
              <HeaderLoginDropdown @close="closeLogin" />
            </div>
          </div>

          <RouterLink
              to="/register"
              class="min-h-[44px] flex items-center gap-2 px-3.5 py-2 border border-neon text-neon font-bold hover:bg-neon-10 hover:shadow-glow-neon transition-all duration-200 ease-v2 rounded-md text-small focus-visible:outline-none focus-visible:shadow-glow-neon"
              :title="t('landing.marketplace.header.wantTrigger')"
          >
            <IconV2 name="heart" :size="18" />
            {{ t('landing.marketplace.header.wantTrigger') }}
          </RouterLink>
        </div>
      </div>

      <!-- Row 2: categories -->
      <div class="flex items-center justify-between h-12 border-t border-line">
        <nav class="flex items-center gap-6">
          <button
              type="button"
              class="text-[12px] font-bold uppercase tracking-[.12em] text-silver-50 hover:text-silver transition-colors duration-200 ease-v2"
              @click="focusSearch"
          >
            {{ t('landing.marketplace.header.catalog') }}
          </button>
          <button
              type="button"
              class="text-[12px] font-bold uppercase tracking-[.12em] text-silver-50 hover:text-silver transition-colors duration-200 ease-v2"
              @click="emit('how-it-works')"
          >
            {{ t('landing.marketplace.header.howItWorks') }}
          </button>
          <button
              type="button"
              class="text-[12px] font-bold uppercase tracking-[.12em] text-silver-50 hover:text-silver transition-colors duration-200 ease-v2"
              @click="emit('community')"
          >
            {{ t('landing.marketplace.header.community') }}
          </button>
        </nav>

        <RouterLink
            to="/register"
            class="inline-flex items-center justify-center gap-2 min-h-[38px] px-4 bg-neon text-primary font-bold text-[11px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
        >
          {{ t('landing.marketplace.header.createAccount') }}
        </RouterLink>
      </div>
    </div>

    <!-- ============ Mobile ============ -->
    <div v-else>
      <div class="flex items-center justify-between h-14 px-4">
        <button
            type="button"
            data-menu-trigger
            class="relative inline-flex items-center justify-center rounded-md w-11 h-11 text-silver-50 transition-all duration-200 ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            :aria-label="t('landing.marketplace.header.menuAria')"
            @click="toggleMobileMenu"
        >
          <!-- No hamburger glyph in the IconV2 sprite (design→app v2 F1 set) — keep the inline stroke icon. -->
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <RouterLink to="/login" class="flex items-center gap-1.5">
          <svg class="w-7 h-7 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="font-display font-bold text-[14px] tracking-[.14em] text-neon whitespace-nowrap">CRANIAL TRADING</span>
        </RouterLink>

        <button
            type="button"
            data-testid="login-trigger"
            data-menu-trigger
            class="relative inline-flex items-center justify-center rounded-md w-11 h-11 text-silver-50 transition-all duration-200 ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            :aria-label="t('landing.marketplace.header.personAria')"
            @click="toggleLogin"
        >
          <IconV2 name="user" :size="20" />
        </button>
      </div>

      <!-- Hamburger category menu -->
      <div
          v-if="mobileMenuOpen"
          ref="mobileMenuPanelRef"
          class="border-t border-line bg-primary px-4 py-3 flex flex-col gap-3"
      >
        <button type="button" class="text-left text-[12px] font-bold uppercase tracking-[.12em] text-silver-50 hover:text-silver transition-colors duration-200 ease-v2" @click="focusSearch">
          {{ t('landing.marketplace.header.catalog') }}
        </button>
        <button type="button" class="text-left text-[12px] font-bold uppercase tracking-[.12em] text-silver-50 hover:text-silver transition-colors duration-200 ease-v2" @click="emit('how-it-works'); mobileMenuOpen = false">
          {{ t('landing.marketplace.header.howItWorks') }}
        </button>
        <button type="button" class="text-left text-[12px] font-bold uppercase tracking-[.12em] text-silver-50 hover:text-silver transition-colors duration-200 ease-v2" @click="emit('community'); mobileMenuOpen = false">
          {{ t('landing.marketplace.header.community') }}
        </button>
        <RouterLink
            to="/register"
            class="mt-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 bg-neon text-primary font-bold text-[11px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 w-full focus-visible:outline-none focus-visible:shadow-glow-neon"
        >
          {{ t('landing.marketplace.header.createAccount') }}
        </RouterLink>
      </div>

      <!-- Search-first: full-width search bar is the first content under the sticky bar -->
      <form class="px-4 py-3 border-t border-line" @submit.prevent="submitSearch">
        <div class="flex items-center gap-2 border border-line rounded-full px-3 py-2 bg-surface-1 focus-within:border-neon focus-within:shadow-glow-neon transition-all duration-200 ease-v2">
          <IconV2 name="search" :size="18" class="text-silver-30 flex-shrink-0" />
          <input
              ref="searchInputRef"
              v-model="queryModel"
              type="text"
              :placeholder="t('landing.marketplace.header.searchPlaceholder')"
              class="flex-1 min-w-0 bg-transparent text-silver placeholder-silver-30 outline-none text-small"
          />
          <button
              type="button"
              :disabled="searching"
              class="px-3 py-1.5 bg-neon text-primary font-bold text-[11px] uppercase tracking-[.1em] rounded-full hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-50 flex-shrink-0"
              @click="submitSearch"
          >
            {{ searching ? t('common.actions.searching') : t('common.actions.search') }}
          </button>
        </div>
      </form>

      <!-- Inline sign-in sheet -->
      <div v-if="loginOpen" ref="loginPanelRef" class="border-t border-line px-4 py-3">
        <HeaderLoginDropdown @close="closeLogin" />
      </div>
    </div>
  </header>
</template>
