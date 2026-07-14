<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useCollectionStore } from '../../stores/collection'
import { useMatchesStore } from '../../stores/matches'
import { useMessagesStore } from '../../stores/messages'
import { type SupportedLocale, useI18n } from '../../composables/useI18n'
import { useTour } from '../../composables/useTour'
import { sumUnreadCounts } from '../../utils/messageUnread'
import IconV2 from '../ui/IconV2.vue'
import UserPopover from '../ui/UserPopover.vue'
import MatchNotificationsDropdown from './MatchNotificationsDropdown.vue'
import GlobalSearch from '../ui/GlobalSearch.vue'
import MobileSearchOverlay from '../ui/MobileSearchOverlay.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const matchesStore = useMatchesStore()
const messagesStore = useMessagesStore()
const collectionStore = useCollectionStore()
const { t, locale, setLocale } = useI18n()

const languages = [
  { code: 'es' as SupportedLocale, label: 'ES' },
  { code: 'en' as SupportedLocale, label: 'EN' },
  { code: 'pt' as SupportedLocale, label: 'PT' },
]
const { startTour, resetTour } = useTour()

// Help menu
const showHelpMenu = ref(false)
const helpMenuRef = ref<HTMLElement | null>(null)

const toggleHelpMenu = () => {
  showHelpMenu.value = !showHelpMenu.value
}

const closeHelpMenu = () => {
  showHelpMenu.value = false
}

const restartTour = async () => {
  closeHelpMenu()
  closeMobileMenu()
  void resetTour()
  // Navigate to collection page first, then start tour
  if (route.path === '/collection') {
    void startTour()
  } else {
    await router.push('/collection')
    setTimeout(() => void startTour(), 500)
  }
}

const handleHelpClickOutside = (e: MouseEvent) => {
  if (helpMenuRef.value && !helpMenuRef.value.contains(e.target as Node)) {
    showHelpMenu.value = false
  }
}

const isAuthenticated = computed(() => !!authStore.user)

// Badge counts
const newMatchesCount = computed(() => matchesStore.getUnseenCount())
const unreadMessagesCount = computed(() => sumUnreadCounts(messagesStore.conversations))
const detectedLocation = ref<string | null>(null)
const showLocationSuggestion = ref(false)

// Only suggest location if user has none set (IP detection is unreliable for accuracy)
const checkLocation = async () => {
  if (authStore.user && !authStore.user.location) {
    const detected = await authStore.detectLocationSilent()
    if (detected) {
      detectedLocation.value = detected
      showLocationSuggestion.value = true
    }
  }
}

// Watch for user login to check location
watch(() => authStore.user, (newUser) => {
  if (newUser && !detectedLocation.value) {
    void checkLocation()
  }
}, { immediate: true })

const handleUpdateLocation = async () => {
  if (detectedLocation.value) {
    await authStore.changeLocation(detectedLocation.value)
    showLocationSuggestion.value = false
  }
}

const dismissLocationSuggestion = () => {
  showLocationSuggestion.value = false
}

const closeMobileMenu = () => {
  // noop — kept for help menu/tour handlers that call it
}

// Combined badge for matches section (saved + messages + contacts)
const matchesSectionBadge = computed(() => newMatchesCount.value + unreadMessagesCount.value)

// RED hub redesign: MERCADO removed from nav; CONTACTOS merged into the MATCHES hub
// (rendered as the MatchNotificationsDropdown item below).
// `testid` stays on the pre-v2-icon slug (nav-collection / nav-star) — e2e/pages/navigation.page.ts
// locates these by data-testid, independent of which SVG symbol backs the icon.
const navigationLinks = computed(() => [
  { path: '/collection', label: t('header.nav.collection'), icon: 'cards', testid: 'nav-collection', badge: collectionStore.cards.length },
  { path: '/collection?filter=wishlist', label: t('header.nav.wishlist'), icon: 'star', testid: 'nav-star', badge: 0 },
])

const isMatchesActive = computed(() => route.path.startsWith('/saved-matches'))

