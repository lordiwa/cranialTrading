<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { useDeckManaCosts } from '../../composables/useDeckManaCosts'
import type { DeckFormat, DisplayDeckCard, HydratedDeckCard } from '../../types/deck'
import { calculateKarstenAnalysis, type ColorChannelKarsten, type KarstenColorAnalysis } from '../../utils/manaCost'
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
const { cardsWithManaCost } = useDeckManaCosts(ownedCards)

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

// Per-color expand state.
const expandedColors = ref<Set<ColorKey>>(new Set())
function toggleExpand(color: ColorKey): void {
  const next = new Set(expandedColors.value)
  if (next.has(color)) next.delete(color)
  else next.add(color)
  expandedColors.value = next
}

function statusClass(channel: ColorChannelKarsten): string {
  if (channel.status === 'ok') return 'text-neon'
  if (channel.status === 'tight') return 'text-yellow-400'
  if (channel.status === 'critical' || channel.status === 'noLands') return 'text-rust'
  return 'text-silver-70'
}

function barColorClass(channel: ColorChannelKarsten): string {
  if (channel.status === 'ok') return 'bg-neon'
  if (channel.status === 'tight') return 'bg-yellow-400'
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

function spellRowStatusClass(status: 'ok' | 'tight' | 'critical'): string {
  if (status === 'ok') return 'text-neon'
  if (status === 'tight') return 'text-yellow-400'
  return 'text-rust'
}
</script>

<template>
  <section
      class="mt-2 mb-6 bg-primary/40 border border-silver-30 p-4"
      :aria-label="t('decks.colorAnalysis.title')"
  >
    <!-- Header -->
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <h3 class="text-small font-bold uppercase tracking-wider text-silver">
        {{ t('decks.colorAnalysis.title') }}
        <span class="text-tiny text-silver-70 font-normal normal-case ml-2">
          · {{ t('decks.colorAnalysis.karstenLabel') }} ({{ deckSize }})
        </span>
      </h3>
      <div class="text-tiny text-silver-70">
        {{ t('decks.colorAnalysis.subtitle') }}
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!hasAnyColor" class="text-tiny text-silver-70 italic">
      {{ t('decks.colorAnalysis.noColors') }}
    </div>

    <!-- Per-color rows -->
    <div v-else class="space-y-2">
      <div v-for="color in visibleColors" :key="color">
        <div
            class="flex items-center gap-3"
            role="group"
            :aria-label="`${color} — ${statusLabel(analysis[color])}`"
        >
          <!-- Color mana symbol (real Scryfall-style icon) -->
          <ManaIcon :symbol="color" size="large" />

          <!-- Two stacked bars: sources (top, status-colored) vs required (bottom, gray).
               Widths are normalized to max(sources, required) within the row so the
               longer bar fills entirely and the shorter one shows the deficit/surplus. -->
          <div class="flex-1 flex flex-col gap-1 min-w-[6rem]">
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

          <!-- Status label + playability stat -->
          <div class="flex flex-col items-end min-w-[7rem]">
            <span
                class="text-tiny font-bold uppercase tracking-wide"
                :class="statusClass(analysis[color])"
            >
              {{ statusLabel(analysis[color]) }}
            </span>
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
              class="text-tiny text-silver-70 hover:text-silver underline px-1 flex-shrink-0"
              @click="toggleExpand(color)"
          >
            {{ expandedColors.has(color) ? t('decks.colorAnalysis.collapseSpells') : t('decks.colorAnalysis.expandSpells') }}
          </button>
        </div>

        <!-- Expanded spell list -->
        <div
            v-if="expandedColors.has(color)"
            class="mt-2 ml-11 mb-3 border-l-2 border-silver-30 pl-3"
        >
          <table class="w-full text-tiny">
            <thead>
              <tr class="text-silver-70 border-b border-silver-30">
                <th class="text-left font-normal py-1">{{ t('decks.colorAnalysis.spellHeader') }}</th>
                <th class="text-right font-normal py-1 w-12">{{ t('decks.colorAnalysis.cmcHeader') }}</th>
                <th class="text-right font-normal py-1 w-12">{{ t('decks.colorAnalysis.pipsHeader') }}</th>
                <th class="text-right font-normal py-1 w-16">{{ t('decks.colorAnalysis.requiredHeader') }}</th>
                <th class="text-right font-normal py-1 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                  v-for="(check, idx) in analysis[color].spellChecks"
                  :key="`${check.card.cardId}-${idx}`"
                  class="border-b border-silver-30/30"
              >
                <td class="py-1 text-silver">{{ check.card.name }}</td>
                <td class="py-1 text-right text-silver-70">{{ check.cmc }}</td>
                <td class="py-1 text-right text-silver-70">{{ check.pips }}</td>
                <td class="py-1 text-right text-silver">{{ check.required }}</td>
                <td
                    class="py-1 text-right font-bold uppercase"
                    :class="spellRowStatusClass(check.status)"
                >
                  {{ check.status === 'ok' ? '✓' : check.status === 'tight' ? '!' : '✗' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
