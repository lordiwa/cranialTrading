<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const loading = ref(false);
const submitted = ref(false);

const handleSendReset = async () => {
  if (!email.value) return;

  loading.value = true;
  const success = await authStore.sendResetPasswordEmail(email.value);
  loading.value = false;

  if (success) {
    submitted.value = true;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-primary px-4">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <h1 class="text-h2 font-bold text-neon text-center">RECUPERAR CONTRASEÑA</h1>
      </div>

      <div v-if="submitted" class="bg-primary border border-silver-30 p-8">
        <div class="text-center">
          <p class="text-body text-silver mb-4">
            ✓ Email enviado
          </p>
          <p class="text-small text-silver-70 mb-6">
            Revisa tu correo para el enlace de recuperación. Si no lo ves, revisa spam.
          </p>
          <RouterLink to="/login" class="text-small text-neon hover:underline">
            Volver al login
          </RouterLink>
        </div>
      </div>

      <div v-else class="bg-primary border border-silver-30 p-8 space-y-6">
        <p class="text-small text-silver-70">
          Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
        </p>

        <BaseInput
            v-model="email"
            type="email"
            placeholder="tu@email.com"
        />

        <BaseButton
            @click="handleSendReset"
            :disabled="loading || !email"
            class="w-full"
        >
          {{ loading ? 'ENVIANDO...' : 'ENVIAR ENLACE' }}
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