const isActive = (path: string) => {
  // Handle paths with query params like /collection?filter=wishlist
  if (path.includes('?')) {
    const parts = path.split('?')
    const basePath = parts[0] ?? ''
    const query = parts[1] ?? ''
    if (!route.path.startsWith(basePath)) return false
    const params = new URLSearchParams(query)
    for (const [key, value] of params) {
      // eslint-disable-next-line security/detect-object-injection
      if (route.query[key] !== value) return false
    }
    return true
  }
  // For /collection, only match if no filter query or filter is not wishlist
  if (path === '/collection' && route.path === '/collection') {
    return route.query.filter !== 'wishlist'
  }
  return route.path.startsWith(path)
}

// Global search ref for keyboard shortcut
const globalSearchRef = ref<{ focus: () => void } | null>(null)

// Keyboard shortcut: "/" to focus search
const handleKeydown = (e: KeyboardEvent) => {
  // Don't trigger if typing in input fields
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    globalSearchRef.value?.focus()
  }
}

// Mobile search overlay
const showMobileSearch = ref(false)

// Mobile "+" add card handler
const handleMobileAdd = () => {
  if (route.path === '/collection') {
    void router.push({ path: '/collection', query: { ...route.query, action: 'add' } })
  } else {
    void router.push({ path: '/collection', query: { action: 'add' } })
  }
}

onMounted(() => {
  globalThis.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleHelpClickOutside)
})

onUnmounted(() => {
  globalThis.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleHelpClickOutside)
})
</script>

