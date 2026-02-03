<script setup lang="ts">
import { type Preference } from '../../types/preferences';
import PreferenceCard from './PreferenceCard.vue';

defineProps<{
  preferences: Preference[];
}>();

const emit = defineEmits<{
  edit: [preference: Preference];
  delete: [prefId: string];
}>();
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
    <PreferenceCard
        v-for="preference in preferences"
        :key="preference.id"
        :preference="preference"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
    />
  </div>
</template>