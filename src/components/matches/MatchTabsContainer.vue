<script setup lang="ts">
import { ref } from 'vue';

interface Tab {
  id: 'new' | 'saved' | 'deleted';
  label: string;
  icon: string;
  count: number;
}

const props = defineProps<{
  tabs: Tab[];
}>();

const emit = defineEmits<{
  'tab-change': [tabId: 'new' | 'saved' | 'deleted'];
}>();

const activeTab = ref<'new' | 'saved' | 'deleted'>('new');

const handleTabClick = (tabId: 'new' | 'saved' | 'deleted') => {
  activeTab.value = tabId;
  emit('tab-change', tabId);
};
</script>

<template>
  <div class="border-b border-silver-20 mb-6">
    <div class="flex gap-1 md:gap-2">
      <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="handleTabClick(tab.id)"
          :class="[
            'px-4 md:px-6 py-3 text-small font-bold transition-fast border-b-2 whitespace-nowrap',
            activeTab === tab.id
              ? 'border-b-neon text-neon'
              : 'border-b-transparent text-silver-70 hover:text-silver'
          ]"
      >
        <span class="mr-2">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
        <span class="ml-2 inline-block px-2 py-1 text-tiny font-bold" :class="[
          activeTab === tab.id ? 'bg-neon-10 text-neon' : 'bg-silver-10 text-silver-50'
        ]">
          {{ tab.count }}
        </span>
      </button>
    </div>
  </div>
</template>