<template>
  <header class="bg-hdr backdrop-blur-md sticky top-0 z-50 border-b border-line">
    <div class="max-w-[1200px] mx-auto px-4 md:px-6 lg:px-8">
      <!-- ROW 1: logo · big search · help · avatar -->
      <div class="flex items-center gap-4 md:gap-6 h-14 md:h-[72px]">
        <!-- Logo -->
        <router-link to="/saved-matches" class="flex items-center gap-2.5 flex-shrink-0 focus-visible:outline-none focus-visible:shadow-glow-neon rounded-md">
          <svg class="w-7 h-7 md:w-[30px] md:h-[30px] text-neon flex-shrink-0" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="hidden md:inline font-display font-bold text-[17px] tracking-[.14em] text-neon whitespace-nowrap">CRANIAL TRADING</span>
        </router-link>

        <!-- Global Search (Desktop, promoted + centered) -->
        <div class="hidden md:flex flex-1 justify-center min-w-0">
          <GlobalSearch v-if="isAuthenticated" ref="globalSearchRef" data-tour="nav-search" class="w-full max-w-[640px] min-w-0" />
        </div>

        <!-- Right side: User & Settings -->
        <div class="flex items-center gap-1 flex-shrink-0 ml-auto md:ml-0">
          <!-- User Menu -->
          <div v-if="isAuthenticated" class="flex items-center gap-1">
            <!-- Mobile search icon-btn -->
            <button
                @click="showMobileSearch = true"
                :aria-label="t('header.search.placeholder')"
                class="md:hidden relative inline-flex items-center justify-center rounded-md w-11 h-11 text-silver-50 transition-all duration-200 ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              <IconV2 name="search" :size="20" />
            </button>
            <!-- Mobile "+" add card icon-btn -->
            <button
                @click="handleMobileAdd"
                :aria-label="t('header.search.addToCollection')"
                class="md:hidden relative inline-flex items-center justify-center rounded-md w-11 h-11 text-neon transition-all duration-200 ease-v2 hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              <IconV2 name="plus" :size="20" />
            </button>

            <!-- Messages icon-btn (row1, desktop + mobile) — badge from messages store, hidden at 0 -->
            <router-link
                to="/messages"
                :aria-label="t('header.nav.messages')"
                class="relative inline-flex items-center justify-center rounded-md w-11 h-11 md:w-10 md:h-10 text-silver-50 transition-all duration-200 ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              <IconV2 name="chat" :size="20" />
              <span
                  v-if="unreadMessagesCount > 0"
                  class="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-neon text-primary font-display font-tnum text-[11px] font-bold"
              >
                {{ unreadMessagesCount > 9 ? '9+' : unreadMessagesCount }}
              </span>
            </router-link>

            <!-- Divider -->
            <div class="hidden md:block w-px h-6 bg-line-strong mx-3"></div>

            <!-- User actions -->
            <div class="flex items-center gap-1">
              <!-- Help Menu -->
              <div ref="helpMenuRef" class="relative">
                <button
                    @click="toggleHelpMenu"
                    :aria-label="t('help.menu.faq')"
                    class="relative inline-flex items-center justify-center rounded-md w-11 h-11 md:w-10 md:h-10 text-silver-50 transition-all duration-200 ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
                >
                  <IconV2 name="help" :size="20" />
                </button>
                <div
                    v-if="showHelpMenu"
                    class="absolute right-0 top-full mt-2 w-56 bg-primary border border-line-strong rounded-md shadow-strong z-50 overflow-hidden"
                >
                  <RouterLink
                      :to="'/faq'"
                      @click="closeHelpMenu(); closeMobileMenu()"
                      class="w-full flex items-center gap-3 px-4 py-3 text-small text-silver hover:bg-surface-2 hover:text-neon transition-fast text-left"
                  >
                    <IconV2 name="help" :size="18" class="flex-shrink-0" />
                    {{ t('help.menu.faq') }}
                  </RouterLink>
                  <button
                      v-if="isAuthenticated"
                      @click="restartTour"
                      class="w-full flex items-center gap-3 px-4 py-3 text-small text-silver hover:bg-surface-2 hover:text-neon transition-fast text-left border-t border-line"
                  >
                    <IconV2 name="eye" :size="18" class="flex-shrink-0" />
                    {{ t('help.menu.restartTour') }}
                  </button>
                  <!-- Legal links -->
                  <div class="border-t border-line px-4 py-2 flex flex-col gap-1">
                    <router-link
                        to="/terms"
                        @click="closeHelpMenu"
                        class="text-tiny text-silver-50 hover:text-silver hover:underline transition-fast"
                    >
                      {{ t('help.menu.terms') }}
                    </router-link>
                    <router-link
                        to="/privacy"
                        @click="closeHelpMenu"
                        class="text-tiny text-silver-50 hover:text-silver hover:underline transition-fast"
                    >
                      {{ t('help.menu.privacy') }}
                    </router-link>
                    <router-link
                        to="/cookies"
                        @click="closeHelpMenu"
                        class="text-tiny text-silver-50 hover:text-silver hover:underline transition-fast"
                    >
                      {{ t('help.menu.cookies') }}
                    </router-link>
                  </div>
                  <!-- Language selector -->
                  <div class="border-t border-line px-4 py-2 flex items-center gap-2">
                    <span class="text-tiny text-silver-50">{{ t('help.menu.language') }}:</span>
                    <div class="flex items-center gap-1">
                      <button
                          v-for="lang in languages"
                          :key="lang.code"
                          @click="setLocale(lang.code)"
                          :class="[
                            'px-2 py-0.5 text-tiny font-bold rounded transition-colors',
                            locale === lang.code
                              ? 'bg-neon text-primary'
                              : 'text-silver-50 hover:text-neon hover:bg-surface-2'
                          ]"
                      >
                        {{ lang.label }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <!-- User Popover (avatar only, dropdown has logout) -->
              <UserPopover />
            </div>
          </div>

          <!-- Auth Links (Logged out) -->
          <div v-else class="flex items-center gap-3">
            <!-- Help Menu (logged out) -->
            <div ref="helpMenuRef" class="relative">
              <button
                  @click="toggleHelpMenu"
                  :aria-label="t('help.menu.faq')"
                  class="relative inline-flex items-center justify-center rounded-md w-11 h-11 md:w-10 md:h-10 text-silver-50 transition-all duration-200 ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
              >
                <IconV2 name="help" :size="20" />
              </button>
              <div
                  v-if="showHelpMenu"
                  class="absolute right-0 top-full mt-2 w-56 bg-primary border border-line-strong rounded-md shadow-strong z-50 overflow-hidden"
              >
                <RouterLink
                    :to="'/faq'"
                    @click="closeHelpMenu(); closeMobileMenu()"
                    class="w-full flex items-center gap-3 px-4 py-3 text-small text-silver hover:bg-surface-2 hover:text-neon transition-fast text-left"
                >
                  <IconV2 name="help" :size="18" class="flex-shrink-0" />
                  {{ t('help.menu.faq') }}
                </RouterLink>
                <!-- Legal links -->
                <div class="border-t border-line px-4 py-2 flex flex-col gap-1">
                  <router-link to="/terms" @click="closeHelpMenu" class="text-tiny text-silver-50 hover:text-silver hover:underline transition-fast">
                    {{ t('help.menu.terms') }}
                  </router-link>
                  <router-link to="/privacy" @click="closeHelpMenu" class="text-tiny text-silver-50 hover:text-silver hover:underline transition-fast">
                    {{ t('help.menu.privacy') }}
                  </router-link>
                  <router-link to="/cookies" @click="closeHelpMenu" class="text-tiny text-silver-50 hover:text-silver hover:underline transition-fast">
                    {{ t('help.menu.cookies') }}
                  </router-link>
                </div>
                <!-- Language selector -->
                <div class="border-t border-line px-4 py-2 flex items-center gap-2">
                  <span class="text-tiny text-silver-50">{{ t('help.menu.language') }}:</span>
                  <div class="flex items-center gap-1">
                    <button
                        v-for="lang in languages"
                        :key="lang.code"
                        @click="setLocale(lang.code)"
                        :class="[
                          'px-2 py-0.5 text-tiny font-bold rounded transition-colors',
                          locale === lang.code
                            ? 'bg-neon text-primary'
                            : 'text-silver-50 hover:text-neon hover:bg-surface-2'
                        ]"
                    >
                      {{ lang.label }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <a
                href="/login"
                class="px-4 py-2 min-h-[44px] flex items-center border border-neon text-neon font-bold hover:bg-neon/10 hover:shadow-glow-neon transition-all duration-200 ease-v2 rounded-md text-small focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              {{ t('header.auth.login') }}
            </a>
            <a
                href="/register"
                class="px-4 py-2 min-h-[44px] flex items-center bg-neon text-primary font-bold hover:bg-neon/90 hover:shadow-glow-neon transition-all duration-200 ease-v2 rounded-md text-small focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              {{ t('header.auth.register') }}
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- ROW 2: primary nav (desktop, authenticated) -->
    <div v-if="isAuthenticated" class="hidden md:block border-t border-line">
      <div class="max-w-[1200px] mx-auto px-2 md:px-6 lg:px-8">
        <nav aria-label="Main navigation" class="flex items-stretch gap-1">
          <router-link
              v-for="link in navigationLinks"
              :key="link.path + link.label"
              :to="link.path"
              :data-testid="link.testid"
              :data-tour="link.path === '/collection' ? 'nav-collection' : undefined"
              :class="[
                'px-3.5 min-h-[44px] text-[12px] font-bold uppercase tracking-[.12em] transition-colors duration-200 ease-v2 flex items-center gap-2 relative border-b-2 focus-visible:outline-none focus-visible:shadow-glow-neon',
                isActive(link.path)
                  ? 'border-neon text-neon [text-shadow:0_0_12px_rgba(90,193,104,.4)]'
                  : 'border-transparent text-silver-50 hover:text-silver'
              ]"
          >
            <IconV2 :name="link.icon" :size="18" />
            {{ link.label }}
            <span v-if="link.badge > 0" class="font-display font-tnum text-[13px] font-semibold text-silver-50">{{ link.badge }}</span>
          </router-link>
          <!-- MATCHES = merged Matches + Contactos hub -->
          <MatchNotificationsDropdown data-testid="nav-matches" data-tour="nav-matches" :active="isMatchesActive" />
        </nav>
      </div>
    </div>

    <!-- Location suggestion banner -->
    <div
        v-if="showLocationSuggestion && detectedLocation"
        class="bg-neon-10 border-b border-neon-20 px-4 py-2"
    >
      <div class="max-w-[1200px] mx-auto flex items-center justify-between gap-4">
        <p class="text-tiny text-silver">
          {{ t('header.locationSuggestion.message', { location: detectedLocation }) }}
        </p>
        <div class="flex items-center gap-2">
          <button
              @click="handleUpdateLocation"
              class="px-3 py-1 text-tiny bg-neon text-primary font-bold rounded hover:bg-neon/90 transition-fast focus-visible:outline-none focus-visible:shadow-glow-neon"
          >
            {{ t('header.locationSuggestion.update') }}
          </button>
          <button
              @click="dismissLocationSuggestion"
              :aria-label="t('common.actions.close')"
              class="p-1 text-silver-50 hover:text-silver transition-fast rounded-md focus-visible:outline-none focus-visible:shadow-glow-neon"
          >
            <IconV2 name="x" :size="18" />
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Mobile Search Overlay -->
  <MobileSearchOverlay v-if="isAuthenticated" :open="showMobileSearch" @close="showMobileSearch = false" />

  <!-- Bottom Tab Bar (mobile only) -->
  <nav v-if="isAuthenticated" class="md:hidden fixed bottom-0 left-0 right-0 z-50 h-14 flex bg-hdr backdrop-blur-md border-t border-line tab-bar-safe">
    <!-- Collection -->
    <router-link
        to="/collection"
        data-testid="nav-collection-mobile"
        :class="[
          'flex-1 relative flex flex-col items-center justify-center gap-[3px] text-[10px] font-bold uppercase tracking-[.08em] transition-colors duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon',
          isActive('/collection') ? 'text-neon' : 'text-silver-30'
        ]"
    >
      <span v-if="isActive('/collection')" class="absolute top-0 w-6 h-0.5 rounded-full bg-neon shadow-[0_0_8px_rgba(90,193,104,.4)]"></span>
      <IconV2 name="cards" :size="22" />
      <span class="truncate max-w-full">{{ t('header.nav.collection') }}</span>
    </router-link>
    <!-- Matches -->
    <router-link
        to="/saved-matches"
        data-testid="nav-matches-mobile"
        :class="[
          'flex-1 relative flex flex-col items-center justify-center gap-[3px] text-[10px] font-bold uppercase tracking-[.08em] transition-colors duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon',
          isMatchesActive ? 'text-neon' : 'text-silver-30'
        ]"
    >
      <span v-if="isMatchesActive" class="absolute top-0 w-6 h-0.5 rounded-full bg-neon shadow-[0_0_8px_rgba(90,193,104,.4)]"></span>
      <span class="relative">
        <IconV2 name="swap" :size="22" />
        <span
            v-if="matchesSectionBadge > 0"
            class="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-neon text-primary font-display font-tnum text-[11px] font-bold"
        >
          {{ matchesSectionBadge > 9 ? '9+' : matchesSectionBadge }}
        </span>
      </span>
      <span class="truncate max-w-full">{{ t('header.nav.matches') }}</span>
    </router-link>
    <!-- Wishlist -->
    <router-link
        to="/collection?filter=wishlist"
        :class="[
          'flex-1 relative flex flex-col items-center justify-center gap-[3px] text-[10px] font-bold uppercase tracking-[.08em] transition-colors duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon',
          isActive('/collection?filter=wishlist') ? 'text-neon' : 'text-silver-30'
        ]"
    >
      <span v-if="isActive('/collection?filter=wishlist')" class="absolute top-0 w-6 h-0.5 rounded-full bg-neon shadow-[0_0_8px_rgba(90,193,104,.4)]"></span>
      <IconV2 name="star" :size="22" />
      <span class="truncate max-w-full">{{ t('header.nav.wishlist') }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
/* Smooth transitions para links activos */
.router-link-exact-active {
  @apply text-neon;
}

/* Safe area for iPhones with home indicator */
.tab-bar-safe {
  padding-bottom: env(safe-area-inset-bottom, 0);
}
</style>