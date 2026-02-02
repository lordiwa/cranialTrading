<script setup lang="ts">
import AppContainer from '../components/layout/AppContainer.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import { useI18n } from '../composables/useI18n';

const { t } = useI18n();
</script>

<template>
  <AppContainer>
    <div class="flex flex-col items-center justify-center min-h-screen text-center">
      <div class="mb-8">
        <h1 class="text-h1 font-bold text-rust mb-4">{{ t('notFound.title') }}</h1>
        <h2 class="text-h2 font-bold text-silver mb-4">{{ t('notFound.userNotFound') }}</h2>
        <p class="text-body text-silver-70 max-w-md">
          {{ t('notFound.message') }}
        </p>
      </div>

      <div class="flex flex-col md:flex-row gap-4">
        <RouterLink to="/dashboard" class="flex-1">
          <BaseButton class="w-full">
            {{ t('notFound.backToDashboard') }}
          </BaseButton>
        </RouterLink>
        <RouterLink to="/collection" class="flex-1">
          <BaseButton variant="secondary" class="w-full">
            {{ t('notFound.viewCollection') }}
          </BaseButton>
        </RouterLink>
      </div>

      <div class="mt-8 border-t border-silver-20 pt-8 max-w-md">
        <p class="text-small text-silver-70 mb-4">
          {{ t('notFound.needHelp') }}
        </p>
        <RouterLink to="/settings" class="text-neon text-small hover:underline">
          {{ t('notFound.contactUs') }}
        </RouterLink>
      </div>
    </div>
  </AppContainer>
</template>