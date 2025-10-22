<script setup lang="ts">
interface Props {
  variant?: 'busco' | 'cambio' | 'vendo' | 'success';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'busco',
});

const variantClasses = {
  busco: 'border border-neon text-neon',
  cambio: 'border border-silver text-silver',
  vendo: 'border border-rust text-rust',
  success: 'border border-neon bg-neon-5 text-neon',
};
</script>

<template>
  <span
      :class="[
      'inline-block px-2 py-1 text-tiny font-medium',
      variantClasses[variant],
    ]"
  >
    <slot />
  </span>
</template>