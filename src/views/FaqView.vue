<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'
import esLocale from '../locales/es.json'

const { t } = useI18n()

// Track which questions are expanded
const expandedQuestions = ref<Set<number>>(new Set())

// Get FAQ questions directly from locale (t() only returns strings)
const faqQuestions = esLocale.help.faq.questions as { q: string; a: string }[]

// Get guides from localization
const gettingStarted = {
  title: t('help.guides.gettingStarted.title'),
  steps: [
    { title: t('help.guides.gettingStarted.step1.title'), description: t('help.guides.gettingStarted.step1.description') },
    { title: t('help.guides.gettingStarted.step2.title'), description: t('help.guides.gettingStarted.step2.description') },
    { title: t('help.guides.gettingStarted.step3.title'), description: t('help.guides.gettingStarted.step3.description') },
    { title: t('help.guides.gettingStarted.step4.title'), description: t('help.guides.gettingStarted.step4.description') },
  ]
}

// Get safety tips directly from locale
const tradeSafetyTips = esLocale.help.guides.tradeSafety.tips

const toggleQuestion = (index: number) => {
  if (expandedQuestions.value.has(index)) {
    expandedQuestions.value.delete(index)
  } else {
    expandedQuestions.value.add(index)
  }
  // Force reactivity
  expandedQuestions.value = new Set(expandedQuestions.value)
}

const isExpanded = (index: number) => expandedQuestions.value.has(index)

// Expand all questions
const expandAll = () => {
  const allIndices = faqQuestions.map((_, i) => i)
  expandedQuestions.value = new Set(allIndices)
}

// Collapse all questions
const collapseAll = () => {
  expandedQuestions.value = new Set()
}
</script>

<template>
  <AppContainer>
    <div class="max-w-3xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-h1 font-bold text-silver mb-2">{{ t('help.faq.title') }}</h1>
        <p class="text-body text-silver-70">
          Todo lo que necesitas saber sobre Cranial Trading
        </p>
      </div>

      <!-- Getting Started Guide -->
      <section class="mb-10">
        <h2 class="text-h2 font-bold text-neon mb-4 flex items-center gap-2">
          <SvgIcon name="star" size="small" />
          {{ gettingStarted.title }}
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
              v-for="(step, index) in gettingStarted.steps"
              :key="index"
              class="bg-primary border border-silver-30 p-4 rounded-md hover:border-neon-40 transition-colors"
          >
            <h3 class="text-body font-bold text-silver mb-2">{{ step.title }}</h3>
            <p class="text-small text-silver-70">{{ step.description }}</p>
          </div>
        </div>
      </section>

      <!-- FAQ Section -->
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-h2 font-bold text-neon flex items-center gap-2">
            <SvgIcon name="chat" size="small" />
            Preguntas Frecuentes
          </h2>
          <div class="flex gap-2">
            <button
                @click="expandAll"
                class="text-tiny text-silver-50 hover:text-neon transition-colors px-2 py-1"
            >
              Expandir todo
            </button>
            <span class="text-silver-30">|</span>
            <button
                @click="collapseAll"
                class="text-tiny text-silver-50 hover:text-neon transition-colors px-2 py-1"
            >
              Colapsar todo
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <div
              v-for="(item, index) in faqQuestions"
              :key="index"
              class="border border-silver-30 rounded-md overflow-hidden"
          >
            <!-- Question Header -->
            <button
                @click="toggleQuestion(index)"
                class="w-full flex items-center justify-between p-4 text-left hover:bg-silver-5 transition-colors"
            >
              <span class="text-body font-bold text-silver pr-4">{{ item.q }}</span>
              <SvgIcon
                  :name="isExpanded(index) ? 'chevron-up' : 'chevron-down'"
                  size="small"
                  class="text-silver-50 flex-shrink-0 transition-transform"
              />
            </button>

            <!-- Answer -->
            <Transition
                enter-active-class="transition-all duration-200 ease-out"
                leave-active-class="transition-all duration-200 ease-in"
                enter-from-class="opacity-0 max-h-0"
                enter-to-class="opacity-100 max-h-96"
                leave-from-class="opacity-100 max-h-96"
                leave-to-class="opacity-0 max-h-0"
            >
              <div v-if="isExpanded(index)" class="overflow-hidden">
                <div class="px-4 pb-4 pt-0">
                  <div class="border-t border-silver-20 pt-4">
                    <p class="text-small text-silver-70 leading-relaxed">{{ item.a }}</p>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <!-- Trading Safety Tips -->
      <section class="mb-10">
        <h2 class="text-h2 font-bold text-neon mb-4 flex items-center gap-2">
          <SvgIcon name="eye-open" size="small" />
          {{ t('help.guides.tradeSafety.title') }}
        </h2>
        <div class="bg-primary border border-silver-30 p-6 rounded-md">
          <ul class="space-y-3">
            <li
                v-for="(tip, index) in tradeSafetyTips"
                :key="index"
                class="flex items-start gap-3"
            >
              <span class="w-6 h-6 rounded-full bg-neon-10 border border-neon text-neon flex items-center justify-center text-tiny font-bold flex-shrink-0 mt-0.5">
                {{ index + 1 }}
              </span>
              <span class="text-small text-silver-70">{{ tip }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Contact Section -->
      <section class="border border-silver-30 p-6 rounded-md text-center">
        <h3 class="text-body font-bold text-silver mb-2">¿No encontraste lo que buscas?</h3>
        <p class="text-small text-silver-70 mb-4">
          Si tienes más preguntas o necesitas ayuda, contáctanos.
        </p>
        <a
            href="mailto:support@cranialtrading.com"
            class="inline-flex items-center gap-2 text-neon hover:underline text-small font-bold"
        >
          <SvgIcon name="chat" size="tiny" />
          support@cranialtrading.com
        </a>
      </section>
    </div>
  </AppContainer>
</template>
