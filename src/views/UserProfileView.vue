<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHead, useSeoMeta } from '@unhead/vue';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firestore';
import { resolveUsernameToUid } from '../services/userLookup';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { useConfirmStore } from '../stores/confirm';
import { useExchangeCartStore } from '../stores/exchangeCart';
import { useBuyRequestsStore } from '../stores/buyRequests';
import { useI18n } from '../composables/useI18n';
import { buildLoginUrl, buildRegisterUrl } from '../composables/useReturnUrl';
import { colorOrder, getCardColorCategory, getCardManaCategory, getCardNameCategory, getCardTypeCategory, manaOrder, translateCategory as translateCategoryLabel, typeOrder } from '../composables/useCardFilter';
import { PUBLIC_COLOR_LETTERS, PUBLIC_MANA_VALUES, PUBLIC_RARITIES, PUBLIC_TYPES, usePublicProfileIndex } from '../composables/usePublicProfileIndex';
import { resolveProfileEmptyState } from '../composables/useProfileEmptyState';
import { shareCart } from '../utils/exchangeCartShare';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import IconV2 from '../components/ui/IconV2.vue';
import CartFab from '../components/cart/CartFab.vue';
import CollectionGrid from '../components/collection/CollectionGrid.vue';
import CardFilterBar from '../components/ui/CardFilterBar.vue';
import AdvancedFilterModal, { type AdvancedFilters } from '../components/search/AdvancedFilterModal.vue';
import ChatModal from '../components/chat/ChatModal.vue';
import ExchangeCartDrawer from '../components/cart/ExchangeCartDrawer.vue';
import type { Card } from '../types/card';
import { getAvatarUrlForUser } from '../utils/avatar';
import { getMatchExpirationDate } from '../utils/matchExpiry';

const route = useRoute();
const router = useRouter();
const toastStore = useToastStore();
const authStore = useAuthStore();
const confirmStore = useConfirmStore();
const cartStore = useExchangeCartStore();
const buyRequestsStore = useBuyRequestsStore();
const { t } = useI18n();

// State refs
const username = ref<string>(route.params.username as string || '');
const userId = ref<string | null>(null);
const userInfo = ref<{ username?: string; location?: string; avatarUrl?: string | null } | null>(null);
const loading = ref(false);
const userNotFound = ref(false);
const showChat = ref(false);
const selectedUserId = ref('');
const selectedUsername = ref('');
const showFilters = ref(false);

// Computed properties
const isOwnProfile = computed(() => {
  return authStore.user?.id === userId.value;
});

const canShowInterest = computed(() => {
  return !!(authStore.user && !isOwnProfile.value);
});

// TASK-247 tanda 4: the whole filter/search/pagination state now comes from
// the PUBLIC CARD INDEX through a Cloud Function, not from whatever documents
// are in memory. Every chip, the text search and the result count are resolved
// over the seller's WHOLE public collection — the fix this ticket exists for.
// The cross-profile generation guard TASK-136 introduced lives on inside the
// composable. saleCount/tradeCount still come from a decoupled Firestore
// aggregate count query, so the header chips stay unconditional totals rather
// than following whatever filter is active (design→app v2 F8,
// cranial-design/prototype/22-user-profile-*.html for the chip UI).
const {
  cards,
  total: filteredTotal,
  loadingMore: loadingMorePublicCards,
  searching,
  error: cardsError,
  partial: indexPartial,
  indexBuilt,
  loading: loadingPublicCards,
  missing: dataUnknownExcluded,
  saleCount,
  tradeCount,
  activeFilterCount,
  filterQuery,
  selectedColors,
  selectedRarities,
  selectedTypes,
  selectedManaValues,
  sort,
  advancedFilters,
  loadFirstPage: loadFirstPublicCardsPage,
  loadMore: loadMorePublicCards,
  resetFilters,
} = usePublicProfileIndex(userId, {
  onError: () => toastStore.show(t('profile.messages.loadCardsError'), 'error'),
});

// Cart mode: show cart buttons for anonymous users (not logged in, not own profile)
const showCartMode = computed(() => !authStore.user);
const showCartDrawer = ref(false);
const cartItemCount = computed(() => cartStore.getCartItemCount(username.value));
const cartItemIds = computed(() => {
  const cart = cartStore.getCart(username.value);
  if (!cart) return new Set<string>();
  return new Set(cart.items.map(i => i.scryfallId || i.cardId));
});

