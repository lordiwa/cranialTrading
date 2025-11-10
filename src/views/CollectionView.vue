<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import CollectionGrid from '../components/collection/CollectionGrid.vue';
import AddCardModal from '../components/collection/AddCardModal.vue';
import EditCardModal from '../components/collection/EditCardModal.vue';
import CardStatusModal from '../components/collection/CardStatusModal.vue';
import ImportDeckModal from '../components/collection/ImportDeckModal.vue';
import ImportProgressToast from '../components/collection/ImportProgressToast.vue';
import ImportResultModal from '../components/collection/ImportResultModal.vue';
import { useCollectionStore } from '../stores/collection';
import { usePreferencesStore } from '../stores/preferences';
import { Card, CardCondition, CardStatus } from '../types/card';

const collectionStore = useCollectionStore();
const preferencesStore = usePreferencesStore();
const showAddModal = ref(false);
const showEditModal = ref(false);
const showStatusModal = ref(false);
const showImportModal = ref(false);
const showProgressToast = ref(false);
const showResultModal = ref(false);
const editingCard = ref<Card | null>(null);
const selectedCard = ref<Card | null>(null);
const filterQuery = ref('');
const statusFilter = ref<'all' | CardStatus>('all');
const deckFilter = ref<string>('all');

// Import state
const importProgress = ref({ current: 0, total: 0 });
const importResult = ref({
  success: 0,
  failed: 0,
  total: 0,
  errors: [] as string[],
  processedCards: [] as any[]
});

onMounted(() => {
  collectionStore.loadCollection();
});

const uniqueDecks = computed(() => {
  const decks = new Set<string>();
  collectionStore.cards.forEach(card => {
    if (card.deckName) {
      decks.add(card.deckName);
    }
  });
  return Array.from(decks).sort();
});

const filteredCards = computed(() => {
  let cards = collectionStore.cards;

  // Filter by status
  if (statusFilter.value !== 'all') {
    cards = cards.filter(card => card.status === statusFilter.value);
  }

  // Filter by deck
  if (deckFilter.value !== 'all') {
    cards = cards.filter(card => card.deckName === deckFilter.value);
  }

  // Filter by search query
  if (filterQuery.value) {
    const query = filterQuery.value.toLowerCase();
    cards = cards.filter(card =>
        card.name.toLowerCase().includes(query) ||
        card.edition.toLowerCase().includes(query) ||
        (card.deckName && card.deckName.toLowerCase().includes(query))
    );
  }

  return cards;
});

const collectionCount = computed(() => collectionStore.cards.filter(c => c.status === 'collection').length);
const sellCount = computed(() => collectionStore.cards.filter(c => c.status === 'sell').length);
const tradeCount = computed(() => collectionStore.cards.filter(c => c.status === 'trade').length);
const buscoCount = computed(() => collectionStore.cards.filter(c => c.status === 'busco').length);

// Totals (counts are number of card entries)
const totalCardCount = computed(() => collectionStore.cards.length);
const collectionCardCount = computed(() => collectionStore.cards.filter(c => c.status === 'collection').length);
const remainderCount = computed(() => totalCardCount.value - (collectionCardCount.value + buscoCount.value));


// Costs: deck total (for selected deck if any, otherwise overall) and busco cost (filtered by deck if selected)
const deckTotalCost = computed(() => {
  const cards = deckFilter.value !== 'all'
    ? collectionStore.cards.filter(c => c.deckName === deckFilter.value)
    : collectionStore.cards;
  return cards.reduce((sum, c) => sum + ((c.price || 0) * (c.quantity || 0)), 0);
});

const buscoTotalCost = computed(() => {
  const cards = deckFilter.value !== 'all'
    ? collectionStore.cards.filter(c => c.deckName === deckFilter.value && c.status === 'busco')
    : collectionStore.cards.filter(c => c.status === 'busco');
  return cards.reduce((sum, c) => sum + ((c.price || 0) * (c.quantity || 0)), 0);
});

const deckTotalCostFormatted = computed(() => deckTotalCost.value ? deckTotalCost.value.toFixed(2) : '0.00');
const buscoTotalCostFormatted = computed(() => buscoTotalCost.value ? buscoTotalCost.value.toFixed(2) : '0.00');

