<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { type MatchCard, type MatchPreference, type SimpleMatch, useMatchesStore } from '../../stores/matches';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';
import ChatModal from '../chat/ChatModal.vue';
import SvgIcon from '../ui/SvgIcon.vue';
import IconV2 from '../ui/IconV2.vue';
import UserProfileHoverCard from '../user/UserProfileHoverCard.vue';

const props = defineProps<{
  show: boolean;
  match: SimpleMatch | null;
}>();

const emit = defineEmits<{
  close: [];
  contact: [];
}>();

const { t } = useI18n();

const matchesStore = useMatchesStore();
const isSaving = ref(false);
const showChat = ref(false);
const showHoverCard = ref(false);

const isMatchSaved = computed(() => {
  return props.match ? matchesStore.isMatchSaved(props.match.id) : false;
});

const handleSaveMatch = async () => {
  if (!props.match) return;

  isSaving.value = true;
  const success = await matchesStore.saveMatch(props.match);
  isSaving.value = false;

  if (success) {
    setTimeout(() => {
      emit('close');
    }, 500);
  }
};

const handleContact = () => {
  showChat.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};

// Helper: derive badge variant and border class from preference or card
type BadgeVariant = 'busco' | 'cambio' | 'vendo' | 'success' | 'solo' | 'deseado' | 'error' | 'info' | 'warning';
interface Visual { badge: BadgeVariant; border: string; label: string }

const DEFAULT_VISUAL: Visual = { badge: 'solo', border: 'border-silver-30', label: 'COLECCIÓN' };

const TYPE_VISUALS: Record<string, Visual> = {
  'VENDO': { badge: 'vendo', border: 'border-rust', label: 'VENDO' },
  'CAMBIO': { badge: 'cambio', border: 'border-silver', label: 'CAMBIO' },
  'BUSCO': { badge: 'busco', border: 'border-neon', label: 'WISHLIST' },
};

const STATUS_VISUALS: Record<string, Visual> = {
  'sell': { badge: 'vendo', border: 'border-rust', label: 'VENDO' },
  'trade': { badge: 'cambio', border: 'border-silver', label: 'CAMBIO' },
  'busco': { badge: 'busco', border: 'border-neon', label: 'WISHLIST' },
  'collection': { badge: 'solo', border: 'border-silver-20', label: 'COLECCIÓN' },
};

const getVisualFor = (obj: { type?: string; status?: string } | null | undefined): Visual => {
  if (!obj) return DEFAULT_VISUAL;
  if (obj.type) return TYPE_VISUALS[obj.type.toUpperCase()] ?? DEFAULT_VISUAL;
  if (obj.status) return STATUS_VISUALS[obj.status.toLowerCase()] ?? DEFAULT_VISUAL;
  return DEFAULT_VISUAL;
};

// v2 redesign — dot-badge tint classes (design→app v2 F2b, DESIGN-DIRECTION.md §5).
// Same badge variant vocabulary as getVisualFor() above; only the rendering changed
// from BaseBadge (v1 border pill) to a translucent-tint + dot pill, matching the
// proto's badge-vendo/cambio/busco/deseado treatment for status chips inside a panel
// (as opposed to the opaque-dark variant CollectionGridCardFull/MatchCard use over card art).
const BADGE_CLASSES: Partial<Record<BadgeVariant, string>> = {
  vendo: 'bg-rust-10 text-[#C4553F]',
  cambio: 'bg-[rgba(96,165,250,.12)] text-[#60A5FA]',
  busco: 'bg-neon-15 text-neon',
  deseado: 'bg-[rgba(212,168,67,.12)] text-gold',
};
const badgeClasses = (variant: BadgeVariant): string => {
  // eslint-disable-next-line security/detect-object-injection
  return BADGE_CLASSES[variant] ?? 'bg-surface-3 text-silver-70';
};

