<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../composables/useI18n';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const router = useRouter();
const authStore = useAuthStore();
const { t } = useI18n();

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
    router.push('/dashboard');
  }
};

onMounted(() => {
  if (authStore.user && authStore.emailVerified) {
    router.push('/dashboard');
  }
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-8">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-8">
        <img
            src="/cranial-trading-logo-color.png"
            alt="Cranial Trading Logo"
            class="h-24 w-24 mb-4"
        />
        <h1 class="text-h1 font-bold text-neon text-center tracking-wider">CRANIAL TRADING</h1>
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
              :placeholder="t('auth.register.emailLabel')"
          />

          <BaseInput
              v-model="password"
              type="password"
              :placeholder="t('auth.register.passwordLabel')"
          />

          <BaseInput
              v-model="username"
              type="text"
              :placeholder="t('auth.register.usernameLabel')"
          />

          <BaseInput
              v-model="location"
              type="text"
              :placeholder="t('auth.register.locationLabel')"
          />

          <BaseButton
              type="submit"
              class="w-full"
              :disabled="loading || !email || !password || !username || !location"
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