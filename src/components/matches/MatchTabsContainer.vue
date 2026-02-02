<template>
  <div class="w-full">
    <!-- Tabs Navigation -->
    <div class="flex gap-sm md:gap-md mb-lg md:mb-xl border-b border-silver-20 overflow-x-auto">
      <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="handleTabChange(tab.id)"
          :class="[
          'pb-md border-b-2 transition-fast whitespace-nowrap font-bold text-small md:text-body flex items-center gap-sm',
          modelValue === tab.id
            ? 'border-neon text-neon'
            : 'border-transparent text-silver-70 hover:text-silver'
        ]"
      >
        <span>{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
        <span v-if="tab.count > 0" class="text-tiny bg-neon text-primary px-sm py-xs font-bold rounded-sm">
          {{ tab.count }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
type TabId = 'new' | 'saved' | 'deleted'

interface Tab {
  id: TabId
  label: string
  icon: string
  count: number
}

interface Props {
  tabs: Tab[]
  modelValue?: TabId
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 'new'
})

const emit = defineEmits<{
  'tab-change': [tabId: TabId]
  'update:modelValue': [tabId: TabId]
}>()

const handleTabChange = (tabId: TabId) => {
  emit('tab-change', tabId)
  emit('update:modelValue', tabId)
}
</script>

<style scoped>
/* All styles in global style.css */
</style>