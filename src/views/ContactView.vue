<script setup lang="ts">
import { useSeoMeta } from '@unhead/vue'
import { useI18n } from '../composables/useI18n'
import SvgIcon from '../components/ui/SvgIcon.vue'

const { t } = useI18n()

useSeoMeta({
  ogTitle: t('seo.pages.contact.title') + ' | Cranial Trading',
  ogDescription: t('seo.pages.contact.description'),
  ogType: 'website',
  ogUrl: 'https://cranialtrading.com/contact',
  ogSiteName: 'Cranial Trading',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <div class="min-h-screen">
    <!-- Header -->
    <header class="border-b border-silver-20 py-6">
      <div class="max-w-4xl mx-auto px-6">
        <RouterLink to="/login" class="flex items-center gap-3 w-fit">
          <svg class="w-10 h-10 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="text-h3 font-bold text-neon font-brother">CRANIAL TRADING</span>
        </RouterLink>
      </div>
    </header>

    <!-- Content -->
    <main class="max-w-4xl mx-auto px-6 py-12">
      <h1 class="text-h1 font-bold text-silver mb-2">{{ t('contact.title') }}</h1>
      <p class="text-body text-silver-70 mb-10">{{ t('contact.subtitle') }}</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Email -->
        <div class="bg-secondary/30 border border-silver-30 p-6 rounded-md">
          <div class="w-12 h-12 bg-neon-10 rounded-full flex items-center justify-center mb-4">
            <SvgIcon name="chat" size="small" class="text-neon" />
          </div>
          <h2 class="text-body font-bold text-silver mb-2">{{ t('contact.email.title') }}</h2>
          <p class="text-small text-silver-70 mb-4">{{ t('contact.email.description') }}</p>
          <a
            href="mailto:support@cranialtrading.com"
            class="inline-flex items-center gap-2 text-neon hover:underline text-small font-bold"
          >
            support@cranialtrading.com
          </a>
        </div>

        <!-- Social -->
        <div class="bg-secondary/30 border border-silver-30 p-6 rounded-md">
          <div class="w-12 h-12 bg-neon-10 rounded-full flex items-center justify-center mb-4">
            <SvgIcon name="user" size="small" class="text-neon" />
          </div>
          <h2 class="text-body font-bold text-silver mb-2">{{ t('contact.social.title') }}</h2>
          <p class="text-small text-silver-70 mb-4">{{ t('contact.social.description') }}</p>
          <ul class="space-y-3">
            <li>
              <a
                href="https://discord.gg/cranialtrading"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 text-neon hover:underline text-small font-bold"
              >
                Discord
              </a>
            </li>
            <li>
              <a
                href="https://instagram.com/cranialtrading"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 text-neon hover:underline text-small font-bold"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- FAQ callout -->
      <div class="mt-10 p-6 border border-silver-30 rounded-md text-center">
        <p class="text-body text-silver-70 mb-3">{{ t('contact.faqCallout') }}</p>
        <RouterLink to="/faq" class="text-neon hover:underline text-small font-bold">
          {{ t('contact.faqLink') }}
        </RouterLink>
      </div>

      <!-- Back link -->
      <div class="mt-12 pt-8 border-t border-silver-20">
        <RouterLink to="/login" class="text-small text-neon hover:underline">
          {{ t('legal.backToHome') }}
        </RouterLink>
      </div>
    </main>

    <!-- Simple Footer -->
    <footer class="border-t border-silver-20 py-6">
      <div class="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-tiny text-silver-50">{{ t('legal.footer.copyright') }}</p>
        <nav class="flex gap-4 text-tiny" aria-label="Legal links">
          <RouterLink to="/terms" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.terms') }}</RouterLink>
          <RouterLink to="/privacy" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.privacy') }}</RouterLink>
          <RouterLink to="/cookies" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.cookies') }}</RouterLink>
          <span class="text-silver-30">|</span>
          <RouterLink to="/faq" class="text-neon font-bold underline underline-offset-2 hover:text-neon/80 transition-fast">{{ t('legal.footer.faq') }}</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
