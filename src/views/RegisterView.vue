<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSeoMeta } from '@unhead/vue';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import { getPasswordStrengthLabel, getPasswordStrengthScore } from '../utils/passwordStrength';
import IconV2 from '../components/ui/IconV2.vue';

// design→app v2 F7b (TASK-103): visual-only restyle to the v2 auth-card
// idiom (surface-1/line, font-display, glow-neon focus, IconV2) per
// cranial-design/prototype/02-register-*.html and 81-email-verification-*.html.
// Zero auth-logic changes — same handlers/store calls as before this ticket.
//
// No sticky guest header here (unlike the prototype's `.hdr` bar): register.page.ts's
// `loginLink = page.locator('a[href="/login"]')` assumes exactly ONE such anchor on
// this page (the footer "already have account?" link) and calls `.click()` on it —
// strict-mode Playwright throws on 2+ matches, so a header with its own logo/login
// links would have broken that e2e locator. Deliberate scope trim, not an oversight.

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
const showChangeEmailForm = ref(false);
const newEmail = ref('');
const changingEmail = ref(false);

// Presentation-only advisory meter (TASK-103) — never gates submission.
const passwordScore = computed(() => getPasswordStrengthScore(password.value));
const passwordStrengthKey = computed(() => getPasswordStrengthLabel(passwordScore.value));

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

// TASK-124: "cambiar email" updates the email of the SAME just-created
// account via authStore.changeRegistrationEmail (verifyBeforeUpdateEmail) —
// it must NEVER re-submit the register form, since that would call
// authStore.register again and collide with the username this account
// already reserved (D-06), rolling back into an orphaned account +
// reservation with a misleading "username taken" toast. Reveals an inline
// input on the verification-pending screen instead of resetting `registered`.
const handleChangeEmail = () => {
  newEmail.value = email.value;
  showChangeEmailForm.value = true;
};

const handleCancelChangeEmail = () => {
  showChangeEmailForm.value = false;
  newEmail.value = '';
};

const submitChangeEmail = async () => {
  if (!newEmail.value) return;

  changingEmail.value = true;
  const success = await authStore.changeRegistrationEmail(newEmail.value);
  changingEmail.value = false;

  if (success) {
    email.value = newEmail.value;
    showChangeEmailForm.value = false;
    newEmail.value = '';
  }
};

