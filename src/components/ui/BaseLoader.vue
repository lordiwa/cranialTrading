<script setup lang="ts">
interface Props {
  size?: 'small' | 'medium' | 'large';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
});

const sizeClasses = {
  small: 'w-6 h-6',
  medium: 'w-10 h-10',
  large: 'w-16 h-16',
};
</script>

<template>
  <div class="flex items-center justify-center">
    <div
        :class="[
        'animate-spin rounded-full border-2 border-silver-20 border-t-neon',
        sizeClasses[size],
      ]"
    ></div>
  </div>
</template>