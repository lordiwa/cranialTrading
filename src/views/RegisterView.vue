<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSeoMeta } from '@unhead/vue';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { t } = useI18n();

useSeoMeta({
  ogTitle: t('seo.pages.register.title') + ' | Cranial Trading',
  ogDescription: t('seo.pages.register.description'),
  ogType: 'website',
  ogUrl: 'https://cranial-trading.web.app/register',
  ogSiteName: 'Cranial Trading',
  twitterCard: 'summary_large_image',
});

const email = ref('');
const password = ref('');
const username = ref('');
const location = ref('');
const loading = ref(false);
const registered = ref(false);
const checkingVerification = ref(false);

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
    registered.value = true;
  }
};

const handleResendEmail = async () => {
  await authStore.sendVerificationEmail();
};

const handleCheckVerification = async () => {
  checkingVerification.value = true;
  const verified = await authStore.checkEmailVerification();
  checkingVerification.value = false;

  if (verified) {
    void router.push(route.query.returnUrl as string || '/dashboard');
  }
};

onMounted(() => {
  if (authStore.user && authStore.emailVerified) {
    void router.push(route.query.returnUrl as string || '/dashboard');
  }
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-8">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <svg class="w-24 h-24 mb-4 text-neon" viewBox="0 0 100 100" fill="currentColor">
          <use href="/icons.svg#cranial-logo" />
        </svg>
        <h1 class="text-h1 font-bold text-neon text-center tracking-wider font-brother">CRANIAL TRADING</h1>
      </div>

      <!-- Verification screen -->
      <div v-if="registered" class="bg-primary border border-silver-30 p-8 rounded-lg">
        <h2 class="text-h2 font-bold text-silver mb-6">{{ t('auth.verify.title') }}</h2>

        <div class="space-y-lg">
          <div class="bg-primary-dark border border-silver-30 p-md rounded">
            <p class="text-small text-silver-70">
              {{ t('auth.verify.message') }} <span class="text-neon font-bold">{{ email }}</span>
            </p>
            <p class="text-tiny text-silver-50 mt-2">
              {{ t('auth.verify.instruction') }}
            </p>
          </div>

          <div class="space-y-sm">
            <BaseButton
                @click="handleCheckVerification"
                :disabled="checkingVerification"
                class="w-full"
            >
              {{ checkingVerification ? t('auth.verify.checking') : t('auth.verify.checkButton') }}
            </BaseButton>

            <BaseButton
                variant="secondary"
                size="small"
                @click="handleResendEmail"
                class="w-full"
            >
              {{ t('auth.verify.resend') }}
            </BaseButton>
          </div>

          <div class="text-center">
            <RouterLink
                to="/login"
                class="text-small text-silver hover:text-neon transition-fast"
            >
              {{ t('auth.forgotPassword.backToLogin') }}
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Registration form -->
      <div v-else class="bg-primary border border-silver-30 p-8 rounded-lg">
        <h2 class="text-h2 font-bold text-silver mb-6">{{ t('auth.register.title') }}</h2>

        <form @submit.prevent="handleRegister" class="space-y-md">
          <BaseInput
              v-model="email"
              type="email"
              required
              :placeholder="t('auth.register.emailLabel')"
          />

          <BaseInput
              v-model="password"
              type="password"
              required
              :placeholder="t('auth.register.passwordLabel')"
          />

          <BaseInput
              v-model="username"
              type="text"
              required
              :placeholder="t('auth.register.usernameLabel')"
          />

          <BaseInput
              v-model="location"
              type="text"
              required
              :placeholder="t('auth.register.locationLabel')"
          />

          <BaseButton
              type="submit"
              class="w-full"
              data-testid="register-submit"
              :disabled="loading"
          >
            {{ loading ? t('auth.register.submitting') : t('auth.register.submit') }}
          </BaseButton>
        </form>

        <div class="mt-6 text-center">
          <RouterLink
              to="/login"
              class="text-small text-silver hover:text-neon transition-fast"
          >
            {{ t('auth.register.hasAccount') }} {{ t('auth.register.login') }}
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>