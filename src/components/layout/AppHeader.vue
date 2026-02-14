<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useMatchesStore } from '../../stores/matches'
import { useMessagesStore } from '../../stores/messages'
import { useI18n } from '../../composables/useI18n'
import SvgIcon from '../ui/SvgIcon.vue'
import UserPopover from '../ui/UserPopover.vue'
import MatchNotificationsDropdown from './MatchNotificationsDropdown.vue'
import GlobalSearch from '../ui/GlobalSearch.vue'

const route = useRoute()
const authStore = useAuthStore()
const matchesStore = useMatchesStore()
const messagesStore = useMessagesStore()
const { t } = useI18n()

const isAuthenticated = computed(() => !!authStore.user)

// Badge counts
const newMatchesCount = computed(() => matchesStore.getUnseenCount())
const unreadMessagesCount = computed(() => {
  return messagesStore.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
})
const mobileMenuOpen = ref(false)
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

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

const closeMobileMenu = () => {
  mobileMenuOpen.value = false
}

// Combined badge for matches section (saved + messages + contacts)
const matchesSectionBadge = computed(() => newMatchesCount.value + unreadMessagesCount.value)

const navigationLinks = computed(() => [
  { path: '/collection', label: t('header.nav.collection'), icon: 'collection', badge: 0 },
  { path: '/collection?filter=wishlist', label: t('header.nav.wishlist'), icon: 'star', badge: 0 },
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

const handleLogout = async () => {
  await authStore.logout()
  window.location.href = '/login'
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
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <header class="bg-primary border-b border-silver-20 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 md:h-20">
        <!-- Logo -->
        <router-link to="/saved-matches" class="flex items-center gap-2 flex-shrink-0">
          <svg class="w-10 h-10 md:w-12 md:h-12 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="hidden sm:inline text-h3 font-bold text-neon">CRANIAL TRADING</span>
        </router-link>

        <!-- Navigation Links (Desktop) -->
        <nav v-if="isAuthenticated" aria-label="Main navigation" class="hidden md:flex items-center gap-1">
          <router-link
              v-for="link in navigationLinks"
              :key="link.path + link.label"
              :to="link.path"
              :data-tour="link.path === '/collection' ? 'nav-collection' : undefined"
              :class="[
                'px-4 py-2 text-small font-bold transition-fast rounded-sm flex items-center gap-2 relative',
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
          <!-- Mobile Menu Button -->
          <button
              v-if="isAuthenticated"
              class="md:hidden px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast rounded"
              @click="toggleMobileMenu"
          >
            {{ mobileMenuOpen ? '✕' : '☰' }}
          </button>

          <!-- User Menu -->
          <div v-if="isAuthenticated" class="flex items-center">
            <!-- Divider -->
            <div class="hidden md:block w-px h-6 bg-silver-30 mr-4"></div>

            <!-- User actions -->
            <div class="flex items-center gap-2">
              <!-- Help/FAQ -->
              <router-link
                  to="/faq"
                  class="p-1.5 text-silver-50 hover:text-neon hover:bg-silver-5 transition-fast flex items-center justify-center rounded"
                  title="Ayuda / FAQ"
              >
                <span class="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-sm font-bold">?</span>
              </router-link>
              <!-- User Popover (avatar only, dropdown has logout) -->
              <UserPopover class="hidden md:block" />
            </div>
          </div>

          <!-- Auth Links (Logged out) -->
          <div v-else class="flex items-center gap-3">
            <router-link
                to="/faq"
                class="p-1.5 text-silver-50 hover:text-neon hover:bg-silver-5 transition-fast flex items-center justify-center rounded"
                title="Ayuda / FAQ"
            >
              <span class="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-sm font-bold">?</span>
            </router-link>
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

      <!-- Mobile Navigation Menu -->
      <nav
          v-if="isAuthenticated && mobileMenuOpen"
          aria-label="Mobile navigation"
          class="md:hidden border-t border-silver-20 pb-2"
      >
        <router-link
            v-for="link in navigationLinks"
            :key="`mobile-${ link.path}`"
            :to="link.path"
            :class="[
              'flex items-center gap-3 px-4 py-3 text-small font-bold transition-fast',
              isActive(link.path)
                ? 'bg-neon-10 border-l-2 border-neon text-neon'
                : 'text-silver-70 hover:text-silver'
            ]"
            @click="closeMobileMenu"
        >
          <span class="relative">
            <SvgIcon :name="link.icon" size="small" />
            <span
                v-if="link.badge > 0"
                class="absolute -top-1 -right-1 min-w-[16px] h-4 bg-rust text-primary text-[10px] font-bold rounded-full flex items-center justify-center px-1"
            >
              {{ link.badge > 9 ? '9+' : link.badge }}
            </span>
          </span>
          {{ link.label }}
        </router-link>
        <!-- Matches (mobile - direct link) -->
        <router-link
            to="/saved-matches"
            :class="[
              'flex items-center gap-3 px-4 py-3 text-small font-bold transition-fast',
              isMatchesActive
                ? 'bg-neon-10 border-l-2 border-neon text-neon'
                : 'text-silver-70 hover:text-silver'
            ]"
            @click="closeMobileMenu"
        >
          <span class="relative">
            <SvgIcon name="handshake" size="small" />
            <span
                v-if="matchesSectionBadge > 0"
                class="absolute -top-1 -right-1 min-w-[16px] h-4 bg-rust text-primary text-[10px] font-bold rounded-full flex items-center justify-center px-1"
            >
              {{ matchesSectionBadge > 9 ? '9+' : matchesSectionBadge }}
            </span>
          </span>
          {{ t('header.nav.matches') }}
        </router-link>
        <!-- Mi Perfil (mobile) -->
        <router-link
            v-if="authStore.user?.username"
            :to="`/@${authStore.user.username}`"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-neon transition-fast"
            @click="closeMobileMenu"
        >
          <img
              :src="authStore.getAvatarUrl(24)"
              alt=""
              class="w-6 h-6 rounded-full object-cover"
          />
          {{ t('header.profile.myProfile') }} (@{{ authStore.user.username }})
        </router-link>
        <!-- FAQ (mobile) -->
        <router-link
            to="/faq"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-neon transition-fast"
            @click="closeMobileMenu"
        >
          <span class="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-sm font-bold">?</span>
          Ayuda / FAQ
        </router-link>
        <!-- Settings (mobile) -->
        <router-link
            to="/settings"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-neon transition-fast"
            @click="closeMobileMenu"
        >
          <SvgIcon name="settings" size="small" />
          {{ t('header.profile.settings') }}
        </router-link>
        <!-- Logout (mobile) -->
        <button
            @click="handleLogout(); closeMobileMenu()"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-rust transition-fast w-full text-left"
        >
          <SvgIcon name="x-mark" size="small" />
          {{ t('header.profile.logout') }}
        </button>
      </nav>
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
</template>

<style scoped>
/* Smooth transitions para links activos */
.router-link-exact-active {
  @apply text-neon;
}
</style>