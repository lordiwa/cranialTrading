<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { useDeckManaCosts } from '../../composables/useDeckManaCosts'
import type { DeckFormat, DisplayDeckCard, HydratedDeckCard } from '../../types/deck'
import { calculateKarstenAnalysis, type ColorChannelKarsten, type KarstenColorAnalysis } from '../../utils/manaCost'
import HelpTooltip from '../ui/HelpTooltip.vue'
import ManaIcon from '../ui/ManaIcon.vue'

interface Props {
  cards: DisplayDeckCard[] // mainboard only — Karsten math requires fixed deck size
  deckFormat: DeckFormat
}

const props = defineProps<Props>()
const { t } = useI18n()

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const
type ColorKey = typeof COLOR_ORDER[number]

// Filter to owned (HydratedDeckCard, not wishlist).
const ownedCards = computed<HydratedDeckCard[]>(() =>
  props.cards.filter((c): c is HydratedDeckCard => !c.isWishlist)
)

// Reactively hydrate mana_cost from Scryfall (cached) for owned cards.
const { cardsWithManaCost, isFirstLoading } = useDeckManaCosts(ownedCards)

// Determine deck size class for Karsten thresholds.
const deckSize = computed<60 | 99>(() => (props.deckFormat === 'commander' ? 99 : 60))

// Compute the Karsten analysis from hydrated cards.
const analysis = computed<KarstenColorAnalysis>(() =>
  calculateKarstenAnalysis(cardsWithManaCost.value, deckSize.value)
)

// Visible rows: only colors that have demand OR sources > 0.
const visibleColors = computed<ColorKey[]>(() =>
  COLOR_ORDER.filter(c => analysis.value[c].totalCount > 0 || analysis.value[c].sources > 0)
)

const hasAnyColor = computed(() => visibleColors.value.length > 0)

// Contextual empty state: detect what's missing so we can guide the user.
const hasAnyDemand = computed(() =>
  COLOR_ORDER.some(c => analysis.value[c].totalCount > 0)
)
const hasAnySources = computed(() =>
  COLOR_ORDER.some(c => analysis.value[c].sources > 0)
)
const emptyStateKey = computed<string>(() => {
  if (!hasAnyDemand.value && !hasAnySources.value) return 'decks.colorAnalysis.emptyNoCards'
  if (!hasAnyDemand.value) return 'decks.colorAnalysis.emptyNoDemand'
  if (!hasAnySources.value) return 'decks.colorAnalysis.emptyNoSources'
  return 'decks.colorAnalysis.noColors'
})

// Sort spell checks: critical first, then tight, then ok. Most actionable on top.
const STATUS_RANK: Record<'ok' | 'tight' | 'critical', number> = { critical: 0, tight: 1, ok: 2 }
function sortedSpellChecks(channel: ColorChannelKarsten) {
  return [...channel.spellChecks].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
}

// Per-color expand state.
const expandedColors = ref<Set<ColorKey>>(new Set())
function toggleExpand(color: ColorKey): void {
  const next = new Set(expandedColors.value)
  if (next.has(color)) next.delete(color)
  else next.add(color)
  expandedColors.value = next
}

// Pill badge with subtle background tint per status — more scannable than plain colored text.
function statusBadgeClass(channel: ColorChannelKarsten): string {
  const base = 'px-2 py-0.5 rounded text-tiny font-bold uppercase tracking-wide whitespace-nowrap'
  if (channel.status === 'ok') return `${base} bg-neon/15 text-neon`
  if (channel.status === 'tight') return `${base} bg-warning/15 text-warning`
  if (channel.status === 'critical' || channel.status === 'noLands') return `${base} bg-rust/10 text-rust`
  return `${base} bg-silver-5 text-silver-70`
}

function barColorClass(channel: ColorChannelKarsten): string {
  if (channel.status === 'ok') return 'bg-neon'
  if (channel.status === 'tight') return 'bg-warning'
  if (channel.status === 'critical' || channel.status === 'noLands') return 'bg-rust'
  return 'bg-silver-30'
}

function statusLabel(channel: ColorChannelKarsten): string {
  if (channel.status === 'ok') return t('decks.colorAnalysis.statusOk')
  if (channel.status === 'tight') return t('decks.colorAnalysis.statusLow')
  if (channel.status === 'critical') return t('decks.colorAnalysis.statusCritical')
  if (channel.status === 'noLands') return t('decks.colorAnalysis.noLands')
  return ''
}

// Two-bar comparison: each bar is scaled relative to the LARGER of (sources, required)
// in the same row, so the bigger value fills the bar fully and the smaller one
// shows its proportional shortage / surplus visually.
function rowScale(channel: ColorChannelKarsten): number {
  return Math.max(channel.sources, channel.maxRequired, 1)
}

