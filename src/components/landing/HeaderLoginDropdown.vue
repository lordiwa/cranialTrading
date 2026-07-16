<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useToastStore } from '../../stores/toast';
import { useI18n } from '../../composables/useI18n';
import IconV2 from '../ui/IconV2.vue';
import SvgIcon from '../ui/SvgIcon.vue';

// The same login form that used to live in the right column of LoginView
// (TASK-086): now shown inside the header "Iniciar sesión" dropdown
// (desktop) / sheet (mobile). Self-contained so LandingHeader doesn't need
// to thread auth state through props.
//
// TASK-102 (F7a): visual-only v2 restyle (elevated surface, IconV2, v2
// inputs/buttons) — BaseInput/BaseButton/BaseModal are shared app-wide and
// still v1-styled, so this file uses hand-rolled markup instead of
// widening the blast radius to every other consumer of those components.
// The Google button (TASK-118) keeps its exact handler/store call.

const emit = defineEmits<{
  close: [];
}>();

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toastStore = useToastStore();
const { t } = useI18n();

const email = ref('');
const password = ref('');
const loading = ref(false);
const googleLoading = ref(false);

const handleLogin = async () => {
  if (!email.value || !password.value) return;

  loading.value = true;
  try {
    const success = await authStore.login(email.value, password.value);

    if (success) {
      await router.push(route.query.returnUrl as string || '/dashboard');
      return;
    }

    toastStore.show(t('auth.messages.invalidCredentials'), 'error');
  } catch {
    toastStore.show(t('auth.messages.invalidCredentials'), 'error');
  } finally {
    loading.value = false;
  }
};

const handleGoogleLogin = async () => {
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
</script>

<template>
  <div class="bg-[#0d0d0f] border border-line-strong rounded-lg p-5 w-full shadow-strong">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-display text-[18px] font-bold text-silver">{{ t('auth.login.title') }}</h2>
      <button
          type="button"
          class="relative inline-flex items-center justify-center rounded-md w-9 h-9 text-silver-50 transition-all duration-200 ease-v2 hover:text-silver hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
          :aria-label="t('common.actions.close')"
          @click="emit('close')"
      >
        <IconV2 name="x" :size="18" />
      </button>
    </div>

    <form @submit.prevent="handleLogin" class="space-y-3">
      <input
          v-model="email"
          type="email"
          :placeholder="t('common.labels.email')"
          class="w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
      />

      <input
          v-model="password"
          type="password"
          :placeholder="t('common.labels.password')"
          class="w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
      />

      <button
          type="submit"
          class="w-full min-h-[44px] bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neon disabled:hover:shadow-none"
          :disabled="loading || !email || !password"
      >
        {{ loading ? t('auth.login.submitting') : t('auth.login.submit') }}
      </button>
    </form>

    <div class="flex items-center gap-4 my-5">
      <div class="flex-1 h-px bg-line"></div>
      <span class="text-tiny text-silver-50">{{ t('auth.login.orContinueWith') }}</span>
      <div class="flex-1 h-px bg-line"></div>
    </div>

    <button
        @click="handleGoogleLogin"
        :disabled="googleLoading"
        type="button"
        class="w-full flex items-center justify-center gap-3 min-h-[44px] px-4 bg-white text-gray-700 font-medium rounded-md hover:bg-gray-100 transition-colors duration-200 ease-v2 disabled:opacity-50"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      {{ googleLoading ? '...' : t('auth.login.googleButton') }}
    </button>

    <div class="mt-5 space-y-2.5 text-center">
      <RouterLink
          to="/forgot-password"
          class="block text-small text-silver-70 hover:text-neon transition-colors duration-200 ease-v2"
          @click="emit('close')"
      >
        {{ t('auth.login.forgotPassword') }}
      </RouterLink>
      <div class="text-silver-30 text-tiny">o</div>
      <RouterLink
          to="/register"
          class="block text-small text-silver hover:text-neon transition-colors duration-200 ease-v2"
          @click="emit('close')"
      >
        {{ t('auth.login.noAccount') }} {{ t('auth.login.register') }}
      </RouterLink>
    </div>

    <div class="mt-4 flex items-center justify-center text-tiny text-silver-50">
      <span class="flex items-center gap-1"><SvgIcon name="lock" size="tiny" /> {{ t('auth.login.secureConnection') }}</span>
    </div>
  </div>
</template>