const handleCardClick = (card: Card) => {
  selectedCard.value = card;
  showStatusModal.value = true;
};

const handleUpdateStatus = async (newStatus: CardStatus) => {
  if (!selectedCard.value) return;

  const oldStatus = selectedCard.value.status;

  // Update card status
  await collectionStore.updateCard(selectedCard.value.id, { status: newStatus });

  // Handle preference creation/deletion
  if (oldStatus !== 'collection' && newStatus === 'collection') {
    // Removed from sell/trade/busco -> delete preference
    await preferencesStore.deletePreferenceByCard(selectedCard.value.scryfallId, selectedCard.value.edition);
  } else if (oldStatus === 'collection' && newStatus !== 'collection') {
    // Added to sell/trade/busco -> create preference
    let prefType: any;
    if (newStatus === 'sell') prefType = 'VENDO';
    else if (newStatus === 'trade') prefType = 'CAMBIO';
    else if (newStatus === 'busco') prefType = 'BUSCO';
    else prefType = 'VENDO';
    await preferencesStore.addPreference({
      scryfallId: selectedCard.value.scryfallId,
      name: selectedCard.value.name,
      type: prefType,
      quantity: selectedCard.value.quantity,
      condition: selectedCard.value.condition,
      edition: selectedCard.value.edition,
      image: selectedCard.value.image,
    });
  } else if (oldStatus !== 'collection' && newStatus !== 'collection' && oldStatus !== newStatus) {
    // Changed between sell/trade/busco -> update preference type
    let newType: any;
    if (newStatus === 'sell') newType = 'VENDO';
    else if (newStatus === 'trade') newType = 'CAMBIO';
    else if (newStatus === 'busco') newType = 'BUSCO';
    else newType = 'VENDO';
    await preferencesStore.updatePreferenceType(
        selectedCard.value.scryfallId,
        selectedCard.value.edition,
        newType
    );
  }

  showStatusModal.value = false;
  selectedCard.value = null;
};

const handleAdd = (cardData: any) => {
  collectionStore.addCard(cardData);
  showAddModal.value = false;
};

const handleEdit = (card: Card) => {
  editingCard.value = card;
  showEditModal.value = true;
};

const handleSaveEdit = async (updates: Partial<Card>) => {
  if (editingCard.value) {
    await collectionStore.updateCard(editingCard.value.id, updates);
    showEditModal.value = false;
    editingCard.value = null;
  }
};

const handleDelete = async (cardId: string) => {
  if (confirm('¿Eliminar esta carta?')) {
    await collectionStore.deleteCard(cardId);
  }
};

const handleImport = async (
    deckText: string,
    condition: CardCondition,
    includeSideboard: boolean,
    deckName?: string
) => {
  showImportModal.value = false;
  showProgressToast.value = true;
  importProgress.value = { current: 0, total: 0 };

  const result = await collectionStore.processDeckImport(
      deckText,
      condition,
      includeSideboard,
      deckName,
      (current, total) => {
        importProgress.value = { current, total };
      }
  );

  showProgressToast.value = false;

  importResult.value = {
    ...result,
    total: result.success + result.failed
  };

  if (result.failed === 0 && result.success > 0) {
    // Normalize batch deck name here to ensure same name for all cards
    const batchName = deckName ?? (result.processedCards[0]?.deckName) ?? (() => {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
      return `DeckName${yy}${mm}${dd}${hh}${min}_${rand}`;
    })();

    const normalized = result.processedCards.map((c: any) => ({ ...c, deckName: batchName }));

    await collectionStore.confirmImport(normalized);
    await collectionStore.loadCollection();
    return;
  }

  if (result.failed > 0) {
    showResultModal.value = true;
  }
};

