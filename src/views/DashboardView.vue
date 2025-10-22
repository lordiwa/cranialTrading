<script setup lang="ts">
import AppContainer from '../components/layout/AppContainer.vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
</script>

<template>
  <AppContainer>
    <div>
      <h1 class="text-h1 font-bold text-silver mb-2">MATCHES DISPONIBLES</h1>
      <p class="text-body text-silver-70 mb-8">
        Bienvenido, {{ authStore.user?.username }}
      </p>

      <div class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">
          No hay matches disponibles aún.
        </p>
        <p class="text-small text-silver-50 mt-2">
          Agrega cartas a tu colección y establece preferencias para comenzar.
        </p>
      </div>
    </div>
  </AppContainer>
</template>