function sourcesBarWidth(channel: ColorChannelKarsten): string {
  return `${(channel.sources / rowScale(channel)) * 100}%`
}

function requiredBarWidth(channel: ColorChannelKarsten): string {
  if (channel.maxRequired === 0) return '0%'
  return `${(channel.maxRequired / rowScale(channel)) * 100}%`
}

// Mini-badge for the per-spell status cell in the expanded table.
// Same visual language as the row-level status badge but smaller.
function spellRowBadgeClass(status: 'ok' | 'tight' | 'critical'): string {
  const base = 'inline-flex items-center justify-center w-6 h-6 rounded font-bold text-tiny'
  if (status === 'ok') return `${base} bg-neon/15 text-neon`
  if (status === 'tight') return `${base} bg-warning/15 text-warning`
  return `${base} bg-rust/10 text-rust`
}

function spellRowBadgeIcon(status: 'ok' | 'tight' | 'critical'): string {
  if (status === 'ok') return '✓'
  if (status === 'tight') return '!'
  return '✗'
}

// Surplus / deficit numeric indicator next to status. Only meaningful when there
// is real demand (maxRequired > 0).
function deltaValue(channel: ColorChannelKarsten): number {
  return channel.sources - channel.maxRequired
}

function deltaLabel(channel: ColorChannelKarsten): string {
  const d = deltaValue(channel)
  if (d > 0) return t('decks.colorAnalysis.surplus', { n: d })
  if (d < 0) return t('decks.colorAnalysis.deficit', { n: Math.abs(d) })
  return '±0'
}

function deltaClass(channel: ColorChannelKarsten): string {
  const d = deltaValue(channel)
  if (d >= 0) return 'text-neon'
  // Deficit: use status thresholds for granularity (tight vs critical)
  if (channel.status === 'tight') return 'text-warning'
  return 'text-rust'
}
</script>

