<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { t } = useI18n();

const code = ref('');
const password = ref('');
const passwordConfirm = ref('');
const loading = ref(false);
const invalidCode = ref(false);

onMounted(() => {
  const oobCode = route.query.oobCode as string;
  if (oobCode) {
    code.value = oobCode;
  } else {
    invalidCode.value = true;
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
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <h1 class="text-h2 font-bold text-neon text-center">{{ t('auth.resetPassword.title') }}</h1>
      </div>

      <div v-if="invalidCode" class="bg-primary border border-rust p-8 text-center">
        <p class="text-body text-rust mb-4">
          ✗ {{ t('auth.resetPassword.invalidLink') }}
        </p>
        <p class="text-small text-silver-70 mb-6">
          {{ t('auth.resetPassword.invalidLinkMessage') }}
        </p>
        <RouterLink to="/forgot-password" class="text-small text-neon hover:underline">
          {{ t('auth.resetPassword.requestNewLink') }}
        </RouterLink>
      </div>

      <div v-else class="bg-primary border border-silver-30 p-8 space-y-md">
        <BaseInput
            v-model="password"
            type="password"
            :placeholder="t('auth.resetPassword.newPasswordPlaceholder')"
        />

        <BaseInput
            v-model="passwordConfirm"
            type="password"
            :placeholder="t('auth.resetPassword.confirmPasswordPlaceholder')"
        />

        <div v-if="password && passwordConfirm && password !== passwordConfirm" class="text-tiny text-rust">
          {{ t('auth.resetPassword.passwordMismatch') }}
        </div>

        <BaseButton
            @click="handleReset"
            :disabled="loading || !password || password !== passwordConfirm"
            class="w-full"
        >
          {{ loading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit') }}
        </BaseButton>

        <div class="text-center">
          <RouterLink to="/login" class="text-small text-silver hover:text-neon transition-fast">
            {{ t('auth.resetPassword.backToLogin') }}
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>