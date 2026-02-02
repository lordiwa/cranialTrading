<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'normal' | 'small';
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'normal',
  disabled: false,
});

const baseClasses = 'font-bold transition-fast cursor-pointer min-h-[44px] flex items-center justify-center rounded';

const sizeClasses = {
  normal: 'px-lg md:px-lg py-md text-small md:text-body',  // CHANGE: px-md → px-lg, py-md → py-md
  small: 'px-md md:px-4 py-2.5 text-tiny md:text-small',  // CHANGE: px-3 → px-md
};

// No changes to variantClasses - neon is already #CCFF00!
const variantClasses = {
  primary: props.disabled
      ? 'border-2 border-silver-50 text-silver-50 cursor-not-allowed'
      : 'border-2 border-neon text-neon hover:bg-neon-10 active:bg-neon-10',
  secondary: props.disabled
      ? 'border border-silver-50 text-silver-50 cursor-not-allowed'
      : 'border border-silver text-silver hover:border-2 hover:bg-silver-5 active:bg-silver-10',
  danger: props.disabled
      ? 'border border-silver-50 text-silver-50 cursor-not-allowed'
      : 'border border-rust text-rust hover:border-2 hover:bg-rust-5 active:bg-rust-5',
};
</script>

<template>
  <button
      :class="[baseClasses, sizeClasses[size], variantClasses[variant]]"
      :disabled="disabled"
  >
    <slot />
  </button>
</template>