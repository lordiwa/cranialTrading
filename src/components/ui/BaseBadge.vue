<script setup lang="ts">
interface Props {
  variant?: 'busco' | 'cambio' | 'vendo' | 'success' | 'solo' | 'deseado';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'busco',
});

const variantClasses = {
  busco: 'border border-neon text-neon',
  cambio: 'border border-silver text-silver',
  vendo: 'border border-rust text-rust',
  success: 'border border-neon bg-neon-5 text-neon',
  solo: 'border border-silver text-silver-70',
  deseado: 'border border-amber bg-amber-5 text-amber',
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

<style scoped>
.bg-amber-5 {
  background-color: rgba(245, 158, 11, 0.05);
}
.bg-neon-5 {
  background-color: rgba(0, 255, 136, 0.05);
}
</style>
