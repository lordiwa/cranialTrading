<script setup lang="ts">
import { useI18n, type SupportedLocale } from '../../composables/useI18n'

const { t, locale, setLocale } = useI18n()

const languages = [
  { code: 'es' as SupportedLocale, label: 'ES', name: 'Español' },
  { code: 'en' as SupportedLocale, label: 'EN', name: 'English' },
]

const handleLanguageChange = (code: SupportedLocale) => {
  setLocale(code)
}
</script>

<template>
  <footer class="fixed bottom-0 left-0 right-0 z-40 bg-primary/95 backdrop-blur-sm border-t border-silver-20">
    <div class="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
      <!-- Copyright -->
      <p class="text-tiny text-silver-50">
        © 2024 Cranial Trading
      </p>

      <!-- Language Selector -->
      <div class="flex items-center gap-2">
        <span class="text-tiny text-silver-50 hidden sm:inline">{{ t('footer.language') }}:</span>
        <div class="flex items-center gap-1">
          <button
            v-for="lang in languages"
            :key="lang.code"
            @click="handleLanguageChange(lang.code)"
            :title="lang.name"
            :class="[
              'px-2 py-1 text-tiny font-bold rounded transition-colors',
              locale === lang.code
                ? 'bg-neon text-primary'
                : 'text-silver-50 hover:text-neon hover:bg-silver-5'
            ]"
          >
            {{ lang.label }}
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>
