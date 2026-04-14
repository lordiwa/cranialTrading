<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../composables/useI18n'

interface Props {
  modelValue: string | number;
  type?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  clearable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  error: '',
  disabled: false,
  required: false,
  id: undefined,
  clearable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();

const { t } = useI18n()

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};

const handleClear = () => {
  emit('update:modelValue', '');
};

const showClearButton = computed(() => {
  return props.clearable && props.modelValue && String(props.modelValue).length > 0;
});
</script>

<template>
  <div class="w-full relative">
    <input
        :id="id"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        @input="handleInput"
        :class="[
        'input-base', // NEW: Use the global utility class!
        error ? 'error' : 'border-silver-10 focus:border-2 focus:border-neon',
        type === 'number' ? 'no-spinner' : '',
        clearable ? 'pr-10' : '',
      ]"
    />
    <!-- Clear button -->
    <button
        v-if="showClearButton"
        @click="handleClear"
        class="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20"
        type="button"
        :aria-label="t('common.aria.clearInput')"
    >
      ✕
    </button>
    <p v-if="error" class="mt-1 text-tiny md:text-small text-rust">{{ error }}</p>
  </div>
</template>