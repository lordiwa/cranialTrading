<script setup lang="ts">
interface Props {
  modelValue: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Seleccionar',
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
};
</script>

<template>
  <select
      :id="id"
      :value="modelValue"
      :disabled="disabled"
      @change="handleChange"
      class="w-full bg-primary border border-silver px-3 py-2.5 text-small text-silver transition-fast focus:outline-none focus:border-2 focus:border-neon cursor-pointer"
  >
    <option value="" disabled>{{ placeholder }}</option>
    <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
    >
      {{ option.label }}
    </option>
  </select>
</template>