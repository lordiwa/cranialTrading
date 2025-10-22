<script setup lang="ts">
import { useAuthStore } from '../../stores/auth';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();

const handleLogout = async () => {
  await authStore.logout();
  router.push('/login');
};
</script>

<template>
  <header class="bg-primary h-15 border-b border-silver-20 px-6 flex items-center justify-between">
    <div class="flex items-center gap-8">
      <h1 class="text-h3 font-bold text-neon tracking-wider">CRANIAL</h1>

      <nav class="flex gap-6">
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
          Mi Colección
        </RouterLink>
        <RouterLink
            to="/preferences"
            class="text-body text-silver hover:text-neon transition-fast"
            active-class="text-neon"
        >
          Mis Preferencias
        </RouterLink>
        <RouterLink
            to="/saved-matches"
            class="text-body text-silver hover:text-neon transition-fast"
            active-class="text-neon"
        >
          Mis Matches
        </RouterLink>
      </nav>
    </div>

    <div class="flex items-center gap-4">
      <span class="text-small text-silver-70">@{{ authStore.user?.username }}</span>
      <button
          @click="handleLogout"
          class="text-small text-silver hover:text-rust transition-fast"
      >
        Salir
      </button>
    </div>
  </header>
</template>