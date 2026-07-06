<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import SvgIcon from '../ui/SvgIcon.vue';
import BaseButton from '../ui/BaseButton.vue';
import HeaderLoginDropdown from './HeaderLoginDropdown.vue';

// Marketplace header (TASK-086): replaces the old two-column LoginView
// layout. Desktop = wordmark + centered full-width search + "Iniciar
// sesión" dropdown + category row. Mobile = sticky [hamburger | wordmark |
// person] bar with the search bar as the first content right below it
// (search-first, the whole point of the redesign).
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
  <header class="bg-primary border-b border-neon-15 sticky top-0 z-40">
    <!-- ============ Desktop ============ -->
    <div v-if="isDesktop" class="max-w-[1280px] mx-auto px-6">
      <!-- Row 1: wordmark + centered search + actions -->
      <div class="flex items-center gap-6 h-20">
        <RouterLink to="/login" class="flex items-center gap-2 flex-shrink-0">
          <svg class="w-9 h-9 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="text-h3 font-bold text-neon tracking-wider font-brother">CRANIAL TRADING</span>
        </RouterLink>

        <form class="flex-1 flex justify-center" @submit.prevent="submitSearch">
          <div class="w-full max-w-[560px] flex items-center gap-2 border-2 border-neon rounded-full px-4 py-2 bg-primary focus-within:bg-neon-10 transition-fast">
            <SvgIcon name="search" size="small" class="text-neon flex-shrink-0" />
            <input
                ref="searchInputRef"
                v-model="queryModel"
                type="text"
                :placeholder="t('landing.marketplace.header.searchPlaceholder')"
                class="flex-1 min-w-0 bg-transparent text-silver placeholder-silver-50 outline-none text-small"
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
                class="px-4 py-1.5 bg-neon text-primary font-bold text-tiny rounded-full hover:brightness-110 transition-fast disabled:opacity-50 flex-shrink-0"
                @click="submitSearch"
            >
              {{ searching ? t('common.actions.searching') : t('common.actions.search') }}
            </button>
          </div>
        </form>

        <div class="flex items-center gap-4 flex-shrink-0">
          <div ref="loginPanelRef" class="relative">
            <button
                type="button"
                data-testid="login-trigger"
                data-menu-trigger
                class="flex items-center gap-2 text-silver-70 hover:text-neon transition-fast text-small font-bold"
                @click="toggleLogin"
            >
              <SvgIcon name="user" size="small" />
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
              class="flex items-center gap-2 text-silver-70 hover:text-neon transition-fast text-small font-bold"
              :title="t('landing.marketplace.header.wantTrigger')"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.35-9.33-8.06C1.07 10.4 1.6 7.27 4.1 5.6 6.2 4.2 8.94 4.7 10.5 6.6L12 8.4l1.5-1.8c1.56-1.9 4.3-2.4 6.4-1 2.5 1.67 3.03 4.8 1.43 7.34C19 16.65 12 21 12 21z" />
            </svg>
            {{ t('landing.marketplace.header.wantTrigger') }}
          </RouterLink>
        </div>
      </div>

      <!-- Row 2: categories -->
      <div class="flex items-center justify-between h-12 border-t border-silver-10">
        <nav class="flex items-center gap-6">
          <button
              type="button"
              class="text-tiny font-bold text-silver-70 hover:text-neon transition-fast uppercase tracking-wide"
              @click="focusSearch"
          >
            {{ t('landing.marketplace.header.catalog') }}
          </button>
          <button
              type="button"
              class="text-tiny font-bold text-silver-70 hover:text-neon transition-fast uppercase tracking-wide"
              @click="emit('how-it-works')"
          >
            {{ t('landing.marketplace.header.howItWorks') }}
          </button>
          <button
              type="button"
              class="text-tiny font-bold text-silver-70 hover:text-neon transition-fast uppercase tracking-wide"
              @click="emit('community')"
          >
            {{ t('landing.marketplace.header.community') }}
          </button>
        </nav>

        <RouterLink to="/register">
          <BaseButton variant="filled" size="small">{{ t('landing.marketplace.header.createAccount') }}</BaseButton>
        </RouterLink>
      </div>
    </div>

    <!-- ============ Mobile ============ -->
    <div v-else>
      <div class="flex items-center justify-between h-14 px-4">
        <button
            type="button"
            data-menu-trigger
            class="p-2 text-silver hover:text-neon transition-fast"
            :aria-label="t('landing.marketplace.header.menuAria')"
            @click="toggleMobileMenu"
        >
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <RouterLink to="/login" class="flex items-center gap-1.5">
          <svg class="w-7 h-7 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="text-small font-bold text-neon tracking-wider font-brother">CRANIAL TRADING</span>
        </RouterLink>

        <button
            type="button"
            data-testid="login-trigger"
            data-menu-trigger
            class="p-2 text-silver hover:text-neon transition-fast"
            :aria-label="t('landing.marketplace.header.personAria')"
            @click="toggleLogin"
        >
          <SvgIcon name="user" size="small" />
        </button>
      </div>

      <!-- Hamburger category menu -->
      <div
          v-if="mobileMenuOpen"
          ref="mobileMenuPanelRef"
          class="border-t border-silver-20 bg-primary px-4 py-3 flex flex-col gap-3"
      >
        <button type="button" class="text-left text-small font-bold text-silver-70 hover:text-neon transition-fast" @click="focusSearch">
          {{ t('landing.marketplace.header.catalog') }}
        </button>
        <button type="button" class="text-left text-small font-bold text-silver-70 hover:text-neon transition-fast" @click="emit('how-it-works'); mobileMenuOpen = false">
          {{ t('landing.marketplace.header.howItWorks') }}
        </button>
        <button type="button" class="text-left text-small font-bold text-silver-70 hover:text-neon transition-fast" @click="emit('community'); mobileMenuOpen = false">
          {{ t('landing.marketplace.header.community') }}
        </button>
        <RouterLink to="/register" class="mt-1">
          <BaseButton variant="filled" size="small" class="w-full">{{ t('landing.marketplace.header.createAccount') }}</BaseButton>
        </RouterLink>
      </div>

      <!-- Search-first: full-width search bar is the first content under the sticky bar -->
      <form class="px-4 py-3 border-t border-silver-20" @submit.prevent="submitSearch">
        <div class="flex items-center gap-2 border-2 border-neon rounded-full px-3 py-2 bg-primary">
          <SvgIcon name="search" size="small" class="text-neon flex-shrink-0" />
          <input
              ref="searchInputRef"
              v-model="queryModel"
              type="text"
              :placeholder="t('landing.marketplace.header.searchPlaceholder')"
              class="flex-1 min-w-0 bg-transparent text-silver placeholder-silver-50 outline-none text-small"
          />
          <button
              type="button"
              :disabled="searching"
              class="px-3 py-1.5 bg-neon text-primary font-bold text-tiny rounded-full hover:brightness-110 transition-fast disabled:opacity-50 flex-shrink-0"
              @click="submitSearch"
          >
            {{ searching ? t('common.actions.searching') : t('common.actions.search') }}
          </button>
        </div>
      </form>

      <!-- Inline sign-in sheet -->
      <div v-if="loginOpen" ref="loginPanelRef" class="border-t border-silver-20 px-4 py-3">
        <HeaderLoginDropdown @close="closeLogin" />
      </div>
    </div>
  </header>
</template>
