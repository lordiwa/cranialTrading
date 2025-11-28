<script setup lang="ts">
interface Props {
  modelValue: string | number;
  type?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  error: '',
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};
</script>

<template>
  <div class="w-full">
    <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="handleInput"
        :class="[
        'input-base',  // NEW: Use the global utility class!
        error ? 'error' : 'border-silver focus:border-2 focus:border-neon',  // CLEANER
        type === 'number' ? 'no-spinner' : '',
      ]"
    />
    <p v-if="error" class="mt-1 text-tiny md:text-small text-rust">{{ error }}</p>
  </div>
</template>