// Use custom avatar if available (own profile or other user's uploaded avatar)
const profileAvatarUrl = computed(() => {
  if (isOwnProfile.value) {
    return authStore.getAvatarUrl(64);
  }
  return getAvatarUrlForUser(userInfo.value?.username ?? '', 64, userInfo.value?.avatarUrl);
});

// SEO: Dynamic meta tags that update when profile data loads
const profileTitle = computed(() =>
  userInfo.value?.username ? `@${userInfo.value.username}` : t('seo.pages.userProfile.title', { username: username.value })
);
const profileDescription = computed(() =>
  t('seo.pages.userProfile.description', { username: userInfo.value?.username || username.value })
);

useHead({
  title: profileTitle,
});

useSeoMeta({
  ogTitle: computed(() => `${profileTitle.value} | Cranial Trading`),
  ogDescription: profileDescription,
  ogType: 'profile',
  ogUrl: computed(() => `https://cranial-trading.web.app/@${username.value}`),
  ogImage: computed(() => profileAvatarUrl.value || 'https://cranial-trading.web.app/og-default.png'),
  ogSiteName: 'Cranial Trading',
  twitterCard: 'summary_large_image',
});

// Watchers
watch(() => route.params.username, (v) => {
  username.value = v as string;
  void loadProfile();
});

// Helper: resolve a user by username deterministically (D-11). Index-first via
// /usernames/{norm} with legacy fallback (resolveUsernameToUid). Feeds userId.value
// → buyRequests ownerUid — closing the SCRUM-70 wrong-account root cause.
const findUserByUsername = async (uname: string): Promise<{ id: string; data: Record<string, unknown> } | null> => {
  return resolveUsernameToUid(uname);
};

// Methods
const loadProfile = async () => {
  if (!username.value) return;

  loading.value = true;
  userNotFound.value = false;

  try {
    // Check if viewing own profile - use auth user directly to avoid duplicate username issues
    if (authStore.user?.username === username.value) {
      userId.value = authStore.user.id;
      userInfo.value = {
        username: authStore.user.username,
        location: authStore.user.location,
      };
    } else {
      // Query users collection to find userId by username (with retry for anonymous users)
      const result = await findUserByUsername(username.value);
      if (!result) {
        userNotFound.value = true;
        loading.value = false;
        return;
      }

      userId.value = result.id;
      userInfo.value = result.data as { username?: string; location?: string; avatarUrl?: string | null };
    }

    if (userId.value) {
      // TASK-138 AC1 no longer needs a separate re-apply step: the composable
      // reads userId (a ref) and the current filter state on every query, so a
      // search term left over from a previously viewed profile is carried into
      // the new profile's first query by construction.
      await loadFirstPublicCardsPage();
    }
  } catch (err) {
    console.error('Error loading profile:', err);
    // Show error toast with actual error detail for debugging
    const errMsg = err instanceof Error ? err.message : String(err);
    toastStore.show(`${t('profile.messages.loadError')}: ${errMsg}`, 'error');
    userNotFound.value = true;
  } finally {
    loading.value = false;
  }

  // Post-auth cart conversion: if logged in and cart exists for this profile
  if (authStore.user && !isOwnProfile.value && cartStore.getCartItemCount(username.value) > 0) {
    void convertCartToMatches();
  }
};

/** Re-runs the index query after a failure, without reloading the profile. */
const retryLoad = () => {
  void loadFirstPublicCardsPage();
};

// enrichPublicCardsInMemory used to live here (SCRUM-67). It fetched Scryfall
// card-by-card for whatever page was loaded so the advanced filters had colour
// and type data to work with. It is DELETED, not moved: the index carries `co`,
// `pm`, `t`, `cm`, `r`, `kw`, `lg`, `pw`, `to` and `fa` already, resolved
// server-side, over the seller's WHOLE collection instead of one page.
//
// CORRECTION (tanda 4 ronda 2). The first version of this note claimed an
// anonymous visitor "cannot read scryfall_cache at all" and therefore gained
// something here. That was FALSE and the reviewer verified it: the L2 read in
// src/services/scryfallCache.ts is wrapped in a try/catch that routes a
// permission-denied straight to the public Scryfall API, so anonymous
// visitors WERE being enriched. What this deletion gains is REACH (the whole
// collection, not the loaded page) and cost — not a capability anonymous
// visitors lacked. What it costs is the `setCode` that enrichment used to
// patch in; that is now supplied by the writer instead (see
// functions/lib/publicCardEntry.js and publicCardCacheBackfill.js).
//
// Nothing else called it.

