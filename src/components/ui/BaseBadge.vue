<script setup lang="ts">
type BadgeVariant = 'busco' | 'cambio' | 'vendo' | 'success' | 'solo' | 'deseado' | 'error' | 'info' | 'warning';

interface Props {
  variant?: BadgeVariant;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'busco',
});

const variantClasses: Record<BadgeVariant, string> = {
  busco: 'border border-neon text-neon',
  cambio: 'border border-silver text-silver',
  vendo: 'border border-rust text-rust',
  success: 'border border-neon bg-neon-5 text-neon',
  solo: 'border border-silver text-silver-70',
  deseado: 'border border-amber bg-amber-5 text-amber',
  error: 'border border-rust bg-rust-5 text-rust',
  info: 'border border-blue-400 bg-blue-5 text-blue-400',
  warning: 'border border-amber bg-amber-5 text-amber',
};
</script>

<template>
  <span
      :class="[
      'inline-block px-2 py-1 text-tiny font-medium rounded-sm',
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
.bg-rust-5 {
  background-color: rgba(139, 46, 31, 0.05);
}
.bg-blue-5 {
  background-color: rgba(96, 165, 250, 0.05);
}
</style>
