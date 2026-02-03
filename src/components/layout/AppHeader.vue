<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useI18n } from '../../composables/useI18n'
import SpriteIcon from '../ui/SpriteIcon.vue'
import UserPopover from '../ui/UserPopover.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { t } = useI18n()

const isAuthenticated = computed(() => !!authStore.user)
const mobileMenuOpen = ref(false)
const detectedLocation = ref<string | null>(null)
const showLocationSuggestion = ref(false)

// Detect location silently (IP-based, no permission needed) to suggest updates
const checkLocation = async () => {
  if (authStore.user) {
    const detected = await authStore.detectLocationSilent()
    if (detected) {
      detectedLocation.value = detected
      // Compare with stored location (case-insensitive, trimmed)
      const storedLocation = authStore.user.location?.toLowerCase().trim() || ''
      const detectedLower = detected.toLowerCase().trim()
      // Show suggestion if location is empty or significantly different
      if (!storedLocation || (storedLocation && !detectedLower.includes(storedLocation.split(',')[0]))) {
        showLocationSuggestion.value = true
      }
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

const navigationLinks = computed(() => [
  { path: '/dashboard', label: t('header.nav.search'), icon: 'search' },
  { path: '/collection', label: t('header.nav.collection'), icon: 'collection' },
  { path: '/saved-matches', label: t('header.nav.saved'), icon: 'star' },
  { path: '/messages', label: t('header.nav.messages'), icon: 'chat' },
  { path: '/contacts', label: t('header.nav.contacts'), icon: 'user' },
])

const isActive = (path: string) => {
  return route.path.startsWith(path)
}

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}

const handleNavigate = (path: string) => {
  router.push(path)
}
</script>

<template>
  <header class="bg-primary border-b border-silver-20 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 md:h-20">
        <!-- Logo -->
        <router-link to="/dashboard" class="flex items-center gap-2 flex-shrink-0">
          <img src="/cranial-trading-logo-color.png" alt="Cranial Trading" class="h-8 w-8 md:h-10 md:w-10" />
          <span class="hidden sm:inline text-h3 font-bold text-neon">CRANIAL TRADING</span>
        </router-link>

        <!-- Navigation Links (Desktop) -->
        <nav v-if="isAuthenticated" aria-label="Main navigation" class="hidden md:flex items-center gap-1">
          <router-link
              v-for="link in navigationLinks"
              :key="link.path + link.label"
              :to="link.path"
              :class="[
                'px-4 py-2 text-small font-bold transition-fast rounded-sm flex items-center gap-2',
                isActive(link.path)
                  ? 'bg-neon-10 border-b-2 border-neon text-neon'
                  : 'text-silver-70 hover:text-silver hover:border-b-2 hover:border-silver'
              ]"
          >
            <SpriteIcon :name="link.icon" size="small" />
            {{ link.label }}
          </router-link>
        </nav>

        <!-- Right side: User & Settings -->
        <div class="flex items-center gap-2 md:gap-4">
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
            <div class="flex items-center gap-1">
              <!-- User Popover (avatar, username, location) -->
              <UserPopover class="hidden sm:block" />

              <!-- Help/FAQ -->
              <router-link
                  to="/faq"
                  class="p-2 text-silver-50 hover:text-neon hover:bg-silver-5 transition-fast flex items-center justify-center rounded"
                  title="Ayuda / FAQ"
              >
                <span class="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">?</span>
              </router-link>
              <!-- Logout -->
              <button
                  @click="handleLogout"
                  class="p-2 text-silver-50 hover:text-rust hover:bg-rust-5 transition-fast flex items-center justify-center rounded"
                  :title="t('header.profile.logout')"
              >
                <SpriteIcon name="x-mark" size="small" />
              </button>
            </div>
          </div>

          <!-- Auth Links (Logged out) -->
          <div v-else class="flex items-center gap-3">
            <router-link
                to="/faq"
                class="p-2 text-silver-50 hover:text-neon hover:bg-silver-5 transition-fast flex items-center justify-center rounded"
                title="Ayuda / FAQ"
            >
              <span class="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">?</span>
            </router-link>
            <router-link
                to="/login"
                class="px-4 py-2 text-silver-70 hover:text-neon transition-fast rounded text-small font-bold"
            >
              {{ t('header.auth.login') }}
            </router-link>
            <router-link
                to="/register"
                class="px-4 py-2 bg-neon text-primary font-bold hover:bg-neon/90 transition-fast rounded text-small"
            >
              {{ t('header.auth.register') }}
            </router-link>
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
            :key="'mobile-' + link.path"
            :to="link.path"
            :class="[
              'flex items-center gap-3 px-4 py-3 text-small font-bold transition-fast',
              isActive(link.path)
                ? 'bg-neon-10 border-l-2 border-neon text-neon'
                : 'text-silver-70 hover:text-silver'
            ]"
            @click="closeMobileMenu"
        >
          <SpriteIcon :name="link.icon" size="small" />
          {{ link.label }}
        </router-link>
        <!-- Mi Perfil (mobile) -->
        <router-link
            v-if="authStore.user?.username"
            :to="`/@${authStore.user.username}`"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-neon transition-fast"
            @click="closeMobileMenu"
        >
          <SpriteIcon name="user-alt" size="small" />
          {{ t('header.profile.myProfile') }} (@{{ authStore.user.username }})
        </router-link>
        <!-- FAQ (mobile) -->
        <router-link
            to="/faq"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-neon transition-fast"
            @click="closeMobileMenu"
        >
          <span class="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">?</span>
          Ayuda / FAQ
        </router-link>
        <!-- Settings (mobile) -->
        <router-link
            to="/settings"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-neon transition-fast"
            @click="closeMobileMenu"
        >
          <SpriteIcon name="settings" size="small" />
          {{ t('header.profile.settings') }}
        </router-link>
        <!-- Logout (mobile) -->
        <button
            @click="handleLogout(); closeMobileMenu()"
            class="flex items-center gap-3 px-4 py-3 text-small font-bold text-silver-70 hover:text-rust transition-fast w-full text-left"
        >
          <SpriteIcon name="x-mark" size="small" />
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