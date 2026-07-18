<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHead, useSeoMeta } from '@unhead/vue';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { resolveUsernameToUid } from '../services/userLookup';
import { getCardsByIds } from '../services/scryfallCache';
import { buildEnrichmentPatch, needsEnrichment } from '../utils/cardEnrichment';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { useConfirmStore } from '../stores/confirm';
import { useExchangeCartStore } from '../stores/exchangeCart';
import { useBuyRequestsStore } from '../stores/buyRequests';
import { useI18n } from '../composables/useI18n';
import { buildLoginUrl, buildRegisterUrl } from '../composables/useReturnUrl';
import { colorOrder, manaOrder, rarityOrder, typeOrder, useCardFilter } from '../composables/useCardFilter';
import { usePublicProfileCards } from '../composables/usePublicProfileCards';
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

// TASK-136 (round 2, M1/M4): server-side-paginated /public_cards state, with
// a cross-profile generation guard (composables/usePublicProfileCards.ts) so
// a loadMore()/status-count response in flight for a previous profile can
// never append cards or overwrite the header stats after the visitor has
// already navigated to a different profile. saleCount/tradeCount come from a
// decoupled Firestore aggregate count query — exact totals, not just
// whatever page(s) have been scrolled into view (design→app v2 F8,
// cranial-design/prototype/22-user-profile-*.html for the chip UI).
const {
  cards,
  loadingMore: loadingMorePublicCards,
  saleCount,
  tradeCount,
  loadFirstPage: loadFirstPublicCardsPage,
  loadMore: loadMorePublicCardsRaw,
  setSearchTerm: setPublicCardsSearchTerm,
} = usePublicProfileCards({
  onError: () => toastStore.show(t('profile.messages.loadCardsError'), 'error'),
  onPageLoaded: () => void enrichPublicCardsInMemory(),
});

const loadMorePublicCards = () => {
  if (!userId.value) return;
  void loadMorePublicCardsRaw(userId.value);
};

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
      await loadFirstPublicCardsPage(userId.value);
      // TASK-138 AC1: a search term left over from a previously viewed
      // profile (filterQuery persists across route changes — same
      // component instance) must be re-applied to the NEW profile's
      // userId, since setSearchTerm is scoped per-call, not reactive to
      // userId on its own. loadFirstPublicCardsPage above already reset
      // to page 1; this re-triggers the debounced server search on top.
      if (filterQuery.value.trim()) {
        setPublicCardsSearchTerm(userId.value, filterQuery.value);
      }
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

// SCRUM-67: in-memory, read-only enrichment of the public cards so advanced
// filters have the metadata they depend on. Batches the Scryfall fetch via the
// same cache-backed service the collection store uses. Does NOT persist.
const enrichPublicCardsInMemory = async () => {
  const toEnrich = cards.value.filter(needsEnrichment);
  if (toEnrich.length === 0) return;

  const identifiers = toEnrich.map(c => ({ id: c.scryfallId }));
  let scryfallCards;
  try {
    scryfallCards = await getCardsByIds(identifiers);
  } catch (err) {
    console.warn('[SCRUM-67] Public-card enrichment fetch failed:', err);
    return;
  }
  if (scryfallCards.length === 0) return;

  const scryfallMap = new Map(scryfallCards.map(sc => [sc.id, sc]));

  // Build a fresh array so useCardFilter (which watches `cards`) recomputes.
  let patched = false;
  const next = cards.value.map(card => {
    if (!needsEnrichment(card)) return card;
    const sc = scryfallMap.get(card.scryfallId);
    if (!sc) return card;
    const patch = buildEnrichmentPatch(card, sc as unknown as Record<string, unknown>);
    if (Object.keys(patch).length === 0) return card;
    patched = true;
    return { ...card, ...patch };
  });

  if (patched) cards.value = next;
};

const handleContact = (id: string, username: string) => {
  selectedUserId.value = id;
  selectedUsername.value = username;
  showChat.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};

