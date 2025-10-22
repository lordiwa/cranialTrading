<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import CollectionGrid from '../components/collection/CollectionGrid.vue';
import AddCardModal from '../components/collection/AddCardModal.vue';
import EditCardModal from '../components/collection/EditCardModal.vue';
import { useCollectionStore } from '../stores/collection';
import { Card } from '../types/card';

const collectionStore = useCollectionStore();
const showAddModal = ref(false);
const showEditModal = ref(false);
const editingCard = ref<Card | null>(null);
const filterQuery = ref('');

onMounted(() => {
  collectionStore.loadCollection();
});

const filteredCards = () => {
  if (!filterQuery.value) return collectionStore.cards;

  const query = filterQuery.value.toLowerCase();
  return collectionStore.cards.filter(card =>
      card.name.toLowerCase().includes(query) ||
      card.edition.toLowerCase().includes(query)
  );
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
</script>

<template>
  <AppContainer>
    <div>
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-h1 font-bold text-silver">MI COLECCIÓN</h1>
          <p class="text-small text-silver-70 mt-1">
            {{ collectionStore.cards.length }} cartas
          </p>
        </div>
        <BaseButton @click="showAddModal = true">
          + AGREGAR CARTA
        </BaseButton>
      </div>

      <div class="mb-6">
        <BaseInput
            v-model="filterQuery"
            placeholder="Filtrar por nombre o edición..."
            type="text"
        />
      </div>

      <BaseLoader v-if="collectionStore.loading" size="large" />

      <div v-else-if="collectionStore.cards.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">
          Colección vacía.
        </p>
        <p class="text-small text-silver-50 mt-2">
          Agrega tu primera carta para comenzar.
        </p>
      </div>

      <CollectionGrid
          v-else
          :cards="filteredCards()"
          @edit="handleEdit"
          @delete="handleDelete"
      />

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
    </div>
  </AppContainer>
</template>