<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { addDoc, collection, getDocs, getDocsFromServer, limit, query, where } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
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
  return getAvatarUrlForUser(userInfo.value?.username || '', 64, userInfo.value?.avatarUrl);
});

// Watchers
watch(() => route.params.username, (v) => {
  username.value = v as string;
  loadProfile();
});

// Helper: query Firestore for user by username with retry logic
// Retries handle: Firestore SDK auth-sync delay, transient errors, AND empty results
// (anonymous users may get empty results on first query if SDK hasn't synced auth state)
const findUserByUsername = async (uname: string): Promise<{ id: string; data: any } | null> => {
  // Ensure Firebase Auth state is fully resolved before querying Firestore
  // This is critical for anonymous users — without this, the Firestore SDK
  // may not know the auth state and could return empty results or fail
  try {
    await auth.authStateReady();
  } catch {
    // authStateReady might not exist in older SDK versions, continue anyway
  }

  // Use getDocsFromServer to bypass SDK memory cache (which returns empty for anonymous users)
  const usersCol = collection(db, 'users');
  const q = query(usersCol, where('username', '==', uname), limit(1));
  try {
    const snapshot = await getDocsFromServer(q);
    const firstDoc = snapshot.docs[0];
    if (!snapshot.empty && firstDoc) {
      return { id: firstDoc.id, data: firstDoc.data() };
    }
  } catch (err) {
    // Fallback to getDocs if getDocsFromServer fails (e.g. offline)
    console.warn('[Profile] getDocsFromServer failed, falling back to getDocs:', err);
    try {
      const snapshot = await getDocs(q);
      const firstDoc = snapshot.docs[0];
      if (!snapshot.empty && firstDoc) {
        return { id: firstDoc.id, data: firstDoc.data() };
      }
    } catch (fallbackErr) {
      console.error('[Profile] getDocs fallback also failed:', fallbackErr);
      throw fallbackErr;
    }
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
      userInfo.value = result.data as any;
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
    convertCartToMatches();
  }
};

const loadAllPublicCards = async () => {
  if (!userId.value) return;

  try {
    const cardsCol = collection(db, 'users', userId.value, 'cards');
    const snapshot = await getDocs(query(cardsCol));

    // Filter: show public cards (sale/trade/wishlist only, never collection)
    cards.value = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }) as Card)
      .filter((card: any) =>
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
    ? [...selectedColors.value].map(c => colorToModal[c]).filter(Boolean) as string[]
    : [],
  types: selectedTypes.value.size < typeOrder.length
    ? [...selectedTypes.value].map(t => typeToModal[t]).filter(Boolean) as string[]
    : [],
  manaValue: selectedManaValues.value.size < manaOrder.length
    ? { values: [...selectedManaValues.value].map(v => v === '10+' ? 10 : Number.parseInt(v)).filter(v => !Number.isNaN(v)) }
    : { min: undefined, max: undefined, values: undefined },
  rarity: selectedRarities.value.size < rarityOrder.length
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

const handleLocalFiltersUpdate = (updated: AdvancedFilters) => {
  advSelectedSets.value = [...updated.sets];
  advSelectedKeywords.value = [...updated.keywords];
  advSelectedFormats.value = [...updated.formatLegal];
  advSelectedCreatureTypes.value = [...(updated.creatureTypes || [])];
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
      const data = docSnap.data();
      return data.card?.edition === edition;
    });

    if (hasDuplicate) {
      console.log('[Interest] Duplicate match already exists, skipping');
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
      senderLocation: authStore.user.location || '',
      senderEmail: authStore.user.email || '',
      senderAvatarUrl: authStore.user.avatarUrl || null,
      receiverId: userId.value,
      receiverUsername: userInfo.value?.username || '',
      receiverLocation: userInfo.value?.location || '',
      receiverAvatarUrl: (userInfo.value as any)?.avatarUrl || null,
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
  router.push(buildLoginUrl(profilePath));
};

const handleRegisterToMatch = () => {
  const profilePath = `/@${username.value}`;
  router.push(buildRegisterUrl(profilePath));
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
  loadProfile();
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
              @click="handleContact(userId!, userInfo?.username || '')"
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