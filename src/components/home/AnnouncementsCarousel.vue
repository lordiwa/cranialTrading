<script setup lang="ts">
/**
 * Announcements carousel for /inicio.
 *
 * Content comes from src/data/announcements.ts (in the bundle), so this component
 * adds zero Firestore reads of its own.
 *
 * (TASK-148, 2026-08-08: that's this component's own contribution only — it does
 * NOT mean the landing as a whole was zero-read; it measurably wasn't, see
 * src/views/HomeView.vue's header comment for the measured cost and the fix.)
 *
 * No auto-advance on purpose: the landing's job is to get out of the way, and a
 * slide that moves on its own steals attention from the search field and fights
 * anyone reading a longer announcement. Navigation is manual (arrows + dots), and
 * prefers-reduced-motion users get no transition at all.
 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { announcements } from '../../data/announcements';
import IconV2 from '../ui/IconV2.vue';

const { t, locale } = useI18n();

const index = ref(0);

const slides = computed(() =>
    announcements.map((a) => ({
      id: a.id,
      href: a.href,
      tag: a.tag[locale.value],
      title: a.title[locale.value],
      body: a.body[locale.value],
    })),
);

const current = computed(() => slides.value[index.value]);
const hasMultiple = computed(() => slides.value.length > 1);

const go = (delta: number) => {
  const n = slides.value.length;
  if (n === 0) return;
  index.value = (index.value + delta + n) % n;
};

const goTo = (i: number) => {
  index.value = i;
};
</script>

<template>
  <section
      v-if="current"
      :aria-label="t('home.announcements')"
      class="w-full rounded-xl border border-line bg-surface-1 px-5 py-4 text-left"
  >
    <div class="flex items-start gap-4">
      <button
          v-if="hasMultiple"
          type="button"
          :aria-label="t('common.actions.previous')"
          class="hidden sm:flex mt-1 min-w-[36px] min-h-[36px] items-center justify-center rounded-full text-silver-30 hover:text-silver hover:bg-surface-2 transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
          @click="go(-1)"
      >
        <IconV2 name="chev-l" :size="18" />
      </button>

      <component
          :is="current.href ? RouterLink : 'div'"
          :to="current.href"
          class="flex-1 min-w-0 block focus-visible:outline-none focus-visible:shadow-glow-neon rounded-md"
      >
        <span class="inline-flex items-center h-[22px] px-2 rounded-full bg-neon-10 border border-neon-40 text-neon text-[10px] font-bold uppercase tracking-[.12em]">
          {{ current.tag }}
        </span>
        <h2 class="mt-2 font-display text-h5 font-bold text-silver">{{ current.title }}</h2>
        <p class="mt-1 text-small text-silver-50">{{ current.body }}</p>
      </component>

      <button
          v-if="hasMultiple"
          type="button"
          :aria-label="t('common.actions.next')"
          class="hidden sm:flex mt-1 min-w-[36px] min-h-[36px] items-center justify-center rounded-full text-silver-30 hover:text-silver hover:bg-surface-2 transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
          @click="go(1)"
      >
        <IconV2 name="chev-r" :size="18" />
      </button>
    </div>

    <div v-if="hasMultiple" class="mt-3 flex items-center justify-center gap-2">
      <button
          v-for="(slide, i) in slides"
          :key="slide.id"
          type="button"
          :aria-label="slide.title"
          :aria-current="i === index ? 'true' : undefined"
          class="h-[10px] w-[10px] rounded-full transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
          :class="i === index ? 'bg-neon' : 'bg-silver-20 hover:bg-silver-30'"
          @click="goTo(i)"
      />
    </div>
  </section>
</template>
