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

const filteredCards = computed(() => {
  let cards = collectionStore.cards;

  // Filter by status
  if (statusFilter.value !== 'all') {
    cards = cards.filter(card => card.status === statusFilter.value);
  }

  // Filter by search query
  if (filterQuery.value) {
    const query = filterQuery.value.toLowerCase();
    cards = cards.filter(card =>
        card.name.toLowerCase().includes(query) ||
        card.edition.toLowerCase().includes(query)
    );
  }

  return cards;
});

const collectionCount = computed(() => collectionStore.cards.filter(c => c.status === 'collection').length);
const sellCount = computed(() => collectionStore.cards.filter(c => c.status === 'sell').length);
const tradeCount = computed(() => collectionStore.cards.filter(c => c.status === 'trade').length);

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
    // Removed from sell/trade -> delete preference
    await preferencesStore.deletePreferenceByCard(selectedCard.value.scryfallId, selectedCard.value.edition);
  } else if (oldStatus === 'collection' && newStatus !== 'collection') {
    // Added to sell/trade -> create preference
    const prefType = newStatus === 'sell' ? 'VENDO' : 'CAMBIO';
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
    // Changed between sell/trade -> update preference type
    await preferencesStore.updatePreferenceType(
        selectedCard.value.scryfallId,
        selectedCard.value.edition,
        newStatus === 'sell' ? 'VENDO' : 'CAMBIO'
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
    includeSideboard: boolean
) => {
  showImportModal.value = false;
  showProgressToast.value = true;
  importProgress.value = { current: 0, total: 0 };

  const result = await collectionStore.processDeckImport(
      deckText,
      condition,
      includeSideboard,
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
    await collectionStore.confirmImport(result.processedCards);
    await collectionStore.loadCollection();
    return;
  }

  if (result.failed > 0) {
    showResultModal.value = true;
  }
};

const handleConfirmImport = async () => {
  const success = await collectionStore.confirmImport(importResult.value.processedCards);
  if (success) {
    await collectionStore.loadCollection();
    showResultModal.value = false;
    importResult.value = {
      success: 0,
      failed: 0,
      total: 0,
      errors: [],
      processedCards: []
    };
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
      </div>

      <div class="mb-4 md:mb-6">
        <BaseInput
            v-model="filterQuery"
            placeholder="Filtrar por nombre o edición..."
            type="text"
        />
      </div>

      <BaseLoader v-if="collectionStore.loading" size="large" />

      <div v-else-if="filteredCards.length === 0" class="border border-silver-30 p-6 md:p-8 text-center">
        <p class="text-small md:text-body text-silver-70">
          {{ statusFilter === 'all' ? 'Colección vacía.' : 'No hay cartas con este estado.' }}
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