// v2 redesign — swap layout (proto 75): a single "das/recibís" pair instead of the
// old two-stacked-panels layout. VENDO = my card vs. their preference; BUSCO (else)
// = my preference vs. their card. Same fields as before (myCard/otherPreference/
// myPreference/otherCard), just read into one left/right pair for the shared template.
const leftItem = computed<MatchCard | MatchPreference | null>(() => {
  if (!props.match) return null;
  return props.match.type === 'VENDO' ? (props.match.myCard ?? null) : (props.match.myPreference ?? null);
});
const rightItem = computed<MatchCard | MatchPreference | null>(() => {
  if (!props.match) return null;
  return props.match.type === 'VENDO' ? (props.match.otherPreference ?? null) : (props.match.otherCard ?? null);
});
const itemPrice = (item: MatchCard | MatchPreference | null): number | undefined =>
  item && 'price' in item && item.price > 0 ? item.price : undefined;
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div v-if="match" class="w-full max-w-md">
      <p class="text-[11px] font-bold uppercase tracking-[.18em] text-neon mb-1">{{ t('matches.detailModal.kicker') }}</p>
      <h2 class="font-display text-h2 font-bold text-silver mb-5">{{ t('matches.detailModal.title') }}</h2>

      <div class="space-y-4">
        <!-- Usuario -->
        <div
            @mouseenter="showHoverCard = true"
            @mouseleave="showHoverCard = false"
            class="relative flex items-center gap-3 p-3 bg-surface-1 border border-line rounded-lg"
        >
          <span class="w-10 h-10 rounded-full bg-neon-15 border border-neon-40 flex items-center justify-center text-neon font-display font-bold text-[15px] flex-shrink-0">
            {{ match.otherUsername.charAt(0).toUpperCase() }}
          </span>
          <div class="min-w-0 flex-1">
            <router-link
                :to="`/@${match.otherUsername}`"
                class="font-display font-bold text-neon hover:underline transition-fast block truncate"
            >
              @{{ match.otherUsername }}
            </router-link>
            <p v-if="match.otherLocation" class="flex items-center gap-1.5 text-tiny text-silver-50 mt-0.5">
              <IconV2 name="user" :size="14" />
              {{ match.otherLocation }}
            </p>
          </div>
          <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide flex-shrink-0"
              :class="badgeClasses(getVisualFor(match).badge)"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
            {{ getVisualFor(match).label }}
          </span>

          <!-- Hover preview card -->
          <UserProfileHoverCard
              :username="match.otherUsername"
              :show="showHoverCard"
          />
        </div>

        <!-- Das / Recibís -->
        <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-start bg-surface-1 border border-line rounded-lg p-4">
          <div class="flex flex-col gap-2 min-w-0">
            <span class="text-[10px] font-bold uppercase tracking-[.12em] text-silver-30">
              {{ match.type === 'VENDO' ? t('matches.detailModal.youHave') : t('matches.detailModal.youSearch') }}
            </span>
            <div class="relative aspect-[63/88] rounded-md border border-line overflow-hidden bg-gradient-to-br from-[#101c12] via-[#060a07] to-[#0c130d]">
              <img
                  v-if="leftItem?.image"
                  :src="leftItem.image"
                  :alt="leftItem.name"
                  class="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            <div class="min-w-0">
              <p class="text-[14px] font-bold text-silver truncate">{{ leftItem?.name }}</p>
              <p class="text-tiny text-silver-50 mt-0.5 truncate">{{ leftItem?.edition }}</p>
              <p v-if="itemPrice(leftItem)" class="font-display font-tnum text-neon text-[15px] mt-1">${{ itemPrice(leftItem) }}</p>
            </div>
          </div>

          <IconV2 name="swap" :size="26" class="text-silver-30 mt-11 flex-shrink-0" />

          <div class="flex flex-col gap-2 min-w-0">
            <span class="text-[10px] font-bold uppercase tracking-[.12em] text-silver-30">
              {{ match.type === 'VENDO' ? t('matches.detailModal.wants') : t('matches.detailModal.has') }}
            </span>
            <div class="relative aspect-[63/88] rounded-md border border-line overflow-hidden bg-gradient-to-br from-[#0d1626] via-[#060a12] to-[#0a1220]">
              <img
                  v-if="rightItem?.image"
                  :src="rightItem.image"
                  :alt="rightItem.name"
                  class="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            <div class="min-w-0">
              <p class="text-[14px] font-bold text-silver truncate">{{ rightItem?.name }}</p>
              <p class="text-tiny text-silver-50 mt-0.5 truncate">{{ rightItem?.edition }}</p>
              <p v-if="itemPrice(rightItem)" class="font-display font-tnum text-neon text-[15px] mt-1">${{ itemPrice(rightItem) }}</p>
            </div>
          </div>
        </div>

        <!-- Diferencia de valor -->
        <div class="flex items-center justify-between gap-3 p-3 bg-surface-1 border border-line rounded-lg">
          <span class="text-small text-silver-50">{{ t('matches.card.priceDifference') }}</span>
          <div class="text-right">
            <span
                class="block font-display font-tnum text-[22px] font-bold"
                :class="(match.valueDifference ?? 0) >= 0 ? 'text-neon' : 'text-[#C4553F]'"
            >
              {{ (match.valueDifference ?? 0) >= 0 ? '+' : '−' }}${{ Math.abs(match.valueDifference ?? 0).toFixed(0) }}
            </span>
            <span class="block text-[11px] font-bold uppercase tracking-[.06em] text-silver-30 mt-0.5">
              {{ (match.valueDifference ?? 0) >= 0 ? t('matches.card.priceDiffFavor') : t('matches.card.priceDiffAgainst') }}
            </span>
          </div>
        </div>

        <!-- Botones de acción -->
        <div class="flex gap-3 pt-4 border-t border-line">
          <BaseButton
              variant="secondary"
              class="flex-1 flex items-center justify-center gap-2"
              @click="emit('close')"
          >
            <SvgIcon name="x-mark" size="tiny" />
            {{ t('common.actions.close') }}
          </BaseButton>
          <BaseButton
              v-if="!isMatchSaved"
              class="flex-1 flex items-center justify-center gap-2"
              :disabled="isSaving"
              @click="handleSaveMatch"
          >
            <SvgIcon name="star" size="tiny" />
            {{ isSaving ? t('common.actions.saving') : t('matches.actions.interested') }}
          </BaseButton>
          <BaseButton
              v-else
              class="flex-1 flex items-center justify-center gap-2"
              @click="handleContact"
          >
            <SvgIcon name="chat" size="tiny" />
            {{ t('matches.detailModal.contact') }}
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Chat Modal -->
    <ChatModal
        :show="showChat"
        :other-user-id="match?.otherUserId || ''"
        :other-username="match?.otherUsername || ''"
        @close="handleCloseChat"
    />
  </BaseModal>
</template>
