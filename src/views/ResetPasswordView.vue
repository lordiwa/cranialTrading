<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import { getPasswordStrengthLabel, getPasswordStrengthScore } from '../utils/passwordStrength';
import IconV2 from '../components/ui/IconV2.vue';

// design→app v2 F7b (TASK-103): visual-only restyle to the v2 auth-card
// idiom per cranial-design/prototype/04-reset-password-*.html. Zero
// auth-logic changes — reset-token handling (code/oobCode, authStore.resetPassword)
// is untouched; the only new state is `success` (see below), which is purely
// presentational.
//
// No sticky guest header (see RegisterView.vue for the full rationale) —
// this page has no e2e locator assuming a single a[href="/login"] today, but
// staying consistent with the rest of the auth family avoids the same risk.

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { t } = useI18n();

const code = ref('');
const password = ref('');
const passwordConfirm = ref('');
const loading = ref(false);
const invalidCode = ref(false);
// TASK-103: shows the v2 success card (proto's "ESTADO 2: éxito") for the
// same 1.5s window the auto-redirect already waited silently before this
// ticket — presentational only, resetPassword() itself is unchanged.
const success = ref(false);

onMounted(() => {
  const oobCode = route.query.oobCode as string;
  if (oobCode) {
    code.value = oobCode;
  } else {
    invalidCode.value = true;
  }
});

const passwordScore = computed(() => getPasswordStrengthScore(password.value));
const passwordStrengthKey = computed(() => getPasswordStrengthLabel(passwordScore.value));

const handleReset = async () => {
  if (!password.value || password.value !== passwordConfirm.value) {
    return;
  }

  loading.value = true;
  const resetSucceeded = await authStore.resetPassword(code.value, password.value);
  loading.value = false;

  if (resetSucceeded) {
    success.value = true;
    setTimeout(() => {
      void router.push('/login');
    }, 1500);
  }
};
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <main id="main-content" class="flex-1 flex items-center justify-center px-4 py-10 md:py-14">
      <div class="w-full max-w-[440px] flex flex-col items-center gap-5">
        <div
            :class="[
              'w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-200 ease-v2',
              success ? 'bg-neon text-primary shadow-strong' : 'bg-neon-10 border border-neon-40 text-neon shadow-[0_0_28px_rgba(90,193,104,.14)]',
            ]"
        >
          <IconV2 :name="success ? 'check' : 'lock'" :size="28" />
        </div>

        <!-- Invalid / expired link -->
        <div v-if="invalidCode" class="w-full bg-surface-1 border border-rust rounded-xl p-8 md:p-9 shadow-medium text-center">
          <p class="text-body text-rust mb-3">
            ✗ {{ t('auth.resetPassword.invalidLink') }}
          </p>
          <p class="text-small text-silver-50 mb-6">
            {{ t('auth.resetPassword.invalidLinkMessage') }}
          </p>
          <RouterLink to="/forgot-password" class="text-small font-bold text-neon hover:underline">
            {{ t('auth.resetPassword.requestNewLink') }}
          </RouterLink>
        </div>

        <!-- Success -->
        <div v-else-if="success" class="w-full bg-surface-1 border border-line rounded-xl p-8 md:p-9 shadow-medium text-center">
          <h2 class="font-display text-h2 font-bold text-silver mb-2">{{ t('auth.messages.passwordUpdated') }}</h2>
          <p class="text-small text-silver-50 mb-6">
            {{ t('auth.resetPassword.successMessage') }}
          </p>
          <RouterLink
              to="/login"
              class="inline-flex items-center justify-center w-full min-h-[48px] bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2"
          >
            {{ t('auth.login.title') }}
          </RouterLink>
        </div>

        <!-- Form -->
        <div v-else class="w-full bg-surface-1 border border-line rounded-xl p-7 md:p-9 shadow-medium">
          <div class="text-center mb-6">
            <h1 class="font-display text-h2 font-bold text-silver mb-2">{{ t('auth.resetPassword.title') }}</h1>
          </div>

          <div class="mb-4">
            <label for="reset-password" class="block text-small font-semibold text-silver-70 mb-1.5">{{ t('auth.resetPassword.newPasswordPlaceholder') }}</label>
            <input
                id="reset-password"
                v-model="password"
                type="password"
                required
                autocomplete="new-password"
                class="w-full min-h-[44px] px-3.5 bg-[rgba(0,0,0,.28)] border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
            />
            <div v-if="password" class="flex gap-1.5 mt-2" aria-hidden="true">
              <span
                  v-for="seg in 4"
                  :key="seg"
                  :class="['flex-1 h-1 rounded-full transition-colors duration-200 ease-v2', seg <= passwordScore ? 'bg-neon' : 'bg-surface-3']"
              />
            </div>
            <p v-if="password" class="mt-1.5 text-tiny text-silver-50">
              {{ t('auth.passwordStrength.label') }}: <span class="text-neon font-semibold">{{ t(`auth.passwordStrength.${passwordStrengthKey}`) }}</span>
            </p>
          </div>

          <div class="mb-2">
            <label for="reset-password-confirm" class="block text-small font-semibold text-silver-70 mb-1.5">{{ t('auth.resetPassword.confirmPasswordPlaceholder') }}</label>
            <input
                id="reset-password-confirm"
                v-model="passwordConfirm"
                type="password"
                required
                autocomplete="new-password"
                class="w-full min-h-[44px] px-3.5 bg-[rgba(0,0,0,.28)] border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
            />
          </div>

          <div v-if="password && passwordConfirm && password !== passwordConfirm" class="text-tiny text-rust mb-3">
            {{ t('auth.resetPassword.passwordMismatch') }}
          </div>

          <button
              type="button"
              :disabled="loading || !password || password !== passwordConfirm"
              class="w-full min-h-[48px] mt-3 bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handleReset"
          >
            {{ loading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit') }}
          </button>

          <RouterLink
              to="/login"
              class="inline-flex items-center justify-center gap-2 mt-6 w-full text-small font-semibold text-silver-50 hover:text-neon transition-colors duration-200 ease-v2"
          >
            <IconV2 name="chev-l" :size="16" />{{ t('auth.resetPassword.backToLogin') }}
          </RouterLink>
        </div>
      </div>
    </main>
  </div>
</template>
