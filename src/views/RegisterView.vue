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
const googleLoading = ref(false);

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

// TASK-118: restore Google sign-up — goes through the same loginWithGoogle
// flow as the header dropdown (handles both new + returning Google users,
// including first-time username reservation), so this is the register
// entry point's parallel sibling of HeaderLoginDropdown's handleGoogleLogin.
const handleGoogleRegister = async () => {
  googleLoading.value = true;
  try {
    const success = await authStore.loginWithGoogle();
    if (success) {
      await router.push(route.query.returnUrl as string || '/dashboard');
    }
  } finally {
    googleLoading.value = false;
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

        <div class="flex items-center gap-4 my-5">
          <div class="flex-1 h-px bg-silver-30"></div>
          <span class="text-tiny text-silver-50">{{ t('auth.login.orContinueWith') }}</span>
          <div class="flex-1 h-px bg-silver-30"></div>
        </div>

        <button
            @click="handleGoogleRegister"
            :disabled="googleLoading"
            type="button"
            class="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ googleLoading ? '...' : t('auth.login.googleButton') }}
        </button>

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