// ========== FILTER COMPOSABLE ==========
const {
  filterQuery,
  sortBy,
  groupBy,
  selectedColors,
  exactColorMode,
  selectedManaValues,
  selectedTypes,
  selectedRarities,
  filteredCards,
  groupedCards,
  translateCategory,
  // Advanced filters
  advPriceMin,
  advPriceMax,
  advFoilFilter,
  advSelectedSets,
  advSelectedKeywords,
  advSelectedFormats,
  advSelectedCreatureTypes,
  advFullArtOnly,
  advPowerMin,
  advPowerMax,
  advToughnessMin,
  advToughnessMax,
  advancedFilterCount,
  collectionSets,
  collectionCreatureTypes,
  resetAdvancedFilters,
} = useCardFilter(cards);

// TASK-138 AC1: wire the filter bar's text search to the server-side prefix
// query (usePublicProfileCards.setSearchTerm) instead of only filtering
// whatever page(s) had already loaded — a term ≥2 chars replaces `cards`
// with the matching results from the WHOLE profile (debounced, gen-token
// guarded inside the composable). useCardFilter's own local text filter
// (filteredCards) still runs on top of the result but is a no-op there,
// since every server-matched card's name already contains the term. Below
// 2 chars, the composable falls back to normal pagination on its own.
// Advanced/chip filters and groupBy stay local to whatever `cards` currently
// holds (search results OR paginated cards) — they never reach past what's
// loaded, a documented limit of this approach. LOW (review addendum): the
// server search is a cardNameLower PREFIX match only — a card that used to
// surface via useCardFilter's local substring-on-name-or-edition check
// (mid-word match, or a match on `edition`) will not be found once search
// mode kicks in; only whole-profile prefix-on-name reach is in scope here.
watch(filterQuery, (term) => {
  if (!userId.value) return;
  setPublicCardsSearchTerm(userId.value, term);
});

// Bridge: individual refs <-> AdvancedFilters for the modal
const colorToModal: Record<string, string> = { White: 'w', Blue: 'u', Black: 'b', Red: 'r', Green: 'g', Colorless: 'c' };
const colorFromModal: Record<string, string> = { w: 'White', u: 'Blue', b: 'Black', r: 'Red', g: 'Green', c: 'Colorless' };
const typeToModal: Record<string, string> = { Creatures: 'creature', Instants: 'instant', Sorceries: 'sorcery', Enchantments: 'enchantment', Artifacts: 'artifact', Planeswalkers: 'planeswalker', Lands: 'land' };
const typeFromModal: Record<string, string> = { creature: 'Creatures', instant: 'Instants', sorcery: 'Sorceries', enchantment: 'Enchantments', artifact: 'Artifacts', planeswalker: 'Planeswalkers', land: 'Lands' };
const rarityToModal: Record<string, string> = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Mythic: 'mythic' };
const rarityFromModal: Record<string, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic' };

