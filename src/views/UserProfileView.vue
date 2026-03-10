<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { addDoc, collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { useConfirmStore } from '../stores/confirm';
import { useExchangeCartStore } from '../stores/exchangeCart';
import { useI18n } from '../composables/useI18n';
import { buildLoginUrl, buildRegisterUrl } from '../composables/useReturnUrl';
import { colorOrder, manaOrder, rarityOrder, typeOrder, useCardFilter } from '../composables/useCardFilter';
import { shareCart } from '../utils/exchangeCartShare';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import CartFab from '../components/cart/CartFab.vue';
import CollectionGrid from '../components/collection/CollectionGrid.vue';
import CardFilterBar from '../components/ui/CardFilterBar.vue';
import AdvancedFilterModal, { type AdvancedFilters } from '../components/search/AdvancedFilterModal.vue';
import ChatModal from '../components/chat/ChatModal.vue';
import ExchangeCartDrawer from '../components/cart/ExchangeCartDrawer.vue';
import type { Card } from '../types/card';
import { getAvatarUrlForUser } from '../utils/avatar';

// Firestore REST API types
interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: string;
  timestampValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

interface FirestoreRestDoc {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreRestQueryResult {
  document?: FirestoreRestDoc;
}

interface FirestoreRestListResult {
  documents?: FirestoreRestDoc[];
  nextPageToken?: string;
}

const route = useRoute();
const router = useRouter();
const toastStore = useToastStore();
const authStore = useAuthStore();
const confirmStore = useConfirmStore();
const cartStore = useExchangeCartStore();
const { t } = useI18n();

// State refs
const username = ref<string>(route.params.username as string || '');
const userId = ref<string | null>(null);
const userInfo = ref<{ username?: string; location?: string; avatarUrl?: string | null } | null>(null);
const cards = ref<Card[]>([]);
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

// Watchers
watch(() => route.params.username, (v) => {
  username.value = v as string;
  void loadProfile();
});

// Convert Firestore REST API value format to plain JS values
// e.g. {stringValue: "foo"} → "foo", {arrayValue: {values: [{stringValue: "W"}]}} → ["W"]
const parseFirestoreValue = (v: FirestoreValue): unknown => {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) {
    return (v.arrayValue.values ?? []).map(parseFirestoreValue);
  }
  if (v.mapValue !== undefined) {
    const result: Record<string, unknown> = {};
    for (const [k, mv] of Object.entries(v.mapValue.fields ?? {})) {
      // eslint-disable-next-line security/detect-object-injection
      result[k] = parseFirestoreValue(mv);
    }
    return result;
  }
  return v;
};

const parseFirestoreDoc = (fields: Record<string, FirestoreValue>): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    // eslint-disable-next-line security/detect-object-injection
    data[key] = parseFirestoreValue(val);
  }
  return data;
};

// Helper: query Firestore for user by username
// Anonymous users use the Firestore REST API directly to bypass SDK bugs
// (SDK v11 getDocsFromServer fails and getDocs returns empty for unauthenticated queries)
const findUserByUsername = async (uname: string): Promise<{ id: string; data: Record<string, unknown> } | null> => {
  // Anonymous path: use Firestore REST API (100% reliable without auth)
  if (!authStore.user) {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'username' },
            op: 'EQUAL',
            value: { stringValue: uname },
          },
        },
        limit: 1,
      },
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`Firestore REST query failed: ${resp.status}`);
    }

    const results = await resp.json() as FirestoreRestQueryResult[];
    const doc = results[0]?.document;
    if (!doc) return null;

    // Parse document: name is "projects/.../documents/users/USER_ID"
    const nameParts = doc.name.split('/');
    const docId = nameParts[nameParts.length - 1] ?? '';
    return { id: docId, data: parseFirestoreDoc(doc.fields ?? {}) };
  }

  // Authenticated path: use SDK (works fine for logged-in users)
  const usersCol = collection(db, 'users');
  const q = query(usersCol, where('username', '==', uname), limit(1));
  const snapshot = await getDocs(q);
  const firstDoc = snapshot.docs[0];
  if (!snapshot.empty && firstDoc) {
    return { id: firstDoc.id, data: firstDoc.data() as Record<string, unknown> };
  }
  return null;
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

    // Load all cards at once, then filter for public ones client-side
    cards.value = [];
    await loadAllPublicCards();
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

