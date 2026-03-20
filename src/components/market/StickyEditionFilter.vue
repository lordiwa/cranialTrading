<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseInput from '../ui/BaseInput.vue'
import { useI18n } from '../../composables/useI18n'

const props = defineProps<{
  modelValue: string
  editions: string[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()

const query = ref('')
const showDropdown = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const filteredEditions = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return props.editions
  return props.editions.filter(e => e.toLowerCase().includes(q))
})

function selectEdition(edition: string) {
  emit('update:modelValue', edition)
  query.value = edition
  showDropdown.value = false
}

function clearEdition() {
  emit('update:modelValue', '')
  query.value = ''
}

function handleInput(val: string | number) {
  query.value = String(val)
  showDropdown.value = !!String(val)
  if (!String(val)) {
    emit('update:modelValue', '')
  }
}

function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    showDropdown.value = false
  }
}

// Sync query text when modelValue changes externally
watch(() => props.modelValue, (val) => {
  query.value = val
}, { immediate: true })

onMounted(() => { document.addEventListener('click', handleClickOutside) })
onUnmounted(() => { document.removeEventListener('click', handleClickOutside) })
</script>

<template>
  <div ref="containerRef" class="w-48 relative" @focusin="showDropdown = true">
    <label class="text-tiny text-silver-50 mb-1 flex items-center gap-1">
      {{ t('market.setFilter.label') }}
      <span v-if="modelValue" class="text-neon text-tiny" :title="t('market.editionFilter.locked')">&#128274;</span>
    </label>
    <BaseInput
        :model-value="query"
        @update:model-value="handleInput"
        :placeholder="placeholder || t('market.setFilter.all')"
        :clearable="true"
    />
    <div
        v-if="showDropdown && filteredEditions.length"
        class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
    >
      <div
          @mousedown.prevent="clearEdition"
          class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small border-b border-silver-10 transition-all"
          :class="!modelValue ? 'text-neon' : 'text-silver'"
      >
        {{ t('market.setFilter.all') }}
      </div>
      <div
          v-for="edition in filteredEditions"
          :key="edition"
          @mousedown.prevent="selectEdition(edition)"
          class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small border-b border-silver-10 transition-all"
          :class="modelValue === edition ? 'text-neon' : 'text-silver'"
      >
        {{ edition }}
      </div>
    </div>
  </div>
</template>
