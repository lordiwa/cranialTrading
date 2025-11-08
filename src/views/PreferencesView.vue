<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import PreferenceList from '../components/preferences/PreferenceList.vue';
import NewPreferenceModal from '../components/preferences/NewPreferenceModal.vue';
import { usePreferencesStore } from '../stores/preferences';
import { Preference } from '../types/preferences';

const preferencesStore = usePreferencesStore();
const showNewModal = ref(false);

onMounted(() => {
  preferencesStore.loadPreferences();
});

const handleAdd = (prefData: any) => {
  preferencesStore.addPreference(prefData);
  showNewModal.value = false;
};

const handleEdit = (preference: Preference) => {
  console.log('Edit preference:', preference);
};

const handleDelete = async (prefId: string) => {
  if (confirm('¿Eliminar esta preferencia?')) {
    await preferencesStore.deletePreference(prefId);
  }
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
        <BaseButton size="small" @click="showNewModal = true" class="w-full md:w-auto">
          + NUEVA
        </BaseButton>
      </div>

      <BaseLoader v-if="preferencesStore.loading" size="large" />

      <div v-else-if="preferencesStore.preferences.length === 0" class="border border-silver-30 p-6 md:p-8 text-center">
        <p class="text-small md:text-body text-silver-70">
          No tienes preferencias configuradas.
        </p>
        <p class="text-tiny md:text-small text-silver-50 mt-2">
          Establece qué cartas buscas, cambias o vendes.
        </p>
      </div>

      <PreferenceList
          v-else
          :preferences="preferencesStore.preferences"
          @edit="handleEdit"
          @delete="handleDelete"
      />

      <NewPreferenceModal
          :show="showNewModal"
          @close="showNewModal = false"
          @add="handleAdd"
      />
    </div>
  </AppContainer>
</template>