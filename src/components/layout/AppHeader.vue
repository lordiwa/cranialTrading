<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();
const mobileMenuOpen = ref(false);

const handleLogout = async () => {
  await authStore.logout();
  router.push('/login');
  mobileMenuOpen.value = false;
};

const closeMenu = () => {
  mobileMenuOpen.value = false;
};
</script>

<template>
  <header class="bg-primary border-b border-silver-20 px-4 md:px-6">
    <div class="h-14 md:h-15 flex items-center justify-between">
      <!-- Logo -->
      <h1 class="text-body md:text-h3 font-bold text-neon tracking-wider">CRANIAL</h1>

      <!-- Desktop Nav -->
      <nav class="hidden md:flex gap-6">
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
            to="/preferences"
            class="text-body text-silver hover:text-neon transition-fast"
            active-class="text-neon"
        >
          Busco
        </RouterLink>
        <RouterLink
            to="/saved-matches"
            class="text-body text-silver hover:text-neon transition-fast"
            active-class="text-neon"
        >
          Matches
        </RouterLink>
      </nav>

      <!-- Desktop User -->
      <div class="hidden md:flex items-center gap-4">
        <span class="text-small text-silver-70">@{{ authStore.user?.username }}</span>
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

    <!-- Mobile Menu -->
    <Transition name="slide">
      <div v-if="mobileMenuOpen" class="md:hidden border-t border-silver-20">
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
              to="/preferences"
              @click="closeMenu"
              class="px-4 py-3 text-body text-silver hover:text-neon hover:bg-silver-5 transition-fast"
              active-class="text-neon bg-neon-5"
          >
            Busco
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
            <p class="text-small text-silver-70 mb-2">@{{ authStore.user?.username }}</p>
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