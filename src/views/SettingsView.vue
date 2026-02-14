<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useConfirmStore } from '../stores/confirm';
import { useToastStore } from '../stores/toast';
import { useCollectionStore } from '../stores/collection';
import { useDecksStore } from '../stores/decks';
import { useMatchesStore } from '../stores/matches';
import { useContactsStore } from '../stores/contacts';
import { useI18n } from '../composables/useI18n';
import { useTour } from '../composables/useTour';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import HelpTooltip from '../components/ui/HelpTooltip.vue';
import SvgIcon from '../components/ui/SvgIcon.vue';

const router = useRouter();
const authStore = useAuthStore();
const confirmStore = useConfirmStore();
const toastStore = useToastStore();
const collectionStore = useCollectionStore();
const decksStore = useDecksStore();
const matchesStore = useMatchesStore();
const contactsStore = useContactsStore();
const { t } = useI18n();
const { startTour } = useTour();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loadingPassword = ref(false);
const showChangeForm = ref(false);

const emailVerified = ref(false);
const checkingEmail = ref(false);

// Username change
const showUsernameForm = ref(false);
const newUsername = ref('');
const changingUsername = ref(false);
const checkingUsername = ref(false);
const usernameAvailable = ref<boolean | null>(null);
const usernameSuggestions = ref<string[]>([]);

// Location change
const showLocationForm = ref(false);
const newLocation = ref('');
const changingLocation = ref(false);
const detectingLocation = ref(false);
const detectedLocation = ref<string | null>(null);
const locationSuggestions = ref<string[]>([]);
const searchingLocations = ref(false);
let locationSearchTimeout: ReturnType<typeof setTimeout> | null = null;