const handleImportDirect = async (
    cards: any[],
    deckName: string,
    condition: CardCondition
) => {
  showImportModal.value = false;
  showProgressToast.value = true;
  importProgress.value = { current: 0, total: 0 };

  const result = await collectionStore.processDirectImport(
      cards,
      deckName,
      condition,
      (current, total) => {
        importProgress.value = { current, total };
      }
  );

  showProgressToast.value = false;

  importResult.value = {
    ...result,
    total: result.success + result.failed
  };

  if (result.failed === 0 && result.success > 0) {
    // Normalize batch deck name here as well
    const batchName = deckName ?? (result.processedCards[0]?.deckName) ?? (() => {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
      return `DeckName${yy}${mm}${dd}${hh}${min}_${rand}`;
    })();

    const normalized = result.processedCards.map((c: any) => ({ ...c, deckName: batchName }));

    await collectionStore.confirmImport(normalized);
    await collectionStore.loadCollection();
    return;
  }

  if (result.failed > 0) {
    showResultModal.value = true;
  }
};

const handleConfirmImport = async () => {
  // Ensure the importResult processedCards all share a single batch name before confirming
  if (!importResult.value.processedCards || importResult.value.processedCards.length === 0) return;

  const existingFirst = importResult.value.processedCards[0]?.deckName;
  const batchName = existingFirst ?? (() => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `DeckName${yy}${mm}${dd}${hh}${min}_${rand}`;
  })();

  // handleConfirmImport: normalized batch name computed
   const normalized = importResult.value.processedCards.map((c: any) => ({ ...c, deckName: batchName }));

  // Close the modal immediately so the UI doesn't stay blocked
  showResultModal.value = false;

  // Show progress toast while we perform the writes
  showProgressToast.value = true;
  importProgress.value = { current: 0, total: normalized.length };

  const success = await collectionStore.confirmImport(normalized);

  // Hide progress toast
  showProgressToast.value = false;
  importProgress.value = { current: 0, total: 0 };

  // Reset import result in any case so modal won't reopen with old data
  importResult.value = {
    success: 0,
    failed: 0,
    total: 0,
    errors: [],
    processedCards: []
  };

  if (success) {
    await collectionStore.loadCollection();
  }
};

const handleCancelImport = () => {
  showResultModal.value = false;
  importResult.value = {
    success: 0,
    failed: 0,
    total: 0,
    errors: [],
    processedCards: []
  };
};

// NEW: delete a deck (all cards with the same deckName)
const handleDeleteDeck = async () => {
  if (deckFilter.value === 'all') return;
  const confirmed = confirm(`Eliminar mazo "${deckFilter.value}"? Esta acción borrará todas las cartas de ese mazo.`);
  if (!confirmed) return;

  const ok = await collectionStore.deleteDeck(deckFilter.value);
  if (ok) {
    deckFilter.value = 'all';
  }
};
</script>

