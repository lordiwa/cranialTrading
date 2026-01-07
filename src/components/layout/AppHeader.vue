<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import UserProfileHoverCard from '../user/UserProfileHoverCard.vue';

const authStore = useAuthStore();
const router = useRouter();
const mobileMenuOpen = ref(false);
const showProfileHover = ref(false);

const handleLogout = async () => {
  await router.push('/login');
  await authStore.logout();
};

const closeMenu = () => {
  mobileMenuOpen.value = false;
};
</script>

<template>
  <header class="bg-primary h-15 border-b border-silver-20 px-lg flex items-center justify-between">
    <div class="flex items-center gap-lg">
      <div class="flex items-center gap-sm">
        <img
            src="/cranial-trading-logo-color.png"
            alt="Cranial Trading Logo"
            class="h-10 w-10"
        />
      </div>

      <!-- Desktop Nav -->
      <nav class="hidden md:flex gap-lg">
        <RouterLink
            to="/dashboard"
            class="text-body text-silver hover:text-neon transition-fast"
            active-class="text-neon"
        >
          Dashboard
        </RouterLink>
        <RouterLink
            to="/collection"
            class="text-body text-silver hover:text-neon transition-fast"
            active-class="text-neon"
        >
          Colección
        </RouterLink>
        <RouterLink
            to="/saved-matches"
            class="text-body text-silver hover:text-neon transition-fast"
            active-class="text-neon"
        >
          Matches
        </RouterLink>
      </nav>

      <!-- Desktop User - SOLO si hay usuario -->
      <div v-if="authStore.user" class="hidden md:flex items-center gap-md">
        <div
            @mouseenter="showProfileHover = true"
            @mouseleave="showProfileHover = false"
            class="relative"
        >
          <RouterLink
              :to="{ name: 'userProfile', params: { username: authStore.user.username } }"
              class="text-small text-silver hover:text-neon transition-fast font-bold"
          >
            @{{ authStore.user.username }}
          </RouterLink>
          <UserProfileHoverCard
              :username="authStore.user.username"
              :show="showProfileHover"
          />
        </div>

        <RouterLink
            to="/settings"
            class="text-small text-silver hover:text-neon transition-fast"
        >
          ⚙️
        </RouterLink>
        <button
            @click="handleLogout"
            class="text-small text-silver hover:text-rust transition-fast"
        >
          Salir
        </button>
      </div>

      <!-- Mobile Hamburger -->
      <button
          @click="mobileMenuOpen = !mobileMenuOpen"
          class="md:hidden p-2 text-silver hover:text-neon transition-fast"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>

    <!-- Mobile Menu - SOLO si hay usuario -->
    <Transition name="slide">
      <div v-if="mobileMenuOpen && authStore.user" class="md:hidden border-t border-silver-20">
        <nav class="flex flex-col py-4">
          <RouterLink
              to="/dashboard"
              @click="closeMenu"
              class="px-4 py-3 text-body text-silver hover:text-neon hover:bg-silver-5 transition-fast"
              active-class="text-neon bg-neon-5"
          >
            Dashboard
          </RouterLink>
          <RouterLink
              to="/collection"
              @click="closeMenu"
              class="px-4 py-3 text-body text-silver hover:text-neon hover:bg-silver-5 transition-fast"
              active-class="text-neon bg-neon-5"
          >
            Mi Colección
          </RouterLink>
          <RouterLink
              to="/saved-matches"
              @click="closeMenu"
              class="px-4 py-3 text-body text-silver hover:text-neon hover:bg-silver-5 transition-fast"
              active-class="text-neon bg-neon-5"
          >
            Mis Matches
          </RouterLink>

          <div class="border-t border-silver-20 mt-2 pt-2 px-4">
            <RouterLink
                :to="{ name: 'userProfile', params: { username: authStore.user.username } }"
                @click="closeMenu"
                class="block text-body text-neon font-bold py-3 hover:text-silver transition-fast"
            >
              @{{ authStore.user.username }}
            </RouterLink>
            <RouterLink
                to="/settings"
                @click="closeMenu"
                class="block text-small text-silver hover:text-neon transition-fast mb-3"
            >
              ⚙️ Configuración
            </RouterLink>
            <button
                @click="handleLogout"
                class="text-body text-rust hover:text-rust transition-fast"
            >
              Cerrar Sesión
            </button>
          </div>
        </nav>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 200ms ease-out;
}

.slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>