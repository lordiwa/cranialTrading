<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useConfirmStore } from '../stores/confirm';
import { useI18n } from '../composables/useI18n';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import HelpTooltip from '../components/ui/HelpTooltip.vue';

const router = useRouter();
const authStore = useAuthStore();
const confirmStore = useConfirmStore();
const { t } = useI18n();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loadingPassword = ref(false);
const showChangeForm = ref(false);

const emailVerified = ref(false);
const checkingEmail = ref(false);

onMounted(() => {
  emailVerified.value = authStore.emailVerified;
});

const handleChangePassword = async () => {
  if (!currentPassword.value || !newPassword.value || newPassword.value !== confirmPassword.value) {
    return;
  }

  loadingPassword.value = true;
  const success = await authStore.changePassword(currentPassword.value, newPassword.value);
  loadingPassword.value = false;

  if (success) {
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    showChangeForm.value = false;
  }
};

const handleSendVerificationEmail = async () => {
  checkingEmail.value = true;
  await authStore.sendVerificationEmail();
  checkingEmail.value = false;
};

const handleCheckEmailVerification = async () => {
  checkingEmail.value = true;
  const verified = await authStore.checkEmailVerification();
  emailVerified.value = verified;
  checkingEmail.value = false;
};

const handleLogout = async () => {
  const confirmed = await confirmStore.show({
    title: t('settings.logout'),
    message: t('header.profile.logout'),
    confirmText: t('settings.logout'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'secondary'
  })

  if (confirmed) {
    await authStore.logout();
    router.push('/login');
  }
};
</script>

<template>
  <AppContainer>
    <div class="max-w-2xl">
      <h1 class="text-h2 md:text-h1 font-bold text-silver mb-8">{{ t('settings.title') }}</h1>

      <!-- Email verification -->
      <div class="bg-primary border border-silver-30 p-6 md:p-8 mb-6 rounded-md">
        <h2 class="text-body font-bold text-silver mb-4 flex items-center gap-2">
          {{ t('settings.sections.emailVerification.title') }}
          <HelpTooltip
              :text="t('help.tooltips.settings.emailVerification')"
              :title="t('help.titles.emailVerification')"
          />
        </h2>

        <div class="mb-4">
          <p class="text-small text-silver-70">
            {{ t('settings.sections.emailVerification.email') }} <span class="text-neon font-bold">{{ authStore.user?.email }}</span>
          </p>
          <div class="flex items-center gap-3 mt-2">
            <div :class="[
              'w-3 h-3 rounded-full',
              emailVerified ? 'bg-neon' : 'bg-rust'
            ]"></div>
            <span class="text-small" :class="emailVerified ? 'text-neon' : 'text-rust'">
              {{ emailVerified ? t('settings.sections.emailVerification.verified') : t('settings.sections.emailVerification.notVerified') }}
            </span>
          </div>
        </div>

        <div class="flex gap-2">
          <BaseButton
              v-if="!emailVerified"
              variant="secondary"
              size="small"
              @click="handleSendVerificationEmail"
              :disabled="checkingEmail"
              class="flex-1"
          >
            {{ checkingEmail ? t('common.actions.sending') : t('settings.sections.emailVerification.sendEmail') }}
          </BaseButton>
          <BaseButton
              variant="secondary"
              size="small"
              @click="handleCheckEmailVerification"
              :disabled="checkingEmail"
              class="flex-1"
          >
            {{ checkingEmail ? t('common.actions.loading') : t('settings.sections.emailVerification.checkStatus') }}
          </BaseButton>
        </div>
      </div>

      <!-- Change password -->
      <div class="bg-primary border border-silver-30 p-6 md:p-8 mb-6 rounded-md">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-body font-bold text-silver flex items-center gap-2">
            {{ t('settings.sections.changePassword.title') }}
            <HelpTooltip
                :text="t('help.tooltips.settings.password')"
                :title="t('help.titles.password')"
            />
          </h2>
          <BaseButton
              v-if="!showChangeForm"
              variant="secondary"
              size="small"
              @click="showChangeForm = true"
          >
            {{ t('settings.sections.changePassword.change') }}
          </BaseButton>
        </div>

        <div v-if="showChangeForm" class="space-y-md">
          <BaseInput
              v-model="currentPassword"
              type="password"
              :placeholder="t('settings.sections.changePassword.currentPlaceholder')"
          />

          <BaseInput
              v-model="newPassword"
              type="password"
              :placeholder="t('settings.sections.changePassword.newPlaceholder')"
          />

          <BaseInput
              v-model="confirmPassword"
              type="password"
              :placeholder="t('settings.sections.changePassword.confirmPlaceholder')"
          />

          <div v-if="newPassword && confirmPassword && newPassword !== confirmPassword" class="text-tiny text-rust">
            {{ t('settings.sections.changePassword.mismatch') }}
          </div>

          <div class="flex gap-2">
            <BaseButton
                variant="secondary"
                size="small"
                @click="showChangeForm = false"
                class="flex-1"
            >
              {{ t('common.actions.cancel') }}
            </BaseButton>
            <BaseButton
                size="small"
                @click="handleChangePassword"
                :disabled="loadingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword"
                class="flex-1"
            >
              {{ loadingPassword ? t('common.actions.saving') : t('common.actions.save') }}
            </BaseButton>
          </div>
        </div>

        <p v-if="!showChangeForm" class="text-small text-silver-70">
          {{ t('settings.sections.changePassword.hint') }}
        </p>
      </div>

      <!-- User info -->
      <div class="bg-primary border border-silver-30 p-6 md:p-8 mb-6 rounded-md">
        <h2 class="text-body font-bold text-silver mb-4">{{ t('settings.sections.accountInfo.title') }}</h2>

        <div class="space-y-sm text-small">
          <div>
            <p class="text-silver-70">{{ t('settings.sections.accountInfo.username') }}</p>
            <p class="text-silver font-bold">{{ authStore.user?.username }}</p>
          </div>
          <div>
            <p class="text-silver-70">{{ t('settings.sections.accountInfo.location') }}</p>
            <p class="text-silver font-bold">{{ authStore.user?.location || '-' }}</p>
          </div>
          <div>
            <p class="text-silver-70">{{ t('settings.sections.accountInfo.created') }}</p>
            <p class="text-silver font-bold">
              {{ authStore.user?.createdAt.toLocaleDateString() }}
            </p>
          </div>
        </div>
      </div>

      <!-- Logout -->
      <div class="flex">
        <BaseButton
            variant="danger"
            @click="handleLogout"
            class="w-full"
        >
          {{ t('settings.logout') }}
        </BaseButton>
      </div>
    </div>
  </AppContainer>
</template>