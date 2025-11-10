<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import PreferenceList from '../components/preferences/PreferenceList.vue';
import NewPreferenceModal from '../components/preferences/NewPreferenceModal.vue';
import ImportPreferencesModal from '../components/preferences/ImportPreferencesModal.vue';
import ImportProgressToast from '../components/collection/ImportProgressToast.vue';
import ImportResultModal from '../components/collection/ImportResultModal.vue';
import { usePreferencesStore } from '../stores/preferences';
import { Preference } from '../types/preferences';
import { CardCondition } from '../types/card';

const preferencesStore = usePreferencesStore();
const showNewModal = ref(false);
const showImportModal = ref(false);
const showProgressToast = ref(false);
const showResultModal = ref(false);

// Import state
const importProgress = ref({ current: 0, total: 0 });
const importResult = ref({
  success: 0,
  failed: 0,
  total: 0,
  errors: [] as string[],
  processedPreferences: [] as any[]
});

onMounted(() => {
  preferencesStore.loadPreferences();
});

const handleAdd = (prefData: any) => {
  preferencesStore.addPreference(prefData);
  showNewModal.value = false;
};

const handleEdit = (preference: Preference) => {
  // edit preference handler (UI to implement)
};

const handleDelete = async (prefId: string) => {
  if (confirm('¿Eliminar esta preferencia?')) {
    await preferencesStore.deletePreference(prefId);
  }
};

const handleImport = async (
    deckText: string,
    condition: CardCondition,
    includeSideboard: boolean
) => {
  showImportModal.value = false;
  showProgressToast.value = true;
  importProgress.value = { current: 0, total: 0 };

  const result = await preferencesStore.processDeckImport(
      deckText,
      condition,
      includeSideboard,
      (current, total) => {
        importProgress.value = { current, total };
      }
  );

  showProgressToast.value = false;

  importResult.value = {
    ...result,
    total: result.success + result.failed,
    processedPreferences: result.processedPreferences
  };

  if (result.failed === 0 && result.success > 0) {
    await preferencesStore.confirmImport(result.processedPreferences);
    return;
  }

  if (result.failed > 0) {
    showResultModal.value = true;
  }
};

const handleImportDirect = async (
    cards: any[],
    condition: CardCondition
) => {
  showImportModal.value = false;
  showProgressToast.value = true;
  importProgress.value = { current: 0, total: 0 };

  const result = await preferencesStore.processDirectImport(
      cards,
      condition,
      (current, total) => {
        importProgress.value = { current, total };
      }
  );

  showProgressToast.value = false;

  importResult.value = {
    ...result,
    total: result.success + result.failed,
    processedPreferences: result.processedPreferences
  };

  if (result.failed === 0 && result.success > 0) {
    await preferencesStore.confirmImport(result.processedPreferences);
    return;
  }

  if (result.failed > 0) {
    showResultModal.value = true;
  }
};

const handleConfirmImport = async () => {
  const success = await preferencesStore.confirmImport(importResult.value.processedPreferences);
  if (success) {
    showResultModal.value = false;
    importResult.value = {
      success: 0,
      failed: 0,
      total: 0,
      errors: [],
      processedPreferences: []
    };
  }
};

const handleCancelImport = () => {
  showResultModal.value = false;
  importResult.value = {
    success: 0,
    failed: 0,
    total: 0,
    errors: [],
    processedPreferences: []
  };
};
</script>

<template>
  <AppContainer>
    <div>
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver">BUSCO</h1>
          <p class="text-tiny md:text-small text-silver-70 mt-1">
            {{ preferencesStore.preferences.length }} activas
          </p>
        </div>
        <div class="flex flex-col md:flex-row gap-2 md:gap-3">
          <BaseButton variant="secondary" size="small" @click="showImportModal = true" class="w-full md:w-auto">
            IMPORTAR
          </BaseButton>
          <BaseButton size="small" @click="showNewModal = true" class="w-full md:w-auto">
            + NUEVA
          </BaseButton>
        </div>
      </div>

      <BaseLoader v-if="preferencesStore.loading" size="large" />

      <div v-else-if="preferencesStore.preferences.length === 0" class="border border-silver-30 p-6 md:p-8 text-center">
        <p class="text-small md:text-body text-silver-70">
          No tienes preferencias configuradas.
        </p>
        <p class="text-tiny md:text-small text-silver-50 mt-2">
          Establece qué cartas buscas o importa un mazo completo.
        </p>
      </div>

      <PreferenceList
          v-else
          :preferences="preferencesStore.preferences"
          @edit="handleEdit"
          @delete="handleDelete"
      />

      <!-- Modals -->
      <NewPreferenceModal
          :show="showNewModal"
          @close="showNewModal = false"
          @add="handleAdd"
      />

      <ImportPreferencesModal
          :show="showImportModal"
          @close="showImportModal = false"
          @import="handleImport"
          @import-direct="handleImportDirect"
      />

      <ImportResultModal
          :show="showResultModal"
          :success="importResult.success"
          :failed="importResult.failed"
          :total="importResult.total"
          :errors="importResult.errors"
          @confirm="handleConfirmImport"
          @cancel="handleCancelImport"
      />

      <!-- Progress Toast -->
      <ImportProgressToast
          v-if="showProgressToast"
          :current="importProgress.current"
          :total="importProgress.total"
          :processing="true"
      />
    </div>
  </AppContainer>
</template>