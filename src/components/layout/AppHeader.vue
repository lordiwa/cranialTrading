<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useMatchesStore } from '../../stores/matches'
import { useMessagesStore } from '../../stores/messages'
import { type SupportedLocale, useI18n } from '../../composables/useI18n'
import { useTour } from '../../composables/useTour'
import SvgIcon from '../ui/SvgIcon.vue'
import UserPopover from '../ui/UserPopover.vue'
import MatchNotificationsDropdown from './MatchNotificationsDropdown.vue'
import GlobalSearch from '../ui/GlobalSearch.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const matchesStore = useMatchesStore()
const messagesStore = useMessagesStore()
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

const goToFaq = () => {
  closeHelpMenu()
  closeMobileMenu()
  router.push('/faq')
}

const restartTour = async () => {
  closeHelpMenu()
  closeMobileMenu()
  resetTour()
  // Navigate to collection page first, then start tour
  if (route.path !== '/collection') {
    await router.push('/collection')
    setTimeout(() => void startTour(), 500)
  } else {
    void startTour()
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
const unreadMessagesCount = computed(() => {
  return messagesStore.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
})
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
    checkLocation()
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

const navigationLinks = computed(() => [
  { path: '/collection', label: t('header.nav.collection'), icon: 'collection', badge: 0 },
  { path: '/collection?filter=wishlist', label: t('header.nav.wishlist'), icon: 'star', badge: 0 },
  { path: '/market', label: t('header.nav.market'), icon: 'fire', badge: 0 },
])

const isMatchesActive = computed(() => route.path.startsWith('/saved-matches'))

const isActive = (path: string) => {
  // Handle paths with query params like /collection?filter=wishlist
  if (path.includes('?')) {
    const parts = path.split('?')
    const basePath = parts[0] || ''
    const query = parts[1] || ''
    if (!route.path.startsWith(basePath)) return false
    const params = new URLSearchParams(query)
    for (const [key, value] of params) {
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

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleHelpClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleHelpClickOutside)
})
</script>

<template>
  <header class="bg-primary border-b border-silver-20 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
      <div class="flex items-center justify-between h-14 md:h-20">
        <!-- Logo -->
        <router-link to="/saved-matches" class="flex items-center gap-2 flex-shrink-0">
          <svg class="w-8 h-8 md:w-12 md:h-12 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="hidden sm:inline text-h3 font-bold text-neon font-brother">CRANIAL TRADING</span>
        </router-link>

        <!-- Navigation Links (Desktop) -->
        <nav v-if="isAuthenticated" aria-label="Main navigation" class="hidden md:flex items-center gap-1">
          <router-link
              v-for="link in navigationLinks"
              :key="link.path + link.label"
              :to="link.path"
              :data-tour="link.path === '/collection' ? 'nav-collection' : undefined"
              :class="[
                'px-4 py-2 text-small font-bold transition-fast rounded-sm flex items-center gap-2 relative uppercase',
                isActive(link.path)
                  ? 'bg-neon-10 border-b-2 border-neon text-neon'
                  : 'text-silver-70 hover:text-silver hover:border-b-2 hover:border-silver'
              ]"
          >
            <span class="relative">
              <SvgIcon :name="link.icon" size="small" />
            </span>
            {{ link.label }}
          </router-link>
          <!-- Matches dropdown (replaces simple nav link) -->
          <MatchNotificationsDropdown data-tour="nav-matches" :active="isMatchesActive" />
        </nav>

        <!-- Global Search (Desktop) -->
        <GlobalSearch v-if="isAuthenticated" ref="globalSearchRef" data-tour="nav-search" class="hidden md:block flex-shrink-0" />

        <!-- Right side: User & Settings -->
        <div class="flex items-center gap-2 md:gap-4 flex-shrink-0">
          <!-- User Menu -->
          <div v-if="isAuthenticated" class="flex items-center">
            <!-- Divider -->
            <div class="hidden md:block w-px h-6 bg-silver-30 mr-4"></div>

            <!-- User actions -->
            <div class="flex items-center gap-2">
              <!-- Help Menu -->
              <div ref="helpMenuRef" class="relative">
                <button
                    @click="toggleHelpMenu"
                    class="p-1.5 text-silver-50 hover:text-neon hover:bg-silver-5 transition-fast flex items-center justify-center rounded"
                    :title="t('help.menu.faq')"
                >
                  <span class="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-sm font-bold">?</span>
                </button>
                <div
                    v-if="showHelpMenu"
                    class="absolute right-0 top-full mt-2 w-56 bg-primary border border-silver-30 rounded-md shadow-lg z-50 overflow-hidden"
                >
                  <button
                      @click="goToFaq"
                      class="w-full flex items-center gap-3 px-4 py-3 text-small text-silver hover:bg-silver-5 hover:text-neon transition-fast text-left"
                  >
                    <span class="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold flex-shrink-0">?</span>
                    {{ t('help.menu.faq') }}
                  </button>
                  <button
                      v-if="isAuthenticated"
                      @click="restartTour"
                      class="w-full flex items-center gap-3 px-4 py-3 text-small text-silver hover:bg-silver-5 hover:text-neon transition-fast text-left border-t border-silver-20"
                  >
                    <SvgIcon name="eye-open" size="tiny" class="flex-shrink-0" />
                    {{ t('help.menu.restartTour') }}
                  </button>
                  <!-- Legal links -->
                  <div class="border-t border-silver-20 px-4 py-2 flex flex-col gap-1">
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
                  <div class="border-t border-silver-20 px-4 py-2 flex items-center gap-2">
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
                              : 'text-silver-50 hover:text-neon hover:bg-silver-5'
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
                  class="p-1.5 text-silver-50 hover:text-neon hover:bg-silver-5 transition-fast flex items-center justify-center rounded"
                  :title="t('help.menu.faq')"
              >
                <span class="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-sm font-bold">?</span>
              </button>
              <div
                  v-if="showHelpMenu"
                  class="absolute right-0 top-full mt-2 w-56 bg-primary border border-silver-30 rounded-md shadow-lg z-50 overflow-hidden"
              >
                <button
                    @click="goToFaq"
                    class="w-full flex items-center gap-3 px-4 py-3 text-small text-silver hover:bg-silver-5 hover:text-neon transition-fast text-left"
                >
                  <span class="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold flex-shrink-0">?</span>
                  {{ t('help.menu.faq') }}
                </button>
                <!-- Legal links -->
                <div class="border-t border-silver-20 px-4 py-2 flex flex-col gap-1">
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
                <div class="border-t border-silver-20 px-4 py-2 flex items-center gap-2">
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
                            : 'text-silver-50 hover:text-neon hover:bg-silver-5'
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
                class="px-4 py-2 text-silver-70 hover:text-neon transition-fast rounded text-small font-bold"
            >
              {{ t('header.auth.login') }}
            </a>
            <a
                href="/register"
                class="px-4 py-2 bg-neon text-primary font-bold hover:bg-neon/90 transition-fast rounded text-small"
            >
              {{ t('header.auth.register') }}
            </a>
          </div>
        </div>
      </div>

    </div>

    <!-- Location suggestion banner -->
    <div
        v-if="showLocationSuggestion && detectedLocation"
        class="bg-neon-10 border-b border-neon-20 px-4 py-2"
    >
      <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p class="text-tiny text-silver">
          📍 {{ t('header.locationSuggestion.message', { location: detectedLocation }) }}
        </p>
        <div class="flex items-center gap-2">
          <button
              @click="handleUpdateLocation"
              class="px-3 py-1 text-tiny bg-neon text-primary font-bold rounded hover:bg-neon/90 transition-fast"
          >
            {{ t('header.locationSuggestion.update') }}
          </button>
          <button
              @click="dismissLocationSuggestion"
              class="px-2 py-1 text-tiny text-silver-50 hover:text-silver transition-fast"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Bottom Tab Bar (mobile only) -->
  <nav v-if="isAuthenticated" class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-primary border-t border-silver-20 tab-bar-safe">
    <div class="flex items-center justify-around h-14 px-1">
      <!-- Collection -->
      <router-link
          to="/collection"
          :class="[
            'flex flex-col items-center gap-0.5 py-1 px-1 transition-fast min-w-0',
            isActive('/collection') ? 'text-neon' : 'text-silver-50'
          ]"
      >
        <SvgIcon name="collection" size="small" />
        <span class="text-[11px] font-bold uppercase truncate max-w-full">{{ t('header.nav.collection') }}</span>
      </router-link>
      <!-- Matches -->
      <router-link
          to="/saved-matches"
          :class="[
            'flex flex-col items-center gap-0.5 py-1 px-1 transition-fast relative min-w-0',
            isMatchesActive ? 'text-neon' : 'text-silver-50'
          ]"
      >
        <span class="relative">
          <SvgIcon name="handshake" size="small" />
          <span
              v-if="matchesSectionBadge > 0"
              class="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] bg-rust text-primary text-[10px] font-bold rounded-full flex items-center justify-center px-0.5"
          >
            {{ matchesSectionBadge > 9 ? '9+' : matchesSectionBadge }}
          </span>
        </span>
        <span class="text-[11px] font-bold uppercase truncate max-w-full">{{ t('header.nav.matches') }}</span>
      </router-link>
      <!-- Wishlist -->
      <router-link
          to="/collection?filter=wishlist"
          :class="[
            'flex flex-col items-center gap-0.5 py-1 px-1 transition-fast min-w-0',
            isActive('/collection?filter=wishlist') ? 'text-neon' : 'text-silver-50'
          ]"
      >
        <SvgIcon name="star" size="small" />
        <span class="text-[11px] font-bold uppercase truncate max-w-full">{{ t('header.nav.wishlist') }}</span>
      </router-link>
      <!-- Market -->
      <router-link
          to="/market"
          :class="[
            'flex flex-col items-center gap-0.5 py-1 px-1 transition-fast min-w-0',
            isActive('/market') ? 'text-neon' : 'text-silver-50'
          ]"
      >
        <SvgIcon name="fire" size="small" />
        <span class="text-[11px] font-bold uppercase truncate max-w-full">{{ t('header.nav.market') }}</span>
      </router-link>
    </div>
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