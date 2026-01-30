<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useConfirmStore } from '../stores/confirm';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';

const router = useRouter();
const authStore = useAuthStore();
const confirmStore = useConfirmStore();

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
    title: 'Cerrar sesión',
    message: '¿Estás seguro que deseas cerrar sesión?',
    confirmText: 'CERRAR SESIÓN',
    cancelText: 'CANCELAR',
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
      <h1 class="text-h2 md:text-h1 font-bold text-silver mb-8">CONFIGURACIÓN</h1>

      <!-- Email verification -->
      <div class="bg-primary border border-silver-30 p-6 md:p-8 mb-6">
        <h2 class="text-body font-bold text-silver mb-4">VERIFICACIÓN DE EMAIL</h2>

        <div class="mb-4">
          <p class="text-small text-silver-70">
            Email: <span class="text-neon font-bold">{{ authStore.user?.email }}</span>
          </p>
          <div class="flex items-center gap-3 mt-2">
            <div :class="[
              'w-3 h-3 rounded-full',
              emailVerified ? 'bg-neon' : 'bg-rust'
            ]"></div>
            <span class="text-small" :class="emailVerified ? 'text-neon' : 'text-rust'">
              {{ emailVerified ? 'Verificado' : 'No verificado' }}
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
            {{ checkingEmail ? 'ENVIANDO...' : 'ENVIAR EMAIL' }}
          </BaseButton>
          <BaseButton
              variant="secondary"
              size="small"
              @click="handleCheckEmailVerification"
              :disabled="checkingEmail"
              class="flex-1"
          >
            {{ checkingEmail ? 'VERIFICANDO...' : 'VERIFICAR ESTADO' }}
          </BaseButton>
        </div>
      </div>

      <!-- Change password -->
      <div class="bg-primary border border-silver-30 p-6 md:p-8 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-body font-bold text-silver">CAMBIAR CONTRASEÑA</h2>
          <BaseButton
              v-if="!showChangeForm"
              variant="secondary"
              size="small"
              @click="showChangeForm = true"
          >
            CAMBIAR
          </BaseButton>
        </div>

        <div v-if="showChangeForm" class="space-y-md">
          <BaseInput
              v-model="currentPassword"
              type="password"
              placeholder="Contraseña actual"
          />

          <BaseInput
              v-model="newPassword"
              type="password"
              placeholder="Nueva contraseña"
          />

          <BaseInput
              v-model="confirmPassword"
              type="password"
              placeholder="Confirmar contraseña"
          />

          <div v-if="newPassword && confirmPassword && newPassword !== confirmPassword" class="text-tiny text-rust">
            Las contraseñas no coinciden
          </div>

          <div class="flex gap-2">
            <BaseButton
                variant="secondary"
                size="small"
                @click="showChangeForm = false"
                class="flex-1"
            >
              CANCELAR
            </BaseButton>
            <BaseButton
                size="small"
                @click="handleChangePassword"
                :disabled="loadingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword"
                class="flex-1"
            >
              {{ loadingPassword ? 'GUARDANDO...' : 'GUARDAR' }}
            </BaseButton>
          </div>
        </div>

        <p v-if="!showChangeForm" class="text-small text-silver-70">
          Mantén tu contraseña segura y única.
        </p>
      </div>

      <!-- User info -->
      <div class="bg-primary border border-silver-30 p-6 md:p-8 mb-6">
        <h2 class="text-body font-bold text-silver mb-4">INFORMACIÓN DE CUENTA</h2>

        <div class="space-y-sm text-small">
          <div>
            <p class="text-silver-70">Username</p>
            <p class="text-silver font-bold">{{ authStore.user?.username }}</p>
          </div>
          <div>
            <p class="text-silver-70">Ubicación</p>
            <p class="text-silver font-bold">{{ authStore.user?.location || '-' }}</p>
          </div>
          <div>
            <p class="text-silver-70">Cuenta creada</p>
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
          CERRAR SESIÓN
        </BaseButton>
      </div>
    </div>
  </AppContainer>
</template>