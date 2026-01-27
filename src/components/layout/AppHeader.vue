<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isAuthenticated = computed(() => !!authStore.user)

const navigationLinks = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/collection', label: 'Colección', icon: '📚' },
  { path: '/saved-matches', label: 'Matches', icon: '🔗' },
  { path: '/messages', label: 'Mensajes', icon: '💬' },
]

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
          <div class="text-h3 font-bold text-neon">⚙️</div>
          <span class="hidden sm:inline text-h3 font-bold text-neon">CRANIAL</span>
        </router-link>

        <!-- Navigation Links (Desktop) -->
        <nav v-if="isAuthenticated" aria-label="Main navigation" class="hidden md:flex items-center gap-1">
          <router-link
              v-for="link in navigationLinks"
              :key="link.path"
              :to="link.path"
              :class="[
                'px-4 py-2 text-small font-bold transition-fast rounded-sm',
                isActive(link.path)
                  ? 'bg-neon-10 border-b-2 border-neon text-neon'
                  : 'text-silver-70 hover:text-silver hover:border-b-2 hover:border-silver'
              ]"
          >
            <span class="inline-block mr-1">{{ link.icon }}</span>
            {{ link.label }}
          </router-link>
        </nav>

        <!-- Right side: User & Settings -->
        <div class="flex items-center gap-2 md:gap-4">
          <!-- Mobile Menu Button -->
          <button
              v-if="isAuthenticated"
              class="md:hidden px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast"
              @click="$emit('toggle-menu')"
          >
            ☰
          </button>

          <!-- User Menu -->
          <div v-if="isAuthenticated" class="flex items-center gap-2">
            <!-- Mi Perfil -->
            <router-link
                v-if="authStore.user?.username"
                :to="`/@${authStore.user.username}`"
                class="hidden sm:flex px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast items-center gap-1"
                title="Ver mi perfil público"
            >
              <span>👤</span>
              <span class="text-tiny">@{{ authStore.user.username }}</span>
            </router-link>
            <router-link
                to="/settings"
                class="px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast"
                title="Configuración"
            >
              ⚙️
            </router-link>
            <button
                @click="handleLogout"
                class="px-3 py-2 border border-silver-30 text-silver hover:border-ruby hover:text-ruby transition-fast"
                title="Cerrar sesión"
            >
              🚪
            </button>
          </div>

          <!-- Auth Links (Logged out) -->
          <div v-else class="flex items-center gap-2">
            <router-link
                to="/login"
                class="px-3 py-2 border border-silver-30 text-silver hover:border-neon hover:text-neon transition-fast"
            >
              Iniciar
            </router-link>
            <router-link
                to="/register"
                class="px-3 py-2 bg-neon text-primary font-bold hover:bg-neon-90 transition-fast"
            >
              Registrar
            </router-link>
          </div>
        </div>
      </div>

      <!-- Mobile Navigation Menu -->
      <nav v-if="isAuthenticated" aria-label="Mobile navigation" class="md:hidden border-t border-silver-20 pb-2">
        <router-link
            v-for="link in navigationLinks"
            :key="link.path"
            :to="link.path"
            :class="[
              'block px-4 py-2 text-small font-bold transition-fast',
              isActive(link.path)
                ? 'bg-neon-10 border-l-2 border-neon text-neon'
                : 'text-silver-70 hover:text-silver'
            ]"
        >
          <span class="inline-block mr-2">{{ link.icon }}</span>
          {{ link.label }}
        </router-link>
        <!-- Mi Perfil (mobile) -->
        <router-link
            v-if="authStore.user?.username"
            :to="`/@${authStore.user.username}`"
            class="block px-4 py-2 text-small font-bold text-silver-70 hover:text-neon transition-fast"
        >
          <span class="inline-block mr-2">👤</span>
          Mi Perfil (@{{ authStore.user.username }})
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