const handleContact = (id: string, username: string) => {
  selectedUserId.value = id;
  selectedUsername.value = username;
  showChat.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};

// ========== FILTERS ==========
//
// Every filter below is a SERVER query, not an in-memory pass over `cards`.
// The composable owns the state and re-queries whenever it changes.
//
// COLOUR VOCABULARY (Rafael, 2026-08-19 — settled): OR-inclusive letters. A
// B/G card answers to Black AND to Green, there is no 'Multicolor' chip, and
// a land counts by what it PRODUCES (a Swamp is black). `useCardFilter`'s
// category vocabulary is deliberately NOT used for filtering here; it is still
// the vocabulary of the owner's own collection views, which this ticket does
// not touch.
// LOW-6 (ronda 2): back to 'recent', which is what this profile shipped with
// and what useCardFilter's own default is. Tanda 4 changed it to alphabetical
// with nothing deciding that.
const sortBy = ref<'recent' | 'name' | 'price'>('recent');
const groupBy = ref<'none' | 'type' | 'mana' | 'color' | 'name'>('none');

const SORT_FIELDS = {
  recent: { field: 'dateAdded', direction: 'desc' },
  name: { field: 'name', direction: 'asc' },
  price: { field: 'price', direction: 'desc' },
} as const;

watch(sortBy, (value) => {
  // eslint-disable-next-line security/detect-object-injection
  sort.value = { ...SORT_FIELDS[value] };
});

/**
 * GROUPING is presentation over the cards currently loaded, not a filter —
 * the group headers count what is on screen, which is what they always did.
 * It keeps `useCardFilter`'s category helpers precisely because grouping is
 * where a 'Multicolor' or 'Lands' heading is still a useful label; the
 * FILTER above does not use them.
 */
const groupedCards = computed(() => {
  if (groupBy.value === 'none') return [{ type: 'all', cards: cards.value }];

  const categoryOf = (card: Card): string => {
    switch (groupBy.value) {
      case 'mana': return getCardManaCategory(card);
      case 'color': return getCardColorCategory(card);
      case 'type': return getCardTypeCategory(card);
      case 'name': return getCardNameCategory(card);
      default: return 'all';
    }
  };
  const order = groupBy.value === 'mana' ? manaOrder : groupBy.value === 'color' ? colorOrder : groupBy.value === 'type' ? typeOrder : [];

  const groups = new Map<string, Card[]>();
  for (const card of cards.value) {
    const category = categoryOf(card);
    const bucket = groups.get(category);
    if (bucket) bucket.push(card);
    else groups.set(category, [card]);
  }

  const keys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return keys.map(type => ({ type, cards: groups.get(type)! }));
});

const translateCategory = (category: string): string => translateCategoryLabel(category, t);

// Bridge: composable state <-> the AdvancedFilterModal's own shape. The modal
// already speaks colour LETTERS ('w'/'u'/'b'/…) and lowercase type and rarity
// names, which is the same vocabulary the index uses — only the case differs.
const narrowedList = (selected: Set<string>, all: readonly string[]): string[] =>
  selected.size >= all.length ? [] : all.filter(v => selected.has(v));

/**
 * Sets the visitor can pick from. Derived from the cards currently loaded —
 * the index exposes no set FACET, so this list grows as pages load instead of
 * covering the whole collection from the first render. Known limitation,
 * written down rather than hidden: the set filter itself is applied
 * server-side over everything, it is only the OPTIONS that are partial.
 */
const collectionSets = computed(() => {
  const seen = new Map<string, string>();
  for (const card of cards.value) {
    if (card.setCode && !seen.has(card.setCode)) seen.set(card.setCode, card.edition || card.setCode);
  }
  return [...seen].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
});

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
const localAdvancedFilters = computed<AdvancedFilters>(() => ({
  colors: narrowedList(selectedColors.value, PUBLIC_COLOR_LETTERS).map(c => c.toLowerCase()),
  types: narrowedList(selectedTypes.value, PUBLIC_TYPES),
  manaValue: selectedManaValues.value.size < PUBLIC_MANA_VALUES.length
    ? { values: [...selectedManaValues.value].map(v => v === '10+' ? 10 : Number.parseInt(v, 10)).filter(v => !Number.isNaN(v)) }
    : { min: undefined, max: undefined, values: undefined },
  rarity: narrowedList(selectedRarities.value, PUBLIC_RARITIES),
  sets: advancedFilters.value.edition ?? [],
  power: { min: advancedFilters.value.powerMin, max: advancedFilters.value.powerMax },
  toughness: { min: advancedFilters.value.toughnessMin, max: advancedFilters.value.toughnessMax },
  formatLegal: advancedFilters.value.formats ?? [],
  priceUSD: { min: advancedFilters.value.minPrice, max: advancedFilters.value.maxPrice },
  keywords: advancedFilters.value.keywords ?? [],
  // The index carries no oracle text, so creature SUBTYPES cannot be filtered
  // on a public profile. Offering an empty list is the honest answer; the
  // alternative — filtering the loaded page only — is the bug this ticket
  // closes, in miniature.
  creatureTypes: [],
  isFoil: advancedFilters.value.foil === true,
  isFullArt: advancedFilters.value.fullArt === true,
}));

