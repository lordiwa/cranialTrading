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
        'w-full bg-primary border px-3 md:px-4 py-3 min-h-[44px] text-small md:text-body text-silver placeholder:text-silver-50 transition-fast focus:outline-none',
        error ? 'border-2 border-rust' : 'border-silver focus:border-2 focus:border-neon',
        type === 'number' ? 'no-spinner' : '',
      ]"
    />
    <p v-if="error" class="mt-1 text-tiny md:text-small text-rust">{{ error }}</p>
  </div>
</template>