<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const authStore = useAuthStore();
const { t } = useI18n();

const email = ref('');
const loading = ref(false);
const submitted = ref(false);
const emailError = ref('');

const handleSendReset = async () => {
  emailError.value = '';
  if (!email.value.trim()) {
    emailError.value = t('auth.forgotPassword.emailRequired');
    return;
  }

  loading.value = true;
  const success = await authStore.sendResetPasswordEmail(email.value);
  loading.value = false;

  if (success) {
    submitted.value = true;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <h1 class="text-h2 font-bold text-neon text-center">{{ t('auth.forgotPassword.title') }}</h1>
      </div>

      <div v-if="submitted" class="bg-primary border border-silver-30 p-8">
        <div class="text-center">
          <p class="text-body text-silver mb-4">
            ✓ {{ t('auth.forgotPassword.success') }}
          </p>
          <p class="text-small text-silver-70 mb-6">
            {{ t('auth.forgotPassword.successMessage') }}
          </p>
          <RouterLink to="/login" class="text-small text-neon hover:underline">
            {{ t('auth.forgotPassword.backToLogin') }}
          </RouterLink>
        </div>
      </div>

      <form v-else class="bg-primary border border-silver-30 p-8 space-y-lg" @submit.prevent="handleSendReset">
        <p class="text-small text-silver-70">
          {{ t('auth.forgotPassword.instruction') }}
        </p>

        <BaseInput
            v-model="email"
            type="email"
            required
            :placeholder="t('auth.forgotPassword.emailPlaceholder')"
            :error="emailError"
        />

        <BaseButton
            type="submit"
            :disabled="loading"
            class="w-full"
        >
          {{ loading ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit') }}
        </BaseButton>

        <div class="text-center">
          <RouterLink to="/login" class="text-small text-silver hover:text-neon transition-fast">
            {{ t('auth.forgotPassword.backToLogin') }}
          </RouterLink>
        </div>
      </form>
    </div>
  </div>
</template>