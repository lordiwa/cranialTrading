<script setup lang="ts">
import AppContainer from '../components/layout/AppContainer.vue';
import BaseButton from '../components/ui/BaseButton.vue';
</script>

<template>
  <AppContainer>
    <div class="flex flex-col items-center justify-center min-h-screen text-center">
      <div class="mb-8">
        <h1 class="text-h1 font-bold text-rust mb-4">404</h1>
        <h2 class="text-h2 font-bold text-silver mb-4">Usuario no encontrado</h2>
        <p class="text-body text-silver-70 max-w-md">
          El usuario que buscas no existe o el perfil es privado.
        </p>
      </div>

      <div class="flex flex-col md:flex-row gap-4">
        <RouterLink to="/dashboard" class="flex-1">
          <BaseButton class="w-full">
            VOLVER AL DASHBOARD
          </BaseButton>
        </RouterLink>
        <RouterLink to="/collection" class="flex-1">
          <BaseButton variant="secondary" class="w-full">
            VER MI COLECCIÓN
          </BaseButton>
        </RouterLink>
      </div>

      <div class="mt-8 border-t border-silver-20 pt-8 max-w-md">
        <p class="text-small text-silver-70 mb-4">
          ¿Necesitas ayuda?
        </p>
        <RouterLink to="/settings" class="text-neon text-small hover:underline">
          Contáctanos desde configuración
        </RouterLink>
      </div>
    </div>
  </AppContainer>
</template>