const handleLocationInput = () => {
  if (locationSearchTimeout) {
    clearTimeout(locationSearchTimeout);
  }

  locationSuggestions.value = [];

  if (newLocation.value.length >= 2) {
    locationSearchTimeout = setTimeout(() => {
      void (async () => {
        searchingLocations.value = true;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newLocation.value)}&limit=5&addressdetails=1`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await response.json();
          locationSuggestions.value = data.map((item: any) => {
            const city = item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || '';
            const state = item.address?.state || '';
            const country = item.address?.country || '';
            if (city && country) {
              return state ? `${city}, ${state}, ${country}` : `${city}, ${country}`;
            }
            return item.display_name.split(',').slice(0, 3).join(',').trim();
          }).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
        } catch (error) {
          console.error('Error searching locations:', error);
        }
        searchingLocations.value = false;
      })();
    }, 300);
  }
};

const selectLocationSuggestion = (suggestion: string) => {
  newLocation.value = suggestion;
  locationSuggestions.value = [];
};

// Avatar change
const showAvatarForm = ref(false);
const newAvatarUrl = ref('');
const changingAvatar = ref(false);
const avatarPreview = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);

const updateAvatarPreview = () => {
  if (newAvatarUrl.value.trim()) {
    avatarPreview.value = newAvatarUrl.value.trim();
    selectedFile.value = null; // Clear file if URL is entered
  } else {
    avatarPreview.value = authStore.getAvatarUrl(64);
  }
};

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) {
    const file = input.files[0];
    selectedFile.value = file;
    newAvatarUrl.value = ''; // Clear URL if file is selected

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

// Initialize avatar preview
avatarPreview.value = authStore.getAvatarUrl(64);

const usernameChangeStatus = computed(() => authStore.canChangeUsername());

const timeUntilUsernameChange = computed(() => {
  if (!usernameChangeStatus.value.nextChangeDate) return '';
  const diff = usernameChangeStatus.value.nextChangeDate.getTime() - Date.now();
  const minutes = Math.ceil(diff / (1000 * 60));
  if (minutes < 60) {
    return `${minutes} minutos`;
  }
  const hours = Math.ceil(diff / (1000 * 60 * 60));
  if (hours < 24) {
    return `${hours} horas`;
  }
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days} días`;
});

onMounted(() => {
  emailVerified.value = authStore.emailVerified;
});

// Check username availability with debounce
let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

const handleUsernameInput = () => {
  usernameAvailable.value = null;
  usernameSuggestions.value = [];

  if (usernameCheckTimeout) {
    clearTimeout(usernameCheckTimeout);
  }

  if (newUsername.value.length >= 3) {
    usernameCheckTimeout = setTimeout(() => {
      void (async () => {
        checkingUsername.value = true;
        const available = await authStore.checkUsernameAvailable(newUsername.value);
        usernameAvailable.value = available;

        if (!available) {
          usernameSuggestions.value = await authStore.generateUsernameSuggestions(newUsername.value);
        }
        checkingUsername.value = false;
      })();
    }, 500);
  }
};

const selectSuggestion = (suggestion: string) => {
  newUsername.value = suggestion;
  usernameAvailable.value = true;
  usernameSuggestions.value = [];
};

const handleChangeUsername = async () => {
  if (!newUsername.value || newUsername.value.length < 3) return;

  changingUsername.value = true;
  const result = await authStore.changeUsername(newUsername.value);
  changingUsername.value = false;

  if (result.success) {
    showUsernameForm.value = false;
    newUsername.value = '';
    usernameAvailable.value = null;
  } else if (result.suggestions) {
    usernameSuggestions.value = result.suggestions;
  }
};

const handleDetectLocation = async () => {
  detectingLocation.value = true;
  const location = await authStore.detectLocation();
  detectingLocation.value = false;

  if (location) {
    detectedLocation.value = location;
    newLocation.value = location;
  } else {
    toastStore.show(t('settings.changeLocation.detectError'), 'error');
  }
};

const handleChangeLocation = async () => {
  if (!newLocation.value.trim()) return;

  changingLocation.value = true;
  const success = await authStore.changeLocation(newLocation.value.trim());
  changingLocation.value = false;

  if (success) {
    showLocationForm.value = false;
    newLocation.value = '';
    detectedLocation.value = null;
  }
};

const openLocationForm = () => {
  showLocationForm.value = true;
  newLocation.value = authStore.user?.location || '';
};

const handleChangeAvatar = async () => {
  changingAvatar.value = true;
  let success = false;

  if (selectedFile.value) {
    // Upload file
    success = await authStore.uploadAvatar(selectedFile.value);
  } else {
    // Use URL (or null to reset)
    const url = newAvatarUrl.value.trim() || null;
    success = await authStore.changeAvatar(url);
  }

  changingAvatar.value = false;

  if (success) {
    showAvatarForm.value = false;
    newAvatarUrl.value = '';
    selectedFile.value = null;
    avatarPreview.value = authStore.getAvatarUrl(64);
  }
};

const handleResetAvatar = async () => {
  changingAvatar.value = true;
  const success = await authStore.changeAvatar(null);
  changingAvatar.value = false;

  if (success) {
    showAvatarForm.value = false;
    newAvatarUrl.value = '';
    selectedFile.value = null;
    avatarPreview.value = authStore.getAvatarUrl(64);
  }
};

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

// Delete all user data
const deletingData = ref(false);

const handleDeleteAllData = async () => {
  if (!authStore.user) return;

  const confirmed = await confirmStore.show({
    title: t('settings.dangerZone.deleteData.title'),
    message: t('settings.dangerZone.deleteData.message'),
    confirmText: t('settings.dangerZone.deleteData.confirm'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'danger'
  });

  if (!confirmed) return;

  deletingData.value = true;
  const progress = toastStore.showProgress(t('settings.dangerZone.deleteData.progress'), 0);

  try {
    // Step 1: Delete cards (30%)
    progress.update(10, 'Eliminando cartas...');
    await collectionStore.deleteAllCards();
    progress.update(30, 'Cartas eliminadas');

    // Step 2: Delete decks (50%)
    progress.update(40, 'Eliminando mazos...');
    await decksStore.deleteAllDecks();
    progress.update(50, 'Mazos eliminados');

    // Step 3: Delete matches (70%)
    progress.update(60, 'Eliminando matches...');
    await matchesStore.deleteAllMatches();
    progress.update(70, 'Matches eliminados');

    // Step 4: Delete contacts (90%)
    progress.update(80, 'Eliminando contactos...');
    await contactsStore.deleteAllContacts();
    progress.update(90, 'Contactos eliminados');

    // Complete
    progress.update(100, t('settings.dangerZone.deleteData.success'));
    setTimeout(() => { progress.dismiss(); }, 2000);

    toastStore.show(t('settings.dangerZone.deleteData.success'), 'success');
  } catch (error) {
    console.error('Error deleting data:', error);
    progress.dismiss();
    toastStore.show(t('settings.dangerZone.deleteData.error'), 'error');
  } finally {
    deletingData.value = false;
  }
};

const handleRestartTour = () => {
  localStorage.removeItem('cranial_tour_completed');
  router.push('/collection').then(() => {
    setTimeout(() => { startTour(); }, 500);
  });
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

        <div class="space-y-4 text-small">
          <!-- Avatar -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-silver-70 flex items-center gap-2">
                Avatar
                <HelpTooltip
                    :text="t('help.tooltips.settings.avatar')"
                    :title="t('help.titles.avatar')"
                />
              </p>
              <BaseButton
                  v-if="!showAvatarForm"
                  variant="secondary"
                  size="small"
                  @click="showAvatarForm = true"
              >
                {{ t('settings.changeAvatar.edit') }}
              </BaseButton>
            </div>

            <!-- Current avatar display -->
            <div v-if="!showAvatarForm" class="flex items-center gap-3">
              <img
                  :src="authStore.getAvatarUrl(64)"
                  alt="Avatar"
                  class="w-16 h-16 rounded-full bg-silver-10"
              />
              <p class="text-tiny text-silver-50">
                {{ authStore.user?.avatarUrl ? t('settings.changeAvatar.custom') : t('settings.changeAvatar.generated') }}
              </p>
            </div>

            <!-- Avatar change form -->
            <div v-if="showAvatarForm" class="mt-3 space-y-3">
              <div class="flex items-center gap-4">
                <div class="relative group">
                  <img
                      :src="avatarPreview"
                      alt="Avatar preview"
                      class="w-16 h-16 rounded-full bg-silver-10 object-cover"
                  />
                  <button
                      type="button"
                      @click="triggerFileInput"
                      class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span class="text-white text-tiny">📷</span>
                  </button>
                </div>
                <div class="flex-1 space-y-2">
                  <!-- File upload -->
                  <input
                      ref="fileInputRef"
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="handleFileSelect"
                  />
                  <BaseButton
                      variant="secondary"
                      size="small"
                      @click="triggerFileInput"
                      class="w-full"
                  >
                    {{ selectedFile ? selectedFile.name : t('settings.changeAvatar.upload') }}
                  </BaseButton>

                  <!-- Or use URL -->
                  <BaseInput
                      v-model="newAvatarUrl"
                      type="url"
                      :placeholder="t('settings.changeAvatar.placeholder')"
                      @input="updateAvatarPreview"
                      :disabled="!!selectedFile"
                  />
                </div>
              </div>

              <p class="text-tiny text-silver-50">
                {{ t('settings.changeAvatar.hint') }}
              </p>

              <div class="flex gap-2">
                <BaseButton
                    variant="secondary"
                    size="small"
                    @click="showAvatarForm = false; newAvatarUrl = ''; selectedFile = null"
                    class="flex-1"
                >
                  {{ t('common.actions.cancel') }}
                </BaseButton>
                <BaseButton
                    variant="secondary"
                    size="small"
                    @click="handleResetAvatar"
                    :disabled="changingAvatar"
                >
                  {{ t('settings.changeAvatar.reset') }}
                </BaseButton>
                <BaseButton
                    size="small"
                    @click="handleChangeAvatar"
                    :disabled="changingAvatar || (!selectedFile && !newAvatarUrl.trim())"
                    class="flex-1"
                >
                  {{ changingAvatar ? t('common.actions.saving') : t('common.actions.save') }}
                </BaseButton>
              </div>
            </div>
          </div>

          <!-- Username with change option -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-silver-70 flex items-center gap-2">
                {{ t('settings.sections.accountInfo.username') }}
                <HelpTooltip
                    :text="t('help.tooltips.settings.username')"
                    :title="t('help.titles.username')"
                />
              </p>
              <BaseButton
                  v-if="!showUsernameForm && usernameChangeStatus.allowed"
                  variant="secondary"
                  size="small"
                  @click="showUsernameForm = true"
              >
                {{ t('settings.changeUsername.button') }}
              </BaseButton>
            </div>

            <!-- Current username display -->
            <p v-if="!showUsernameForm" class="text-silver font-bold">@{{ authStore.user?.username }}</p>

            <!-- Rate limit warning -->
            <p v-if="!usernameChangeStatus.allowed && usernameChangeStatus.nextChangeDate" class="text-tiny text-silver-50 mt-1">
              {{ t('settings.changeUsername.nextChange', { time: timeUntilUsernameChange }) }}
            </p>

            <!-- Username change form -->
            <div v-if="showUsernameForm" class="mt-3 space-y-3">
              <div class="relative">
                <BaseInput
                    v-model="newUsername"
                    type="text"
                    :placeholder="t('settings.changeUsername.placeholder')"
                    @input="handleUsernameInput"
                    class="pr-10"
                />
                <!-- Status indicator -->
                <div class="absolute right-3 top-1/2 -translate-y-1/2">
                  <span v-if="checkingUsername" class="text-silver-50">...</span>
                  <span v-else-if="usernameAvailable === true" class="text-neon">✓</span>
                  <span v-else-if="usernameAvailable === false" class="text-rust">✗</span>
                </div>
              </div>

              <!-- Format hint -->
              <p class="text-tiny text-silver-50">
                {{ t('settings.changeUsername.formatHint') }}
              </p>

              <!-- Username taken - show suggestions -->
              <div v-if="usernameAvailable === false && usernameSuggestions.length > 0" class="bg-silver-5 border border-silver-20 p-3 rounded">
                <p class="text-tiny text-silver-70 mb-2">{{ t('settings.changeUsername.suggestions') }}</p>
                <div class="flex flex-wrap gap-2">
                  <button
                      v-for="suggestion in usernameSuggestions"
                      :key="suggestion"
                      @click="selectSuggestion(suggestion)"
                      class="px-3 py-1 text-tiny bg-primary border border-silver-30 text-silver hover:border-neon hover:text-neon rounded transition-colors"
                  >
                    @{{ suggestion }}
                  </button>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex gap-2">
                <BaseButton
                    variant="secondary"
                    size="small"
                    @click="showUsernameForm = false; newUsername = ''; usernameAvailable = null; usernameSuggestions = []"
                    class="flex-1"
                >
                  {{ t('common.actions.cancel') }}
                </BaseButton>
                <BaseButton
                    size="small"
                    @click="handleChangeUsername"
                    :disabled="changingUsername || !newUsername || newUsername.length < 3 || usernameAvailable === false"
                    class="flex-1"
                >
                  {{ changingUsername ? t('common.actions.saving') : t('common.actions.save') }}
                </BaseButton>
              </div>
            </div>
          </div>

          <!-- Location with change option -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-silver-70 flex items-center gap-2">
                {{ t('settings.sections.accountInfo.location') }}
                <HelpTooltip
                    :text="t('help.tooltips.settings.location')"
                    :title="t('help.titles.location')"
                />
              </p>
              <BaseButton
                  v-if="!showLocationForm"
                  variant="secondary"
                  size="small"
                  @click="openLocationForm"
              >
                {{ t('settings.changeLocation.button') }}
              </BaseButton>
            </div>

            <!-- Current location display -->
            <p v-if="!showLocationForm" class="text-silver font-bold">{{ authStore.user?.location || '-' }}</p>

            <!-- Location change form -->
            <div v-if="showLocationForm" class="mt-3 space-y-3">
              <div class="relative">
                <BaseInput
                    v-model="newLocation"
                    type="text"
                    :placeholder="t('settings.changeLocation.placeholder')"
                    @input="handleLocationInput"
                />
                <!-- Loading indicator -->
                <div v-if="searchingLocations" class="absolute right-3 top-1/2 -translate-y-1/2">
                  <span class="text-silver-50 text-tiny">...</span>
                </div>
                <!-- Suggestions dropdown -->
                <div
                    v-if="locationSuggestions.length > 0"
                    class="absolute z-10 w-full mt-1 bg-primary border border-silver-30 rounded shadow-lg max-h-48 overflow-auto"
                >
                  <button
                      v-for="suggestion in locationSuggestions"
                      :key="suggestion"
                      type="button"
                      @click="selectLocationSuggestion(suggestion)"
                      class="w-full px-3 py-2 text-left text-small text-silver hover:bg-silver-5 hover:text-neon transition-fast"
                  >
                    📍 {{ suggestion }}
                  </button>
                </div>
              </div>

              <!-- Detect location button -->
              <button
                  type="button"
                  @click="handleDetectLocation"
                  :disabled="detectingLocation"
                  class="text-tiny text-neon hover:text-neon-80 underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ detectingLocation ? t('settings.changeLocation.detecting') : t('settings.changeLocation.detect') }}
              </button>

              <!-- Detected location suggestion -->
              <div v-if="detectedLocation && detectedLocation !== newLocation" class="bg-silver-5 border border-silver-20 p-3 rounded">
                <p class="text-tiny text-silver-70 mb-2">{{ t('settings.changeLocation.detected') }}</p>
                <button
                    @click="newLocation = detectedLocation"
                    class="px-3 py-1 text-tiny bg-primary border border-silver-30 text-silver hover:border-neon hover:text-neon rounded transition-colors"
                >
                  {{ detectedLocation }}
                </button>
              </div>

              <!-- Actions -->
              <div class="flex gap-2">
                <BaseButton
                    variant="secondary"
                    size="small"
                    @click="showLocationForm = false; newLocation = ''; detectedLocation = null"
                    class="flex-1"
                >
                  {{ t('common.actions.cancel') }}
                </BaseButton>
                <BaseButton
                    size="small"
                    @click="handleChangeLocation"
                    :disabled="changingLocation || !newLocation.trim()"
                    class="flex-1"
                >
                  {{ changingLocation ? t('common.actions.saving') : t('common.actions.save') }}
                </BaseButton>
              </div>
            </div>
          </div>

          <!-- Created date -->
          <div>
            <p class="text-silver-70">{{ t('settings.sections.accountInfo.created') }}</p>
            <p class="text-silver font-bold">
              {{ authStore.user?.createdAt.toLocaleDateString() }}
            </p>
          </div>
        </div>
      </div>

      <!-- Restart Tour -->
      <div class="bg-primary border border-silver-30 p-6 md:p-8 mb-6 rounded-md">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-small font-bold text-silver">{{ t('settings.restartTour.label') }}</p>
            <p class="text-tiny text-silver-50">{{ t('settings.restartTour.hint') }}</p>
          </div>
          <BaseButton variant="secondary" size="small" @click="handleRestartTour">
            {{ t('settings.restartTour.button') }}
          </BaseButton>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="bg-primary border border-rust p-6 md:p-8 mb-6 rounded-md">
        <h2 class="text-body font-bold text-rust mb-2 flex items-center gap-2">
          <SvgIcon name="warning" size="small" />
          {{ t('settings.dangerZone.title') }}
        </h2>
        <p class="text-small text-silver-50 mb-4">
          {{ t('settings.dangerZone.description') }}
        </p>

        <div class="space-y-3">
          <!-- Delete all data -->
          <div class="flex items-center justify-between p-3 bg-rust-5 border border-rust-10 rounded">
            <div>
              <p class="text-small font-bold text-silver">{{ t('settings.dangerZone.deleteData.label') }}</p>
              <p class="text-tiny text-silver-50">{{ t('settings.dangerZone.deleteData.hint') }}</p>
            </div>
            <BaseButton
                variant="danger"
                size="small"
                @click="handleDeleteAllData"
                :disabled="deletingData"
            >
              {{ deletingData ? t('common.actions.deleting') : t('common.actions.delete') }}
            </BaseButton>
          </div>

          <!-- Logout -->
          <div class="flex items-center justify-between p-3 bg-silver-5 border border-silver-20 rounded">
            <div>
              <p class="text-small font-bold text-silver">{{ t('settings.dangerZone.logout.label') }}</p>
              <p class="text-tiny text-silver-50">{{ t('settings.dangerZone.logout.hint') }}</p>
            </div>
            <BaseButton
                variant="secondary"
                size="small"
                @click="handleLogout"
            >
              {{ t('settings.logout') }}
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </AppContainer>
</template>