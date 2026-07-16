<script setup lang="ts">
import BaseButton from '../components/ui/BaseButton.vue';
import { useI18n } from '../composables/useI18n';

const { t } = useI18n();
</script>

<template>
  <main id="main-content" class="min-h-screen flex flex-col items-center justify-center text-center px-6">
    <div class="rise flex flex-col items-center">
      <p class="font-display text-[11px] font-bold tracking-[.18em] uppercase text-neon mb-3">Error {{ t('notFound.title') }}</p>
      <p class="font-display text-[64px] md:text-[96px] font-bold text-rust leading-none tracking-tight">{{ t('notFound.title') }}</p>
      <h1 class="font-display text-h2 font-bold text-silver mt-5">{{ t('notFound.heading') }}</h1>
      <p class="text-body text-silver-50 mt-3 max-w-md">
        {{ t('notFound.message') }}
      </p>

      <RouterLink to="/" class="mt-7">
        <BaseButton variant="filled">
          {{ t('notFound.backHome') }}
        </BaseButton>
      </RouterLink>
    </div>
  </main>
</template>
