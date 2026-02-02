<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useI18n } from '../../composables/useI18n'
import SpriteIcon from '../ui/SpriteIcon.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { t } = useI18n()

const isAuthenticated = computed(() => !!authStore.user)
const mobileMenuOpen = ref(false)

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
              class="md:hidden px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast"
              @click="toggleMobileMenu"
          >
            {{ mobileMenuOpen ? '✕' : '☰' }}
          </button>

          <!-- User Menu -->
          <div v-if="isAuthenticated" class="flex items-center gap-2">
            <!-- Mi Perfil -->
            <router-link
                v-if="authStore.user?.username"
                :to="`/@${authStore.user.username}`"
                class="hidden sm:flex px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast items-center gap-2"
                :title="t('header.profile.viewPublicProfile')"
            >
              <SpriteIcon name="user-alt" size="small" />
              <span class="text-tiny">@{{ authStore.user.username }}</span>
            </router-link>
            <router-link
                to="/settings"
                class="px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast flex items-center justify-center"
                :title="t('header.profile.settings')"
            >
              <SpriteIcon name="settings" size="small" />
            </router-link>
            <button
                @click="handleLogout"
                class="px-3 py-2 border border-silver-30 text-silver hover:border-rust hover:text-rust transition-fast flex items-center justify-center"
                :title="t('header.profile.logout')"
            >
              <SpriteIcon name="x-mark" size="small" />
            </button>
          </div>

          <!-- Auth Links (Logged out) -->
          <div v-else class="flex items-center gap-2">
            <router-link
                to="/login"
                class="px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast"
            >
              {{ t('header.auth.login') }}
            </router-link>
            <router-link
                to="/register"
                class="px-3 py-2 bg-neon text-primary font-bold hover:bg-neon-90 transition-fast"
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
      </nav>
    </div>
  </header>
</template>

<style scoped>
/* Smooth transitions para links activos */
.router-link-exact-active {
  @apply text-neon;
}
</style>