const localAdvancedFilters = computed<AdvancedFilters>(() => ({
  colors: selectedColors.value.size < colorOrder.length
    // eslint-disable-next-line security/detect-object-injection
    ? [...selectedColors.value].map(c => colorToModal[c]).filter(Boolean) as string[]
    : [],
  types: selectedTypes.value.size < typeOrder.length
    // eslint-disable-next-line security/detect-object-injection
    ? [...selectedTypes.value].map(t => typeToModal[t]).filter(Boolean) as string[]
    : [],
  manaValue: selectedManaValues.value.size < manaOrder.length
    ? { values: [...selectedManaValues.value].map(v => v === '10+' ? 10 : Number.parseInt(v, 10)).filter(v => !Number.isNaN(v)) }
    : { min: undefined, max: undefined, values: undefined },
  rarity: selectedRarities.value.size < rarityOrder.length
    // eslint-disable-next-line security/detect-object-injection
    ? [...selectedRarities.value].map(r => rarityToModal[r]).filter(Boolean) as string[]
    : [],
  sets: advSelectedSets.value,
  power: { min: advPowerMin.value, max: advPowerMax.value },
  toughness: { min: advToughnessMin.value, max: advToughnessMax.value },
  formatLegal: advSelectedFormats.value,
  priceUSD: { min: advPriceMin.value, max: advPriceMax.value },
  keywords: advSelectedKeywords.value,
  creatureTypes: advSelectedCreatureTypes.value,
  isFoil: advFoilFilter.value === 'foil',
  isFullArt: advFullArtOnly.value,
}));

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, security/detect-object-injection */
const handleLocalFiltersUpdate = (updated: AdvancedFilters) => {
  advSelectedSets.value = [...updated.sets];
  advSelectedKeywords.value = [...updated.keywords];
  advSelectedFormats.value = [...updated.formatLegal];
  advSelectedCreatureTypes.value = [...(updated.creatureTypes ?? [])];
  advPriceMin.value = updated.priceUSD.min;
  advPriceMax.value = updated.priceUSD.max;
  advPowerMin.value = updated.power.min;
  advPowerMax.value = updated.power.max;
  advToughnessMin.value = updated.toughness.min;
  advToughnessMax.value = updated.toughness.max;
  advFoilFilter.value = updated.isFoil ? 'foil' : 'any';
  advFullArtOnly.value = updated.isFullArt;
  if (updated.manaValue.values?.length) {
    const mapped = updated.manaValue.values.map(v => v === 10 ? '10+' : String(v));
    selectedManaValues.value = new Set(mapped);
  } else {
    selectedManaValues.value = new Set(manaOrder);
  }
  const mappedColors = updated.colors.map(c => colorFromModal[c]).filter((v): v is string => !!v);
  selectedColors.value = new Set(mappedColors.length > 0 ? mappedColors : colorOrder);
  const mappedTypes = updated.types.map(t => typeFromModal[t]).filter((v): v is string => !!v);
  selectedTypes.value = new Set(mappedTypes.length > 0 ? mappedTypes : typeOrder);
  const mappedRarities = updated.rarity.map(r => rarityFromModal[r]).filter((v): v is string => !!v);
  selectedRarities.value = new Set(mappedRarities.length > 0 ? mappedRarities : rarityOrder);
};
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, security/detect-object-injection */

const activeChipFilterCount = computed(() => {
  let count = 0;
  if (selectedColors.value.size < colorOrder.length) count++;
  if (selectedManaValues.value.size < manaOrder.length) count++;
  if (selectedTypes.value.size < typeOrder.length) count++;
  if (selectedRarities.value.size < rarityOrder.length) count++;
  count += advancedFilterCount.value;
  return count;
});

const resetAllChipFilters = () => {
  selectedColors.value = new Set(colorOrder);
  selectedManaValues.value = new Set(manaOrder);
  selectedTypes.value = new Set(typeOrder);
  selectedRarities.value = new Set(rarityOrder);
  resetAdvancedFilters();
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

      <!-- Empty state -->
      <div v-if="cards.length === 0" class="bg-surface-1 border border-line rounded-lg p-8 text-center">
        <p class="text-body text-silver-70">
          {{ t('profile.noPublicCards') }}
        </p>
      </div>

      <!-- Public collection -->
      <div v-else>
        <div class="flex items-end justify-between gap-4 flex-wrap mb-4">
          <h2 class="font-display text-h2 font-bold text-silver">
            {{ t('profile.publicCollection') }}
            <span class="font-display font-tnum text-h3 font-normal text-silver-50 ml-2">{{ filteredCards.length }}</span>
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
            :active-filter-count="activeChipFilterCount"
            :show-suggestions="false"
            @open-filters="showFilters = true"
        />

        <AdvancedFilterModal
            :show="showFilters"
            :filters="localAdvancedFilters"
            mode="local"
            :local-sets="collectionSets"
            :local-creature-types="collectionCreatureTypes"
            :exact-color-mode="exactColorMode"
            @close="showFilters = false"
            @update:filters="handleLocalFiltersUpdate"
            @update:exact-color-mode="exactColorMode = $event"
            @reset="resetAllChipFilters"
        />

        <!-- No results after filtering -->
        <div v-if="filteredCards.length === 0" class="bg-surface-1 border border-line rounded-lg p-8 text-center">
          <p class="text-body text-silver-70">
            {{ t('profile.noPublicCards') }}
          </p>
        </div>

        <div v-else class="space-y-8">
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