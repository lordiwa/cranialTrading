<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import IconV2 from '../components/ui/IconV2.vue';

// design→app v2 F7b (TASK-103): visual-only restyle to the v2 auth-card
// idiom per cranial-design/prototype/03-forgot-password-*.html. Zero
// auth-logic changes — same handleSendReset/store call as before this ticket.
//
// No sticky guest header (see RegisterView.vue for the full rationale):
// forgot-password.spec.ts's backToLoginLink = page.locator('a[href="/login"]')
// assumes exactly ONE such anchor and calls `.click()` on it — a header with
// its own logo/login links would add 2 more matches and break strict mode.

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
  <div class="min-h-screen flex flex-col">
    <main id="main-content" class="flex-1 flex items-center justify-center px-4 py-10 md:py-14">
      <div class="w-full max-w-[440px] flex flex-col items-center gap-5">
        <div class="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neon-10 border border-neon-40 flex items-center justify-center text-neon shadow-[0_0_28px_rgba(90,193,104,.14)]">
          <IconV2 name="mail" :size="28" />
        </div>

        <!-- Success -->
        <div v-if="submitted" class="w-full bg-surface-1 border border-line rounded-xl p-8 md:p-9 shadow-medium text-center">
          <div class="text-center mb-2">
            <p class="text-body text-silver mb-3">
              ✓ {{ t('auth.forgotPassword.success') }}
            </p>
            <p class="text-small text-silver-50 mb-6">
              {{ t('auth.forgotPassword.successMessage') }}
            </p>
          </div>
          <RouterLink
              to="/login"
              class="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 text-small font-bold text-silver-70 hover:text-neon transition-colors duration-200 ease-v2"
          >
            <IconV2 name="chev-l" :size="16" />{{ t('auth.forgotPassword.backToLogin') }}
          </RouterLink>
        </div>

        <!-- Form -->
        <form v-else class="w-full bg-surface-1 border border-line rounded-xl p-7 md:p-9 shadow-medium text-center" @submit.prevent="handleSendReset">
          <div class="mb-6">
            <h1 class="font-display text-h2 font-bold text-silver mb-2">{{ t('auth.forgotPassword.title') }}</h1>
            <p class="text-small text-silver-50">
              {{ t('auth.forgotPassword.instruction') }}
            </p>
          </div>

          <div class="text-left mb-5">
            <label for="forgot-email" class="block text-small font-semibold text-silver-70 mb-1.5">{{ t('auth.login.emailPlaceholder') }}</label>
            <input
                id="forgot-email"
                v-model="email"
                type="email"
                required
                autocomplete="email"
                :placeholder="t('auth.forgotPassword.emailPlaceholder')"
                class="w-full min-h-[44px] px-3.5 bg-[rgba(0,0,0,.28)] border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
            />
            <p v-if="emailError" class="mt-1.5 text-tiny text-rust">{{ emailError }}</p>
          </div>

          <button
              type="submit"
              :disabled="loading"
              class="w-full min-h-[48px] bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ loading ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit') }}
          </button>

          <RouterLink
              to="/login"
              class="inline-flex items-center justify-center gap-2 mt-6 text-small font-semibold text-silver-50 hover:text-neon transition-colors duration-200 ease-v2"
          >
            <IconV2 name="chev-l" :size="16" />{{ t('auth.forgotPassword.backToLogin') }}
          </RouterLink>
        </form>
      </div>
    </main>
  </div>
</template>
