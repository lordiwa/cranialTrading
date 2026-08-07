<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'filled';
  size?: 'normal' | 'small';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'normal',
  disabled: false,
  type: 'button',
});

// v2 convergence (design→app): the shared kit was still on the pre-v2 vocabulary
// while the shell, landing and header had already moved. Recipe is the prototype's
// .btn/.btn-* in cranial-design/prototype/_shell-reference.html:75-86 — 1px borders
// (not 2px), rounded-md, uppercase + .1em tracking, and the ease-v2 hover ramp with
// the neon glow instead of brightness filters.
//
// Deliberate deviation from the prototype: .btn-sm there is 34px tall, but every
// button in this app is a 44px touch target and E2E/a11y lean on that, so `small`
// keeps min-h-[44px] and only drops padding and type size.
const baseClasses =
    'font-bold uppercase tracking-[.1em] cursor-pointer min-h-[44px] inline-flex items-center justify-center gap-2 rounded-md transition-all duration-200 ease-v2';

const sizeClasses = {
  normal: 'px-lg py-md text-[12px]',
  small: 'px-3 py-2.5 text-[11px]',
};

const variantClasses = computed(() => ({
  primary: props.disabled
      ? 'border border-silver-50 text-silver-50 cursor-not-allowed'
      : 'border border-neon text-neon hover:bg-neon-10 hover:shadow-glow-neon active:bg-neon-10',
  secondary: props.disabled
      ? 'border border-silver-50 text-silver-50 cursor-not-allowed'
      : 'border border-line-strong text-silver-70 hover:border-silver-30 hover:text-silver hover:bg-surface-1',
  danger: props.disabled
      ? 'border border-silver-50 text-silver-50 cursor-not-allowed'
      : 'border border-rust text-rust hover:bg-rust-10',
  filled: props.disabled
      ? 'bg-silver-50 text-primary cursor-not-allowed'
      : 'bg-neon text-primary hover:bg-[#6FD07C] hover:shadow-glow-neon',
}));
</script>

<template>
  <button
      :type="type"
      :class="[baseClasses, sizeClasses[size], variantClasses[variant]]"
      :disabled="disabled"
  >
    <slot />
  </button>
</template>
