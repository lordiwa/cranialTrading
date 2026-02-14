<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()
</script>

<template>
  <footer class="border-t border-silver-20 bg-primary">
    <div class="max-w-7xl mx-auto px-4 py-4">
      <div class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <p class="text-tiny text-silver-50">
          © 2024 Cranial Trading
        </p>
        <nav class="flex items-center gap-1 text-tiny" aria-label="Legal links">
          <span class="text-silver-30 hidden sm:inline">|</span>
          <router-link to="/terms" class="text-silver-50 hover:text-silver hover:underline transition-fast px-1">
            {{ t('legal.footer.terms') }}
          </router-link>
          <span class="text-silver-30">·</span>
          <router-link to="/privacy" class="text-silver-50 hover:text-silver hover:underline transition-fast px-1">
            {{ t('legal.footer.privacy') }}
          </router-link>
          <span class="text-silver-30">·</span>
          <router-link to="/cookies" class="text-silver-50 hover:text-silver hover:underline transition-fast px-1">
            {{ t('legal.footer.cookies') }}
          </router-link>
          <span class="text-silver-30">·</span>
          <router-link to="/faq" class="text-neon hover:text-neon/80 font-bold underline underline-offset-2 transition-fast px-1">
            {{ t('legal.footer.faq') }}
          </router-link>
        </nav>
      </div>
    </div>
  </footer>
</template>
