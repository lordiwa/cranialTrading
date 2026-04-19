<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../composables/useI18n'
import type { DisplayDeckCard } from '../../types/deck'
import { buildManaCurve } from '../../utils/manaCurve'
import { detectEtbTappedLands } from '../../services/manaCurveLands'

interface Props {
  cards: DisplayDeckCard[] // mainboard + commander + wishlist (sideboard already excluded upstream)
  deckSize: number // total cards for hypergeometric denominator (excludes sideboard)
}

const props = defineProps<Props>()
const { t } = useI18n()

// --------------------------------------------------------------------------
// Curve math
// --------------------------------------------------------------------------

const LAND_RX = /\bland\b/i

const curveInput = computed(() =>
  props.cards.map((c) => ({
    cmc: c.cmc ?? 0,
    type_line: c.type_line ?? '',
    allocatedQuantity: c.isWishlist ? c.requestedQuantity : c.allocatedQuantity,
  }))
)

const landCount = computed(() =>
  curveInput.value
    .filter((c) => LAND_RX.test(c.type_line))
    .reduce((sum, c) => sum + (c.allocatedQuantity ?? 0), 0)
)

const curve = computed(() =>
  buildManaCurve(curveInput.value, {
    deckSize: props.deckSize,
    landCount: landCount.value,
    excludePureLandsFromBuckets: true,
  })
)

const maxBucketCount = computed(() => {
  let max = 0
  for (const b of curve.value.buckets) {
    if (b.count > max) max = b.count
  }
  return max === 0 ? 1 : max // avoid division by zero in the height calc
})

const hasAnyCards = computed(() => curve.value.totalCards > 0)

// --------------------------------------------------------------------------
// Tapped-land detection (async, cached)
// --------------------------------------------------------------------------

const landScryfallIds = computed(() =>
  props.cards
    .filter((c) => LAND_RX.test(c.type_line ?? ''))
    .map((c) => c.scryfallId)
    .filter(Boolean)
)

const tappedInfo = ref<{ tappedCount: number; tappedNames: string[] } | null>(null)
const isDetectingTapped = ref(false)
let lastFetchedKey = '' // debounce: avoid re-running when the ID set is identical

// IMPORTANT: anti-loop rule — no async onMounted with await. Use watch(..., { immediate: true })
// so the tapped detection runs on initial mount AND on card changes without blocking
// the Vue lifecycle.
watch(
  landScryfallIds,
  async (ids) => {
    const key = [...ids].sort().join(',')
    if (key === lastFetchedKey) return
    lastFetchedKey = key

    if (ids.length === 0) {
      tappedInfo.value = { tappedCount: 0, tappedNames: [] }
      return
    }

    isDetectingTapped.value = true
    try {
      tappedInfo.value = await detectEtbTappedLands(ids)
    } catch {
      // detectEtbTappedLands already degrades to zero-state internally; this catch
      // is belt-and-suspenders. Silence — UI hides the banner.
      tappedInfo.value = { tappedCount: 0, tappedNames: [] }
    } finally {
      isDetectingTapped.value = false
    }
  },
  { immediate: true }
)

// --------------------------------------------------------------------------
// Display helpers
// --------------------------------------------------------------------------

function probabilityClass(p: number): string {
  if (p >= 0.9) return 'text-neon'
  if (p >= 0.7) return 'text-yellow-400'
  return 'text-rust'
}

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`
}

function barHeight(count: number): string {
  const pct = (count / maxBucketCount.value) * 120
  return `${Math.max(pct, count > 0 ? 4 : 0)}px`
}
</script>

<template>
  <section
      class="mt-6 mb-6 bg-primary/40 border border-silver-30 p-4"
      :aria-label="t('decks.manaCurve.title')"
  >
    <!-- Header -->
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <h3 class="text-small font-bold uppercase tracking-wider text-silver">
        {{ t('decks.manaCurve.title') }}
      </h3>
      <div class="text-tiny text-silver-70">
        {{ t('decks.manaCurve.landsLabel') }}: {{ landCount }} / {{ deckSize }}
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!hasAnyCards" class="text-tiny text-silver-70 italic">
      {{ t('decks.manaCurve.noLands') }}
    </div>

    <!-- Bar chart + probability rows -->
    <div v-else class="overflow-x-auto pb-2">
      <div
          class="grid gap-2 items-end"
          :style="{ gridTemplateColumns: `repeat(${curve.buckets.length}, minmax(3rem, 1fr))` }"
      >
        <div
            v-for="bucket in curve.buckets"
            :key="bucket.cmc"
            class="flex flex-col items-center text-center"
            role="img"
            :aria-label="t('decks.manaCurve.probabilityLabel', { k: bucket.cmc })"
        >
          <!-- Count label above the bar -->
          <div class="text-tiny text-silver-70 mb-1">{{ bucket.count }}</div>

          <!-- Bar (120px max height) -->
          <div class="relative w-full flex items-end justify-center" style="height: 120px">
            <div
                class="w-full bg-neon transition-[height] duration-200"
                :style="{ height: barHeight(bucket.count) }"
            ></div>
          </div>

          <!-- CMC label below the bar -->
          <div class="text-small font-bold text-silver mt-1">{{ bucket.cmc }}</div>

          <!-- Probability rows (skip for CMC 0, always 100%) -->
          <template v-if="bucket.cmc === 0">
            <div class="text-tiny text-neon">{{ t('decks.manaCurve.onPlay') }}: 100%</div>
            <div class="text-tiny text-neon">{{ t('decks.manaCurve.onDraw') }}: 100%</div>
          </template>
          <template v-else>
            <div class="text-tiny" :class="probabilityClass(bucket.pOnPlay)">
              {{ t('decks.manaCurve.onPlay') }}: {{ formatPct(bucket.pOnPlay) }}
            </div>
            <div class="text-tiny" :class="probabilityClass(bucket.pOnDraw)">
              {{ t('decks.manaCurve.onDraw') }}: {{ formatPct(bucket.pOnDraw) }}
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Tapped-land warning / detecting state -->
    <div v-if="isDetectingTapped" class="mt-3 text-tiny text-silver-70 italic">
      {{ t('decks.manaCurve.detecting') }}
    </div>
    <div
        v-else-if="tappedInfo && tappedInfo.tappedCount > 0"
        class="mt-3 p-2 border border-yellow-400/40 text-yellow-400"
    >
      <div class="text-small font-bold">
        {{ t('decks.manaCurve.tappedWarning', { count: tappedInfo.tappedCount }) }}
      </div>
      <div class="text-tiny mt-1 opacity-80">
        {{ t('decks.manaCurve.tappedWarningHelp') }}
      </div>
    </div>
  </section>
</template>