<template>
  <AppContainer>
    <div>
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver">MI COLECCIÓN</h1>
          <p class="text-tiny md:text-small text-silver-70 mt-1">
            {{ collectionStore.cards.length }} cartas físicas
          </p>
        </div>
        <div class="flex flex-col md:flex-row gap-2 md:gap-3">
          <BaseButton variant="secondary" size="small" @click="showImportModal = true" class="w-full md:w-auto">
            IMPORTAR
          </BaseButton>
          <BaseButton size="small" @click="showAddModal = true" class="w-full md:w-auto">
            + AGREGAR
          </BaseButton>
        </div>
      </div>

      <!-- Status filter pills -->
      <div class="flex flex-wrap gap-2 mb-4 md:mb-6">
        <button
            @click="statusFilter = 'all'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'all'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          TODAS ({{ collectionStore.cards.length }})
        </button>
        <button
            @click="statusFilter = 'collection'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'collection'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          COLECCIÓN ({{ collectionCount }})
        </button>
        <button
            @click="statusFilter = 'sell'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'sell'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          VENTA ({{ sellCount }})
        </button>
        <button
            @click="statusFilter = 'trade'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'trade'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          CAMBIO ({{ tradeCount }})
        </button>
        <button
            @click="statusFilter = 'busco'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'busco'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          BUSCO ({{ buscoCount }})
        </button>
      </div>

      <!-- Deck filter -->
      <div v-if="uniqueDecks.length > 0" class="mb-4 md:mb-6">
        <label class="text-small text-silver-70 block mb-2">Filtrar por mazo</label>
        <div class="flex gap-2 items-center">
          <select
              v-model="deckFilter"
              class="flex-1 bg-primary border border-silver px-3 py-2.5 text-small text-silver transition-fast focus:outline-none focus:border-2 focus:border-neon cursor-pointer"
          >
            <option value="all">Todos los mazos</option>
            <option v-for="deck in uniqueDecks" :key="deck" :value="deck">
              {{ deck }}
            </option>
          </select>

          <!-- NEW: Delete deck button -->
          <button
              v-if="deckFilter !== 'all'"
              @click="handleDeleteDeck"
              class="px-3 py-2 bg-rust text-white text-small rounded-md hover:opacity-90"
          >
            Eliminar mazo
          </button>
        </div>
      </div>

      <div class="mb-4 md:mb-6">
        <BaseInput
            v-model="filterQuery"
            placeholder="Filtrar por nombre, edición o mazo..."
            type="text"
        />
      </div>

      <!-- NEW: Stats bar -->
      <div v-if="collectionStore.cards.length > 0" class="bg-primary p-4 rounded-lg mb-4 md:mb-6 border border-silver-30">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
          <div>
            <div class="text-small text-silver-70">Total Cartas</div>
            <div class="text-h5 font-bold text-silver">{{ totalCardCount }}</div>
          </div>
          <div>
            <div class="text-small text-silver-70">En Colección</div>
            <div class="text-h5 font-bold text-silver">{{ collectionCardCount }}</div>
          </div>
          <div>
            <div class="text-small text-silver-70">Busco</div>
            <div class="text-h5 font-bold text-silver">{{ buscoCount }}</div>
          </div>
          <div>
            <div class="text-small text-silver-70">Resto</div>
            <div class="text-h5 font-bold text-silver">{{ remainderCount }}</div>
          </div>
          <div>
            <div class="text-small text-silver-70">Costo Total (Mazo)</div>
            <div class="text-h5 font-bold text-silver">${{ deckTotalCostFormatted }}</div>
          </div>
          <div>
            <div class="text-small text-silver-70">Costo Busco</div>
            <div class="text-h5 font-bold text-silver">${{ buscoTotalCostFormatted }}</div>
          </div>
        </div>
      </div>

      <BaseLoader v-if="collectionStore.loading" size="large" />

      <div v-else-if="filteredCards.length === 0" class="border border-silver-30 p-6 md:p-8 text-center">
        <p class="text-small md:text-body text-silver-70">
          {{ statusFilter === 'all' && deckFilter === 'all' ? 'Colección vacía.' : 'No hay cartas con estos filtros.' }}
        </p>
        <p class="text-tiny md:text-small text-silver-50 mt-2">
          Agrega tu primera carta para comenzar.
        </p>
      </div>

      <CollectionGrid
          v-else
          :cards="filteredCards"
          @click="handleCardClick"
          @edit="handleEdit"
          @delete="handleDelete"
      />

      <!-- Modals -->
      <AddCardModal
          :show="showAddModal"
          :defaultDeckName="deckFilter !== 'all' ? deckFilter : undefined"
          @close="showAddModal = false"
          @add="handleAdd"
      />

      <EditCardModal
          :show="showEditModal"
          :card="editingCard"
          @close="showEditModal = false"
          @save="handleSaveEdit"
      />

      <CardStatusModal
          :show="showStatusModal"
          :card="selectedCard"
          @close="showStatusModal = false"
          @update-status="handleUpdateStatus"
      />

      <ImportDeckModal
          :show="showImportModal"
          @close="showImportModal = false"
          @import="handleImport"
          @import-direct="handleImportDirect"
      />

      <ImportResultModal
          :show="showResultModal"
          :success="importResult.success"
          :failed="importResult.failed"
          :total="importResult.total"
          :errors="importResult.errors"
          @confirm="handleConfirmImport"
          @cancel="handleCancelImport"
      />

      <!-- Progress Toast -->
      <ImportProgressToast
          v-if="showProgressToast"
          :current="importProgress.current"
          :total="importProgress.total"
          :processing="true"
      />
    </div>
  </AppContainer>
</template>
