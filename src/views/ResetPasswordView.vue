<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const code = ref('');
const password = ref('');
const passwordConfirm = ref('');
const loading = ref(false);
const invalidCode = ref(false);

onMounted(() => {
  const oobCode = route.query.oobCode as string;
  if (!oobCode) {
    invalidCode.value = true;
  } else {
    code.value = oobCode;
  }
});

const handleReset = async () => {
  if (!password.value || password.value !== passwordConfirm.value) {
    return;
  }

  loading.value = true;
  const success = await authStore.resetPassword(code.value, password.value);
  loading.value = false;

  if (success) {
    setTimeout(() => {
      router.push('/login');
    }, 1500);
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-primary px-4">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <h1 class="text-h2 font-bold text-neon text-center">NUEVA CONTRASEÑA</h1>
      </div>

      <div v-if="invalidCode" class="bg-primary border border-rust p-8 text-center">
        <p class="text-body text-rust mb-4">
          ✗ Enlace inválido
        </p>
        <p class="text-small text-silver-70 mb-6">
          El enlace de recuperación es inválido o expiró.
        </p>
        <RouterLink to="/forgot-password" class="text-small text-neon hover:underline">
          Solicitar nuevo enlace
        </RouterLink>
      </div>

      <div v-else class="bg-primary border border-silver-30 p-8 space-y-4">
        <BaseInput
            v-model="password"
            type="password"
            placeholder="Nueva contraseña"
        />

        <BaseInput
            v-model="passwordConfirm"
            type="password"
            placeholder="Confirmar contraseña"
        />

        <div v-if="password && passwordConfirm && password !== passwordConfirm" class="text-tiny text-rust">
          Las contraseñas no coinciden
        </div>

        <BaseButton
            @click="handleReset"
            :disabled="loading || !password || password !== passwordConfirm"
            class="w-full"
        >
          {{ loading ? 'RESTABLECIENDO...' : 'RESTABLECER' }}
        </BaseButton>

        <div class="text-center">
          <RouterLink to="/login" class="text-small text-silver hover:text-neon transition-fast">
            Volver al login
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>