const loadAllPublicCards = async () => {
  if (!userId.value) return;

  try {
    // Anonymous path: use Firestore REST API (same reason as findUserByUsername)
    if (!authStore.user) {
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const allCards: Card[] = [];
      let pageToken: string | undefined;

      do {
        let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId.value}/cards?pageSize=300`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Firestore REST cards query failed: ${resp.status}`);

        const data = await resp.json() as FirestoreRestListResult;
        const docs = data.documents ?? [];

        for (const doc of docs) {
          const nameParts = doc.name.split('/');
          const docId = nameParts[nameParts.length - 1] ?? '';
          const card = { id: docId, ...parseFirestoreDoc(doc.fields ?? {}) };
          allCards.push(card as Card);
        }

        pageToken = data.nextPageToken;
      } while (pageToken);

      cards.value = allCards.filter((card: Card) =>
        card.status !== 'collection' && card.public !== false
      );
      return;
    }

    // Authenticated path: use SDK
    const cardsCol = collection(db, 'users', userId.value, 'cards');
    const snapshot = await getDocs(query(cardsCol));

    // Filter: show public cards (sale/trade/wishlist only, never collection)
    cards.value = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }) as Card)
      .filter((card: Card) =>
        card.status !== 'collection' && card.public !== false
      );
  } catch (err) {
    console.error('Error loading cards:', err);
    toastStore.show(t('profile.messages.loadCardsError'), 'error');
  }
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

    const MATCH_LIFETIME_DAYS = 15;
    const getExpirationDate = () => {
      const date = new Date();
      date.setDate(date.getDate() + MATCH_LIFETIME_DAYS);
      return date;
    };

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
      lifeExpiresAt: getExpirationDate(),
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
  });
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
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 pb-8 border-b border-silver-20">
        <div class="flex items-center gap-4">
          <img
              :src="profileAvatarUrl"
              alt=""
              class="w-16 h-16 rounded-full object-cover"
          />
          <div>
            <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">
              @{{ userInfo?.username }}
            </h1>
            <p class="text-body text-silver-70 flex items-center gap-2">
              📍 {{ userInfo?.location || 'Ubicación no disponida' }}
            </p>
          </div>
        </div>

        <!-- Actions: Contact (for others) or Wishlist (for own profile) -->
        <div class="flex gap-3">
          <!-- Own profile: link to wishlist -->
          <RouterLink v-if="isOwnProfile" to="/collection?filter=wishlist">
            <BaseButton size="small" variant="secondary">
              ⭐ {{ t('profile.viewWishlist') }}
            </BaseButton>
          </RouterLink>

          <!-- Other profile: contact button -->
          <BaseButton
              v-if="authStore.user && !isOwnProfile"
              size="small"
              @click="userId && handleContact(userId, userInfo?.username ?? '')"
          >
            {{ t('profile.contact') }}
          </BaseButton>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="cards.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">
          {{ t('profile.noPublicCards') }}
        </p>
      </div>

      <!-- Public collection -->
      <div v-else>
        <h2 class="text-h3 font-bold text-silver mb-6">
          {{ t('profile.publicCollection') }}
          <span class="text-small text-silver-70 font-normal ml-2">({{ filteredCards.length }} {{ t('profile.cards') }})</span>
        </h2>

        <!-- Search & filter bar -->
        <CardFilterBar
            v-model:filter-query="filterQuery"
            v-model:sort-by="sortBy"
            v-model:group-by="groupBy"
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
        <div v-if="filteredCards.length === 0" class="border border-silver-30 p-8 text-center">
          <p class="text-body text-silver-70">
            {{ t('profile.noPublicCards') }}
          </p>
        </div>

        <div v-else class="space-y-8">
          <!-- Grouped view -->
          <div v-for="group in groupedCards" :key="group.type" class="mb-6">
            <!-- Category Header (hidden when no grouping) -->
            <div v-if="group.type !== 'all'" class="flex items-center gap-2 mb-3 pb-2 border-b border-silver-20">
              <h4 class="text-tiny font-bold text-neon uppercase">{{ translateCategory(group.type) }}</h4>
              <span class="text-tiny text-silver-50">({{ getGroupCardCount(group.cards) }})</span>
            </div>
            <CollectionGrid
                :cards="group.cards"
                :readonly="true"
                :show-interest="canShowInterest"
                :interested-cards="interestedCards"
                :show-cart="showCartMode"
                :cart-item-ids="cartItemIds"
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
        @login-to-match="handleLoginToMatch"
        @register-to-match="handleRegisterToMatch"
    />
  </AppContainer>
</template>