// TASK-126: a remount (reload, or navigate-away-and-back) with an already
// logged-in but UNVERIFIED account used to fall through both branches here,
// showing the blank registration form instead of the pending-verification
// screen — a re-submit from there re-runs authStore.register() and collides
// with this SAME account's own already-reserved username (D-06), producing
// a misleading "username taken" toast. `registered.value = true` shows the
// pending screen (with the TASK-124 change-email flow) instead, and since
// the form itself is gone from the DOM in that branch (v-else in the
// template), no UI path is left that could dispatch a second register().
onMounted(() => {
  if (authStore.user && authStore.emailVerified) {
    void router.push(route.query.returnUrl as string || '/dashboard');
  } else if (authStore.user && !authStore.emailVerified) {
    registered.value = true;
  }
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <main id="main-content" class="flex-1 flex items-center justify-center px-4 py-10 md:py-14">
      <div class="w-full max-w-[440px] flex flex-col items-center gap-5">
        <div class="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neon-10 border border-neon-40 flex items-center justify-center shadow-[0_0_28px_rgba(90,193,104,.14)]">
          <svg class="w-8 h-8 md:w-9 md:h-9 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
        </div>

        <!-- Verification screen -->
        <div v-if="registered" class="w-full bg-surface-1 border border-line rounded-xl p-8 md:p-9 shadow-medium text-center">
          <div class="w-16 h-16 mx-auto mb-5 rounded-full bg-neon-10 border border-neon-40 flex items-center justify-center text-neon shadow-[0_0_24px_rgba(90,193,104,.18)]">
            <IconV2 name="mail" :size="28" />
          </div>
          <h2 class="font-display text-h2 font-bold text-silver mb-5">{{ t('auth.verify.title') }}</h2>

          <div class="bg-surface-2 border border-line rounded-md p-4 text-left mb-5">
            <p class="text-small text-silver-70">
              {{ t('auth.verify.message') }} <span class="text-neon font-bold">{{ email }}</span>
            </p>
            <p class="text-tiny text-silver-50 mt-1.5">
              {{ t('auth.verify.instruction') }}
            </p>
          </div>

          <div class="flex flex-col gap-2.5">
            <button
                type="button"
                :disabled="checkingVerification"
                class="min-h-[48px] bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleCheckVerification"
            >
              {{ checkingVerification ? t('auth.verify.checking') : t('auth.verify.checkButton') }}
            </button>

            <button
                type="button"
                class="min-h-[44px] flex items-center justify-center gap-2 text-silver-70 text-small font-semibold hover:text-neon transition-colors duration-200 ease-v2"
                @click="handleResendEmail"
            >
              <IconV2 name="mail" :size="16" />{{ t('auth.verify.resend') }}
            </button>

            <button
                v-if="!showChangeEmailForm"
                type="button"
                class="min-h-[36px] text-silver-50 text-tiny hover:text-silver transition-colors duration-200 ease-v2"
                @click="handleChangeEmail"
            >
              {{ t('auth.verify.changeEmail') }}
            </button>

            <form v-else class="flex flex-col gap-2 text-left mt-1" @submit.prevent="submitChangeEmail">
              <label for="register-new-email" class="text-tiny font-semibold text-silver-70">{{ t('auth.verify.changeEmailPrompt') }}</label>
              <input
                  id="register-new-email"
                  v-model="newEmail"
                  type="email"
                  required
                  autocomplete="email"
                  :placeholder="t('auth.login.emailPlaceholder')"
                  class="w-full min-h-[40px] px-3 bg-[rgba(0,0,0,.28)] border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
              />
              <div class="flex gap-2">
                <button
                    type="submit"
                    :disabled="changingEmail"
                    class="flex-1 min-h-[40px] bg-neon text-primary font-bold text-[11px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] transition-all duration-200 ease-v2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ changingEmail ? t('auth.verify.changeEmailSubmitting') : t('auth.verify.changeEmailSubmit') }}
                </button>
                <button
                    type="button"
                    :disabled="changingEmail"
                    class="min-h-[40px] px-3 text-silver-50 text-tiny hover:text-silver transition-colors duration-200 ease-v2"
                    @click="handleCancelChangeEmail"
                >
                  {{ t('auth.verify.changeEmailCancel') }}
                </button>
              </div>
            </form>
          </div>

          <RouterLink
              to="/login"
              class="inline-flex items-center gap-2 mt-6 text-small text-silver-50 hover:text-neon transition-colors duration-200 ease-v2"
          >
            <IconV2 name="chev-l" :size="16" />{{ t('auth.forgotPassword.backToLogin') }}
          </RouterLink>
        </div>

        <!-- Registration form -->
        <form v-else class="w-full bg-surface-1 border border-line rounded-xl p-7 md:p-9 shadow-medium" @submit.prevent="handleRegister">
          <div class="text-center mb-6">
            <h2 class="font-display text-h2 font-bold text-silver">{{ t('auth.register.title') }}</h2>
          </div>

          <div class="mb-4">
            <label for="register-email" class="block text-small font-semibold text-silver-70 mb-1.5">{{ t('auth.register.emailLabel') }}</label>
            <input
                id="register-email"
                v-model="email"
                type="email"
                required
                autocomplete="email"
                :placeholder="t('auth.login.emailPlaceholder')"
                class="w-full min-h-[44px] px-3.5 bg-[rgba(0,0,0,.28)] border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
            />
          </div>

          <div class="mb-4">
            <label for="register-username" class="block text-small font-semibold text-silver-70 mb-1.5">{{ t('auth.register.usernameLabel') }}</label>
            <input
                id="register-username"
                v-model="username"
                type="text"
                required
                class="w-full min-h-[44px] px-3.5 bg-[rgba(0,0,0,.28)] border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
            />
          </div>

          <div class="mb-4">
            <label for="register-password" class="block text-small font-semibold text-silver-70 mb-1.5">{{ t('auth.register.passwordLabel') }}</label>
            <input
                id="register-password"
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

          <div class="mb-5">
            <label for="register-location" class="block text-small font-semibold text-silver-70 mb-1.5">{{ t('auth.register.locationLabel') }}</label>
            <input
                id="register-location"
                v-model="location"
                type="text"
                required
                autocomplete="address-level2"
                class="w-full min-h-[44px] px-3.5 bg-[rgba(0,0,0,.28)] border border-line rounded-md text-silver placeholder-silver-30 text-small outline-none transition-all duration-200 ease-v2 focus:border-neon focus:shadow-glow-neon"
            />
          </div>

          <button
              type="submit"
              data-testid="register-submit"
              :disabled="loading"
              class="w-full min-h-[48px] bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ loading ? t('auth.register.submitting') : t('auth.register.submit') }}
          </button>

          <div class="flex items-center gap-4 my-5">
            <div class="flex-1 h-px bg-line"></div>
            <span class="text-tiny text-silver-50">{{ t('auth.login.orContinueWith') }}</span>
            <div class="flex-1 h-px bg-line"></div>
          </div>

          <button
              type="button"
              :disabled="googleLoading"
              class="w-full flex items-center justify-center gap-3 min-h-[44px] px-4 bg-white text-gray-700 font-medium rounded-md hover:bg-gray-100 transition-colors duration-200 ease-v2 disabled:opacity-50"
              @click="handleGoogleRegister"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {{ googleLoading ? '...' : t('auth.login.googleButton') }}
          </button>

          <p class="text-center mt-5 text-small text-silver-50">
            {{ t('auth.register.hasAccount') }}
            <RouterLink to="/login" class="text-silver font-semibold hover:text-neon transition-colors duration-200 ease-v2">
              {{ t('auth.register.login') }}
            </RouterLink>
          </p>
        </form>
      </div>
    </main>
  </div>
</template>
