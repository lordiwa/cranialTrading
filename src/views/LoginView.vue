<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const router = useRouter();
const authStore = useAuthStore();
const toastStore = useToastStore();

const email = ref('');
const password = ref('');
const loading = ref(false);

const handleLogin = async () => {
  if (!email.value || !password.value) return;

  loading.value = true;
  try {
    const success = await authStore.login(email.value, password.value);

    if (success) {
      await router.push('/dashboard');
      return;
    }

    toastStore.show('Credenciales inválidas', 'error');
  } catch (err) {
    toastStore.show('Error al iniciar sesión', 'error');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-primary px-4">
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
        <h2 class="text-h2 font-bold text-silver mb-6">INICIAR SESIÓN</h2>

        <form @submit.prevent="handleLogin" class="space-y-md">
          <BaseInput
              v-model="email"
              type="email"
              placeholder="Email"
          />

          <BaseInput
              v-model="password"
              type="password"
              placeholder="Contraseña"
          />

          <BaseButton
              type="submit"
              class="w-full"
              :disabled="loading || !email || !password"
          >
            {{ loading ? 'INGRESANDO...' : 'INGRESAR' }}
          </BaseButton>
        </form>

        <div class="mt-6 space-y-sm text-center">
          <RouterLink
              to="/forgot-password"
              class="block text-small text-silver-70 hover:text-neon transition-fast"
          >
            ¿Olvidaste tu contraseña?
          </RouterLink>
          <div class="text-silver-50 text-tiny">o</div>
          <RouterLink
              to="/register"
              class="block text-small text-silver hover:text-neon transition-fast"
          >
            ¿No tienes cuenta? Registrarse
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>