const restoreOrAll = (picked: string[], all: readonly string[]): Set<string> =>
  new Set(picked.length > 0 ? picked : all);

const handleLocalFiltersUpdate = (updated: AdvancedFilters) => {
  selectedColors.value = restoreOrAll(updated.colors.map(c => c.toUpperCase()), PUBLIC_COLOR_LETTERS);
  selectedTypes.value = restoreOrAll(updated.types, PUBLIC_TYPES);
  selectedRarities.value = restoreOrAll(updated.rarity, PUBLIC_RARITIES);
  selectedManaValues.value = updated.manaValue.values?.length
    ? new Set(updated.manaValue.values.map(v => v >= 10 ? '10+' : String(v)))
    : new Set(PUBLIC_MANA_VALUES);

  // One assignment, so the composable's deep watcher fires ONE query for the
  // whole modal rather than one per field.
  advancedFilters.value = {
    ...(updated.sets.length > 0 ? { edition: [...updated.sets] } : {}),
    ...(updated.keywords.length > 0 ? { keywords: [...updated.keywords] } : {}),
    ...(updated.formatLegal.length > 0 ? { formats: [...updated.formatLegal] } : {}),
    ...(updated.priceUSD.min !== undefined ? { minPrice: updated.priceUSD.min } : {}),
    ...(updated.priceUSD.max !== undefined ? { maxPrice: updated.priceUSD.max } : {}),
    ...(updated.power.min !== undefined ? { powerMin: updated.power.min } : {}),
    ...(updated.power.max !== undefined ? { powerMax: updated.power.max } : {}),
    ...(updated.toughness.min !== undefined ? { toughnessMin: updated.toughness.min } : {}),
    ...(updated.toughness.max !== undefined ? { toughnessMax: updated.toughness.max } : {}),
    ...(updated.isFoil ? { foil: true } : {}),
    ...(updated.isFullArt ? { fullArt: true } : {}),
  };
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

const resetAllChipFilters = () => {
  resetFilters();
};

// TASK-248 AC1: which empty/error/results state to render — see
// useProfileEmptyState.ts's header for why this is a pure function instead
// of inline template conditionals.
const profileEmptyState = computed(() => resolveProfileEmptyState({
  cardsError: cardsError.value,
  indexBuilt: indexBuilt.value,
  loadingPublicCards: loadingPublicCards.value,
  cardsLength: cards.value.length,
  searching: searching.value,
  activeFilterCount: activeFilterCount.value,
  filterQuery: filterQuery.value,
}));

// The "your filters matched nothing" empty state's own clear action — resets
// BOTH the chip filters (resetAllChipFilters/resetFilters) and the free-text
// search box, since either alone can be the reason cards.length is 0 here.
const clearAllProfileFilters = () => {
  resetFilters();
  filterQuery.value = '';
};

const getGroupCardCount = (groupCards: Card[]): number => {
  return groupCards.reduce((sum, card) => sum + (card.quantity || 1), 0);
};

// Track cards user already expressed interest in
const interestedCards = ref<Set<string>>(new Set());

const handleInterest = async (card: Card) => {
  if (!authStore.user || !userId.value) return;

  const cardKey = card.scryfallId || card.id;
  if (interestedCards.value.has(cardKey)) return;

  try {
    const scryfallId = card.scryfallId || '';
    const edition = card.edition || '';

    // Check for existing duplicate match (same sender, receiver, card, and edition)
    const sharedMatchesRef = collection(db, 'shared_matches');
    const existingQuery = query(
      sharedMatchesRef,
      where('senderId', '==', authStore.user.id),
      where('receiverId', '==', userId.value),
      where('card.scryfallId', '==', scryfallId)
    );
    const existingSnapshot = await getDocs(existingQuery);

    // Check if any existing match has the same edition (allow different prints)
    const hasDuplicate = existingSnapshot.docs.some(docSnap => {
      const data = docSnap.data() as Record<string, unknown>;
      return (data.card as Record<string, unknown> | undefined)?.edition === edition;
    });

    if (hasDuplicate) {
      console.info('[Interest] Duplicate match already exists, skipping');
      interestedCards.value.add(cardKey);
      toastStore.show(t('dashboard.interest.sent', { username: userInfo.value?.username ?? '' }), 'info');
      return;
    }

    const cardPrice = typeof card.price === 'number' ? card.price : 0;
    const cardData = {
      id: card.id || card.scryfallId,
      scryfallId,
      name: card.name || '',
      edition,
      quantity: card.quantity || 1,
      condition: card.condition || 'NM',
      foil: card.foil || false,
      price: cardPrice,
      image: card.image || '',
      status: card.status || 'collection',
    };

    const totalValue = cardPrice * (card.quantity || 1);

    // Create a SINGLE shared match visible to both users
    const sharedMatchPayload = {
      // Participants
      senderId: authStore.user.id,
      senderUsername: authStore.user.username,
      senderLocation: authStore.user.location ?? '',
      senderEmail: authStore.user.email ?? '',
      senderAvatarUrl: authStore.user.avatarUrl ?? null,
      receiverId: userId.value,
      receiverUsername: userInfo.value?.username ?? '',
      receiverLocation: userInfo.value?.location ?? '',
      receiverAvatarUrl: userInfo.value?.avatarUrl ?? null,
      // Card info
      card: cardData,
      cardType: card.status, // 'sale' or 'trade'
      totalValue,
      // Status
      status: 'pending', // pending -> accepted -> completed
      senderStatus: 'interested', // interested
      receiverStatus: 'new', // new -> seen -> responded
      // Timestamps
      createdAt: new Date(),
      lifeExpiresAt: getMatchExpirationDate(),
    };

    // Save to shared collection
    await addDoc(sharedMatchesRef, sharedMatchPayload);

    // Mark card as interested
    interestedCards.value.add(cardKey);
    toastStore.show(t('dashboard.interest.sent', { username: userInfo.value?.username ?? '' }), 'success');
  } catch (error) {
    console.error('Error sending interest:', error);
    toastStore.show(t('dashboard.interest.error'), 'error');
  }
};

// ========== EXCHANGE CART ==========
const handleAddToCart = (card: Card) => {
  cartStore.addItem(username.value, {
    scryfallId: card.scryfallId || '',
    cardId: card.id,
    name: card.name,
    edition: card.edition,
    quantity: 1,
    maxQuantity: card.quantity || 1,
    condition: card.condition || 'NM',
    foil: card.foil || false,
    price: card.price || 0,
    image: card.image || '',
    status: card.status || 'collection',
  }, card.setCode);
  toastStore.show(t('cart.inCart'), 'success');
};

const handleShareCart = async () => {
  const cart = cartStore.getCart(username.value);
  if (!cart || cart.items.length === 0) return;
  const baseUrl = window.location.origin;
  const result = await shareCart(username.value, cart.items, baseUrl);
  if (result === 'shared') toastStore.show(t('cart.shareSuccess'), 'success');
  else if (result === 'copied') toastStore.show(t('cart.shareCopied'), 'success');
  else toastStore.show(t('cart.shareError'), 'error');
};

// SCRUM-70.1: el visitante envía su carrito al dueño con sus datos de contacto.
// Persiste como buy request en /users/{ownerUid}/buyRequests con feedback explícito.
const handleSendRequest = async (contact: { name: string; phone: string; email: string }) => {
  const cart = cartStore.getCart(username.value);
  if (!cart || cart.items.length === 0 || !userId.value) return;

  const res = await buyRequestsStore.submitBuyRequest(userId.value, contact, cart.items);
  if (res.ok) {
    cartStore.clearCart(username.value);
    showCartDrawer.value = false;
    toastStore.show(t('cart.requestSent'), 'success');
  } else {
    toastStore.show(t('cart.requestError'), 'error');
  }
};

const handleLoginToMatch = () => {
  const profilePath = `/@${username.value}`;
  void router.push(buildLoginUrl(profilePath));
};

const handleRegisterToMatch = () => {
  const profilePath = `/@${username.value}`;
  void router.push(buildRegisterUrl(profilePath));
};

const convertCartToMatches = async () => {
  const cart = cartStore.getCart(username.value);
  if (!cart || cart.items.length === 0 || !authStore.user || isOwnProfile.value) return;

  const confirmed = await confirmStore.show({
    title: t('cart.convertTitle'),
    message: t('cart.convertMessage', { count: cart.items.length, username: username.value }),
  });
  if (!confirmed) return;

  let successCount = 0;
  for (const item of cart.items) {
    const matchingCard = cards.value.find(c =>
      (c.scryfallId === item.scryfallId || c.id === item.cardId) &&
      (c.status === 'sale' || c.status === 'trade')
    );
    if (!matchingCard) continue;
    try {
      await handleInterest(matchingCard);
      successCount++;
    } catch {
      // Continue on partial failures
    }
  }

  cartStore.clearCart(username.value);

  if (successCount === cart.items.length) {
    toastStore.show(t('cart.convertSuccess', { count: successCount }), 'success');
  } else if (successCount > 0) {
    toastStore.show(t('cart.convertPartial', { success: successCount, total: cart.items.length }), 'info');
  }
};

// Initialize on mount
onMounted(() => {
  void loadProfile();
});
</script>

<template>
  <AppContainer>
    <!-- User not found state -->
    <div v-if="userNotFound" class="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h2 class="text-h2 font-bold text-rust mb-4">{{ t('profile.notFound.title') }}</h2>
      <p class="text-body text-silver-70 mb-8 max-w-md">
        {{ t('profile.notFound.message', { username: username }) }}
      </p>
      <RouterLink v-if="authStore.user" to="/dashboard">
        <BaseButton>{{ t('profile.notFound.backToDashboard') }}</BaseButton>
      </RouterLink>
      <RouterLink v-else to="/login">
        <BaseButton>{{ t('profile.notFound.login') }}</BaseButton>
      </RouterLink>
    </div>

    <!-- Profile content -->
    <div v-else>
      <!-- Loading state -->
      <BaseLoader v-if="loading" size="large" class="min-h-[50vh] flex items-center justify-center" />

      <!-- Profile loaded -->
      <template v-else>
      <!-- Profile header -->
      <div class="flex flex-col md:flex-row md:items-start gap-5 mb-6 pb-6 border-b border-line">
        <img
            :src="profileAvatarUrl"
            alt=""
            class="w-16 h-16 md:w-[72px] md:h-[72px] rounded-full object-cover border-2 border-neon-40 shadow-glow-neon flex-shrink-0"
        />
        <div class="min-w-0 flex-1">
          <h1 class="font-display text-h2 md:text-h1 font-bold text-silver">
            @{{ userInfo?.username }}
          </h1>
          <p v-if="userInfo?.location" data-testid="profile-location" class="text-small text-silver-50 mt-1.5">
            {{ userInfo.location }}
          </p>
          <div class="flex gap-2.5 mt-4 flex-wrap">
            <div class="flex flex-col gap-0.5 px-4 py-2 bg-surface-1 border border-line rounded-lg">
              <span class="font-display font-tnum text-h3 font-bold leading-none text-silver">{{ saleCount }}</span>
              <span class="text-[11px] tracking-[.08em] uppercase text-silver-30 font-semibold">{{ t('profile.stats.sale') }}</span>
            </div>
            <div class="flex flex-col gap-0.5 px-4 py-2 bg-surface-1 border border-line rounded-lg">
              <span class="font-display font-tnum text-h3 font-bold leading-none text-silver">{{ tradeCount }}</span>
              <span class="text-[11px] tracking-[.08em] uppercase text-silver-30 font-semibold">{{ t('profile.stats.trade') }}</span>
            </div>
          </div>
        </div>

        <!-- Actions: Contact (for others) or Wishlist (for own profile) -->
        <div class="flex gap-3 md:ml-auto flex-shrink-0">
          <!-- Own profile: link to wishlist -->
          <RouterLink v-if="isOwnProfile" to="/collection?filter=wishlist">
            <BaseButton size="small" variant="secondary">
              <IconV2 name="star" :size="16" class="inline-block mr-1.5 align-[-3px]" />
              {{ t('profile.viewWishlist') }}
            </BaseButton>
          </RouterLink>

          <!-- Other profile: contact button -->
          <BaseButton
              v-if="authStore.user && !isOwnProfile"
              size="small"
              @click="userId && handleContact(userId, userInfo?.username ?? '')"
          >
            <IconV2 name="chat" :size="16" class="inline-block mr-1.5 align-[-3px]" />
            {{ t('profile.contact') }}
          </BaseButton>
        </div>
      </div>

      <!-- Empty state — "this profile publishes nothing" ONLY.
           A server-side search that returns zero hits also empties `cards`, and
           letting this branch win there unmounts the whole v-else subtree, which
           takes the search bar itself with it (leaving the visitor unable to clear
           the term) and collapses the document height so the browser clamps the
           window scroll to the top. Zero-hit searches fall through to the inner
           "no results after filtering" state below, which keeps the bar mounted. -->
      <!-- Query failure. Kept ABOVE the empty state on purpose: an error that
           falls through to "this user has no public cards" is an outage the
           visitor reads as an empty shop, and nobody reports it. -->
      <div v-if="cardsError" data-testid="profile-cards-error" class="bg-surface-1 border border-rust rounded-lg p-8 text-center">
        <p class="text-body text-rust mb-4">{{ t('profile.index.error') }}</p>
        <BaseButton size="small" @click="retryLoad">{{ t('profile.index.retry') }}</BaseButton>
      </div>

      <!-- The seller's index has never been built. Distinct from an empty
           profile on purpose: measured 2026-08-19, ZERO accounts had a built
           index in either project, so this is the state of every profile
           until the backfill runs — and falling through to "this seller has
           no public cards" while the header above still says "1703 for sale"
           is a contradiction the visitor can see. -->
      <div
          v-else-if="profileEmptyState === 'building'"
          data-testid="profile-index-building"
          class="bg-surface-1 border border-line rounded-lg p-8 text-center"
      >
        <p class="text-body text-silver-70">
          {{ t('profile.index.building') }}
        </p>
      </div>

      <!-- TASK-248 AC1: truly zero public cards, no filter or search active.
           Kept separate from the "filter matched nothing" state below (which
           needs the search bar to stay mounted) via resolveProfileEmptyState
           — see that module's header for why the two were indistinguishable
           before this ticket. -->
      <div v-else-if="profileEmptyState === 'empty'" data-testid="profile-no-public-cards" class="bg-surface-1 border border-line rounded-lg p-8 text-center">
        <p class="text-body text-silver-70">
          {{ t('profile.noPublicCards') }}
        </p>
      </div>

      <!-- Public collection -->
      <div v-else>
        <div class="flex items-end justify-between gap-4 flex-wrap mb-4">
          <h2 class="font-display text-h2 font-bold text-silver">
            {{ t('profile.publicCollection') }}
            <!-- The count is the number of matching documents in the WHOLE
                 public collection, which is the entire point of TASK-247 —
                 never cards.length, which is one page. `null` means the index
                 is mid-rebuild and the server refused to name a number; we
                 say "updating" rather than invent one. -->
            <span
                data-testid="profile-result-total"
                class="font-display font-tnum text-h3 font-normal text-silver-50 ml-2"
            >{{ filteredTotal === null ? t('profile.index.unknownTotal') : filteredTotal }}</span>
          </h2>
          <span class="text-tiny text-silver-30">{{ t('profile.publicPricesUsd') }}</span>
        </div>

        <!-- Search & filter bar -->
        <CardFilterBar
            v-model:filter-query="filterQuery"
            v-model:sort-by="sortBy"
            v-model:group-by="groupBy"
            :v2="true"
            :show-advanced-filters="true"
            :active-filter-count="activeFilterCount"
            :show-suggestions="false"
            @open-filters="showFilters = true"
        />

        <!-- The index is mid-rebuild: counts are withheld, not guessed. -->
        <p v-if="indexPartial" data-testid="profile-index-partial" class="mt-3 text-small text-silver-70 bg-surface-1 border border-line rounded-lg px-4 py-3">
          {{ t('profile.index.updating') }}
        </p>

        <!-- Cards a colour or keyword filter dropped for having no colour or
             keyword data (TASK-247 AC9 / TASK-248 AC5). Without this line
             they simply vanish when a chip is pressed, which is
             indistinguishable from the seller not owning them. -->
        <p v-if="dataUnknownExcluded" data-testid="profile-data-unknown" class="mt-3 text-small text-silver-50">
          {{ t('profile.index.dataUnknownExcluded', { count: dataUnknownExcluded }) }}
        </p>

        <AdvancedFilterModal
            :show="showFilters"
            :filters="localAdvancedFilters"
            mode="local"
            :local-sets="collectionSets"
            :local-creature-types="[]"
            @close="showFilters = false"
            @update:filters="handleLocalFiltersUpdate"
            @reset="resetAllChipFilters"
        />

        <!-- TASK-248 AC1: no results after filtering — reached only when
             `profileEmptyState` is 'filtered-empty' or 'results'; if we are
             here with zero cards, a filter or search IS active (the 'empty'
             branch above already claimed the truly-empty case), so this is
             ALWAYS "your filters matched nothing", never "this seller
             publishes nothing". Distinct message and testid from
             profile-no-public-cards on purpose — reusing the same key here
             is the exact regression this ticket fixed (see
             tests/unit/views/userProfileEmptyStateKeys.test.ts). -->
        <div v-if="cards.length === 0" data-testid="profile-filtered-empty" class="bg-surface-1 border border-line rounded-lg p-8 text-center">
          <p class="text-body text-silver-70 mb-4">
            {{ t('collection.empty.noFilterResults') }}
          </p>
          <BaseButton size="small" data-testid="profile-clear-filters" @click="clearAllProfileFilters">
            {{ t('collection.empty.clearFilters') }}
          </BaseButton>
        </div>

        <!-- LOW-5 (ronda 2): every chip press is a server round-trip and the
             grid gave no sign of it — the old cards simply sat there until the
             new answer replaced them, which reads as "the chip did nothing".
             Template-only: the grid dims and stops taking clicks while the
             query is in flight, and `aria-busy` says the same thing to a
             screen reader. `loading` covers chips/filters/sort, `searching`
             covers the debounced search box. -->
        <div
            v-else
            class="space-y-8 transition-opacity duration-150"
            :class="{ 'opacity-50 pointer-events-none': loadingPublicCards || searching }"
            :aria-busy="loadingPublicCards || searching"
        >
          <!-- Grouped view -->
          <div v-for="group in groupedCards" :key="group.type" class="mb-6">
            <!-- Category Header (hidden when no grouping) -->
            <div v-if="group.type !== 'all'" class="flex items-center gap-2 mb-3 pb-2 border-b border-line">
              <h4 class="font-display text-tiny font-bold text-neon uppercase tracking-wide">{{ translateCategory(group.type) }}</h4>
              <span class="text-tiny text-silver-50">({{ getGroupCardCount(group.cards) }})</span>
            </div>
            <!-- TASK-138 AC2: previously on-load-more was only wired for the
                 ungrouped ('all') grid, so any groupBy left the view
                 permanently truncated at whatever page(s) had already
                 loaded — infinite scroll never fired for a grouped grid.
                 CollectionGrid's onLoadMore is a per-instance window-scroll
                 listener (useVirtualGrid.ts) guarded by usePublicProfileCards'
                 own loadingMore/hasMore flags, so wiring it to every group
                 (not just 'all') is safe: multiple groups near the bottom of
                 the page may each fire loadMorePublicCards() in the same
                 scroll tick, but the composable's synchronous loadingMore
                 guard (set before the first await) collapses them into a
                 single in-flight request. Chosen over a "load all" button —
                 no extra UI needed, CollectionGrid already supported it. -->
            <CollectionGrid
                :cards="group.cards"
                :readonly="true"
                :show-interest="canShowInterest"
                :interested-cards="interestedCards"
                :show-cart="showCartMode"
                :cart-item-ids="cartItemIds"
                :on-load-more="loadMorePublicCards"
                :loading-more="loadingMorePublicCards"
                @interest="handleInterest"
                @add-to-cart="handleAddToCart"
            />
          </div>
        </div>
      </div>

      <!-- Chat Modal -->
      <ChatModal
          :show="showChat"
          :other-user-id="selectedUserId"
          :other-username="selectedUsername"
          @close="handleCloseChat"
      />
      </template>
    </div>

    <!-- Exchange Cart (anonymous users only) -->
    <CartFab
        v-if="showCartMode"
        :item-count="cartItemCount"
        @toggle="showCartDrawer = !showCartDrawer"
    />
    <ExchangeCartDrawer
        v-if="showCartMode"
        :username="username"
        :show="showCartDrawer"
        @close="showCartDrawer = false"
        @share="handleShareCart"
        @send-request="handleSendRequest"
        @login-to-match="handleLoginToMatch"
        @register-to-match="handleRegisterToMatch"
    />
  </AppContainer>
</template>