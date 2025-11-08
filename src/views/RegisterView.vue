<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const username = ref('');
const location = ref('');
const loading = ref(false);

const handleRegister = async () => {
  if (!email.value || !password.value || !username.value || !location.value) return;

  loading.value = true;
  const success = await authStore.register(
      email.value,
      password.value,
      username.value,
      location.value
  );
  loading.value = false;

  if (success) {
    router.push('/dashboard');
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-primary px-4 py-8">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <img
            src="/cranial-trading-logo-color.png"
            alt="Cranial Trading Logo"
            class="h-24 w-24 mb-4"
        />
        <h1 class="text-h1 font-bold text-neon text-center tracking-wider">CRANIAL TRADING</h1>
      </div>

      <div class="bg-primary border border-silver-30 p-8 shadow-medium">
        <h2 class="text-h2 font-bold text-silver mb-6">REGISTRARSE</h2>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <BaseInput
              v-model="email"
              type="email"
              placeholder="Email"
          />

          <BaseInput
              v-model="password"
              type="password"
              placeholder="Contraseña (mínimo 6 caracteres)"
          />

          <BaseInput
              v-model="username"
              type="text"
              placeholder="Nombre de usuario"
          />

          <BaseInput
              v-model="location"
              type="text"
              placeholder="Ubicación (ej: Buenos Aires, Argentina)"
          />

          <BaseButton
              type="submit"
              class="w-full"
              :disabled="loading || !email || !password || !username || !location"
          >
            {{ loading ? 'CREANDO CUENTA...' : 'CREAR CUENTA' }}
          </BaseButton>
        </form>

        <div class="mt-6 text-center">
          <RouterLink
              to="/login"
              class="text-small text-silver hover:text-neon transition-fast"
          >
            ¿Ya tienes cuenta? Iniciar sesión
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>