<template>
  <section
      class="mt-0 mb-6 bg-primary/40 border border-silver-30 p-4"
      :aria-label="t('decks.colorAnalysis.title')"
  >
    <!-- Header -->
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <h3 class="text-small font-bold uppercase tracking-wider text-silver flex items-center gap-2">
        {{ t('decks.colorAnalysis.title') }}
        <span class="text-tiny text-silver-70 font-normal normal-case">
          · {{ t('decks.colorAnalysis.karstenLabel') }} ({{ deckSize }})
        </span>
        <HelpTooltip
            :title="t('decks.colorAnalysis.karstenTooltipTitle')"
            :text="t('decks.colorAnalysis.karstenTooltipText', { size: deckSize })"
            size="small"
        />
      </h3>
      <div class="text-tiny text-silver-70">
        {{ t('decks.colorAnalysis.subtitle') }}
      </div>
    </div>

    <!-- Loading state (first hydration in flight): skeleton rows that mimic the real layout -->
    <div v-if="isFirstLoading" class="space-y-2 animate-pulse" :aria-label="t('decks.colorAnalysis.loading')">
      <div v-for="i in 3" :key="i" class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-silver-10 flex-shrink-0"></div>
        <div class="flex-1 flex flex-col gap-1">
          <div class="h-3 bg-silver-10 rounded"></div>
          <div class="h-3 bg-silver-5 rounded w-3/4"></div>
        </div>
        <div class="w-16 h-5 bg-silver-10 rounded"></div>
      </div>
    </div>

    <!-- Empty state (contextual: tells the user what's missing) -->
    <div v-else-if="!hasAnyColor" class="text-tiny text-silver-70 italic">
      {{ t(emptyStateKey) }}
    </div>

    <!-- Per-color rows -->
    <div v-else class="space-y-2">
      <div v-for="color in visibleColors" :key="color">
        <!-- Mobile: stack bars on top, status+button on bottom row.
             Desktop (sm+): single row with bars in the middle. -->
        <div
            class="flex flex-wrap sm:flex-nowrap items-center gap-3"
            role="group"
            :aria-label="`${color} — ${statusLabel(analysis[color])}`"
        >
          <!-- Color mana symbol (real Scryfall-style icon).
               aria-hidden because the role="group" parent already names the row by color. -->
          <ManaIcon :symbol="color" size="large" aria-hidden="true" />

          <!-- Two stacked bars: sources (top, status-colored) vs required (bottom, gray).
               Widths are normalized to max(sources, required) within the row so the
               longer bar fills entirely and the shorter one shows the deficit/surplus.
               On mobile the bars take full width (basis-full); on sm+ they share the row. -->
          <div class="basis-full sm:basis-auto sm:flex-1 flex flex-col gap-1 min-w-0">
            <!-- Sources bar (status-colored) -->
            <div class="flex items-center gap-2">
              <div class="flex-1 h-3 bg-primary/60 border border-silver-30 overflow-hidden">
                <div
                    class="h-full transition-[width] duration-200"
                    :class="barColorClass(analysis[color])"
                    :style="{ width: sourcesBarWidth(analysis[color]) }"
                ></div>
              </div>
              <span class="text-tiny text-silver-70 min-w-[8rem]">
                <span class="text-silver font-bold">{{ analysis[color].sources }}</span>
                {{ t('decks.colorAnalysis.sources') }}
              </span>
            </div>

            <!-- Required bar (gray) -->
            <div v-if="analysis[color].maxRequired > 0" class="flex items-center gap-2">
              <div class="flex-1 h-3 bg-primary/60 border border-silver-30 overflow-hidden">
                <div
                    class="h-full bg-silver-30 transition-[width] duration-200"
                    :style="{ width: requiredBarWidth(analysis[color]) }"
                ></div>
              </div>
              <span class="text-tiny text-silver-70 min-w-[8rem]">
                <span class="text-silver font-bold">{{ analysis[color].maxRequired }}</span>
                {{ t('decks.colorAnalysis.requires') }}
                <span v-if="analysis[color].maxRequiredCard" class="opacity-70 block truncate">
                  ({{ analysis[color].maxRequiredCard?.name }})
                </span>
              </span>
            </div>
          </div>

          <!-- Status badge + delta + playability stat -->
          <div class="flex flex-col items-end gap-1 min-w-[7rem]">
            <div class="flex items-center gap-2">
              <span :class="statusBadgeClass(analysis[color])">
                {{ statusLabel(analysis[color]) }}
              </span>
              <span
                  v-if="analysis[color].maxRequired > 0"
                  class="text-tiny font-bold tabular-nums"
                  :class="deltaClass(analysis[color])"
                  :title="`${analysis[color].sources} − ${analysis[color].maxRequired}`"
              >
                {{ deltaLabel(analysis[color]) }}
              </span>
            </div>
            <span v-if="analysis[color].totalCount > 0" class="text-tiny text-silver-70">
              {{ t('decks.colorAnalysis.playabilityStat', {
                ok: analysis[color].totalCount - analysis[color].failingCount,
                total: analysis[color].totalCount,
              }) }}
            </span>
          </div>

          <!-- Expand button (only if there's a spell list to show) -->
          <button
              v-if="analysis[color].spellChecks.length > 0"
              type="button"
              class="text-tiny text-silver-70 hover:text-silver underline px-2 flex-shrink-0 min-h-[44px] flex items-center"
              :aria-expanded="expandedColors.has(color)"
              :aria-controls="`color-spells-${color}`"
              @click="toggleExpand(color)"
          >
            {{ expandedColors.has(color) ? t('decks.colorAnalysis.collapseSpells') : t('decks.colorAnalysis.expandSpells') }}
          </button>
        </div>

        <!-- Expanded spell list -->
        <div
            v-if="expandedColors.has(color)"
            :id="`color-spells-${color}`"
            class="mt-2 ml-11 mb-3 border-l-2 border-silver-30 pl-3 overflow-x-auto"
        >
          <table class="w-full text-tiny">
            <thead>
              <tr class="text-silver-70 border-b border-silver-30">
                <th class="text-left font-normal py-1">{{ t('decks.colorAnalysis.spellHeader') }}</th>
                <th class="text-right font-normal py-1 w-12">{{ t('decks.colorAnalysis.cmcHeader') }}</th>
                <th class="text-right font-normal py-1 w-12" :title="t('decks.colorAnalysis.pipsHeaderTooltip')">
                  {{ t('decks.colorAnalysis.pipsHeader') }}
                  <span aria-hidden="true" class="text-silver-30 cursor-help">ⓘ</span>
                </th>
                <th class="text-right font-normal py-1 w-16">{{ t('decks.colorAnalysis.requiredHeader') }}</th>
                <th class="text-right font-normal py-1 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                  v-for="(check, idx) in sortedSpellChecks(analysis[color])"
                  :key="`${check.card.cardId}-${idx}`"
                  class="border-b border-silver-30/30"
              >
                <td class="py-1 text-silver">{{ check.card.name }}</td>
                <td class="py-1 text-right text-silver-70">{{ check.cmc }}</td>
                <td class="py-1 text-right text-silver-70">{{ check.pips }}</td>
                <td class="py-1 text-right text-silver">{{ check.required }}</td>
                <td class="py-1 text-right">
                  <span :class="spellRowBadgeClass(check.status)" :aria-label="check.status">
                    {{ spellRowBadgeIcon(check.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
