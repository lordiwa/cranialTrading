<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  createdAt?: Date;
  lifeExpiresAt?: Date;
  isNew?: boolean;
}>();

const daysRemaining = computed(() => {
  if (!props.lifeExpiresAt) return 15;

  const now = new Date();
  const expiresAt = props.lifeExpiresAt instanceof Date
      ? props.lifeExpiresAt
      : new Date(props.lifeExpiresAt);

  const diffTime = expiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
});

const totalDays = 15;

const daysUsed = computed(() => totalDays - daysRemaining.value);

const isExpiringSoon = computed(() => daysRemaining.value <= 3);

const badgeColor = computed(() => {
  if (isExpiringSoon.value) return 'text-rust border-rust';
  return 'text-neon border-neon';
});

const progressPercent = computed(() => {
  return (daysUsed.value / totalDays) * 100;
});
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Indicador "NUEVO" -->
    <span v-if="isNew" class="inline-block px-2 py-1 text-tiny font-bold border border-neon text-neon bg-neon-5">
      NUEVO
    </span>

    <!-- Countdown -->
    <div class="flex items-center gap-1">
      <div class="w-12 h-6 bg-primary-dark border" :class="badgeColor">
        <div class="text-tiny font-bold text-center leading-6" :class="badgeColor">
          {{ daysRemaining }}/{{ totalDays }}
        </div>
      </div>
      <span class="text-tiny text-silver-70">días</span>
    </div>

    <!-- Progress bar -->
    <div class="w-16 h-1 bg-silver-20">
      <div
          class="h-full transition-all duration-300"
          :class="isExpiringSoon ? 'bg-rust' : 'bg-neon'"
          :style="{ width: `${progressPercent}%` }"
      ></div>
    </div>
  </div>
</template>