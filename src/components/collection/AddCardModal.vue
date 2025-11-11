<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import BaseInput from '../ui/BaseInput.vue';
import BaseSelect from '../ui/BaseSelect.vue';
import BaseButton from '../ui/BaseButton.vue';
import BaseLoader from '../ui/BaseLoader.vue';
import BaseBadge from '../ui/BaseBadge.vue';
import { searchCards } from '../../services/scryfall';
import { ScryfallCard, CardCondition, CardStatus } from '../../types/card';

const props = defineProps<{
  show: boolean;
  defaultDeckName?: string;
  defaultStatus?: CardStatus;
}>();

const emit = defineEmits<{
  close: [];
  add: [cardData: any];
}>();

const searchQuery = ref('');
const searchResults = ref<ScryfallCard[]>([]);
const selectedCard = ref<ScryfallCard | null>(null);
const quantity = ref(1);
const condition = ref<CardCondition>('NM');
const foil = ref(false);
const deckNameInput = ref('');
const isPublic = ref(false);
const searching = ref(false);
const status = ref<CardStatus>('collection');

watch(() => props.show, (val) => {
  if (val) {
    deckNameInput.value = props.defaultDeckName ?? '';
    status.value = props.defaultStatus ?? 'collection';
  }
});

watch(() => props.defaultDeckName, (val) => {
  if (props.show && val) {
    deckNameInput.value = val;
  }
});

watch(() => props.defaultStatus, (val) => {
  if (props.show && val) {
    status.value = val;
  }
});

const conditionOptions = [
  { value: 'M', label: 'M - Mint' },
  { value: 'NM', label: 'NM - Near Mint' },
  { value: 'LP', label: 'LP - Light Play' },
  { value: 'MP', label: 'MP - Moderate Play' },
  { value: 'HP', label: 'HP - Heavy Play' },
  { value: 'PO', label: 'PO - Poor' },
];

const getStatusLabel = (s: CardStatus) => {
  if (s === 'sell') return 'VENDO';
  if (s === 'trade') return 'CAMBIO';
  if (s === 'busco') return 'BUSCO';
  return 'COLECCIÓN';
};

const getStatusBadgeVariant = (s: CardStatus) => {
  if (s === 'sell') return 'vendo';
  if (s === 'trade') return 'cambio';
  if (s === 'busco') return 'busco';
  return 'solo';
};

const statusBannerText = computed(() => {
  if (status.value === 'collection') {
    return null;
  }
  if (status.value === 'sell') {
    return 'Se agregará como VENDO';
  }
  if (status.value === 'trade') {
    return 'Se agregará como CAMBIO';
  }
  if (status.value === 'busco') {
    return 'Se agregará como BUSCO';
  }
  return null;
});

let searchTimeout: ReturnType<typeof setTimeout>;

watch(searchQuery, (newQuery) => {
  clearTimeout(searchTimeout);

  if (newQuery.length < 2) {
    searchResults.value = [];
    return;
  }

  searching.value = true;
  searchTimeout = setTimeout(async () => {
    searchResults.value = await searchCards(newQuery);
    searching.value = false;
  }, 300);
});

const selectCard = (card: ScryfallCard) => {
  selectedCard.value = card;
  searchResults.value = [];
  searchQuery.value = '';
};

const handleAdd = () => {
  if (!selectedCard.value || quantity.value < 1) return;

  const price = foil.value
      ? parseFloat(selectedCard.value.prices.usd_foil || '0')
      : parseFloat(selectedCard.value.prices.usd || '0');

  const deckNameToSend = deckNameInput.value?.trim() || props.defaultDeckName || undefined;

  emit('add', {
    scryfallId: selectedCard.value.id,
    name: selectedCard.value.name,
    edition: selectedCard.value.set_name,
    quantity: quantity.value,
    condition: condition.value,
    foil: foil.value,
    price,
    image: selectedCard.value.image_uris?.normal || '',
    status: status.value,
    deckName: deckNameToSend,
    public: isPublic.value,
  });

  handleClose();
};

const handleClose = () => {
  searchQuery.value = '';
  searchResults.value = [];
  selectedCard.value = null;
  quantity.value = 1;
  condition.value = 'NM';
  foil.value = false;
  deckNameInput.value = '';
  isPublic.value = false;
  status.value = 'collection';
  emit('close');
};
</script>

<template>
  <BaseModal :show="show" title="AGREGAR CARTA A MI COLECCIÓN" @close="handleClose">
    <div class="space-y-4">
      <!-- Deck warning banner -->
      <div v-if="props.defaultDeckName" class="bg-neon-5 border border-neon p-3 rounded">
        <p class="text-tiny font-bold text-neon">
          📌 Se agregará al mazo: <span class="text-silver">{{ props.defaultDeckName }}</span>
        </p>
      </div>

      <!-- Status warning banner -->
      <div v-if="statusBannerText" class="bg-neon-5 border border-neon p-3 rounded flex items-center gap-2">
        <p class="text-tiny font-bold text-neon">📌 {{ statusBannerText }}</p>
        <BaseBadge :variant="getStatusBadgeVariant(status)">
          {{ getStatusLabel(status) }}
        </BaseBadge>
      </div>

      <!-- Search -->
      <div v-if="!selectedCard">
        <BaseInput
            v-model="searchQuery"
            placeholder="Buscar carta..."
            type="text"
        />

        <div v-if="searching" class="mt-4">
          <BaseLoader size="small" />
        </div>

        <div v-if="searchResults.length > 0" class="mt-4 max-h-64 overflow-y-auto space-y-2">
          <div
              v-for="card in searchResults"
              :key="card.id"
              @click="selectCard(card)"
              class="border border-silver-30 p-3 hover:border-neon transition-fast cursor-pointer"
          >
            <div class="flex gap-3">
              <img
                  v-if="card.image_uris?.small"
                  :src="card.image_uris.small"
                  :alt="card.name"
                  class="w-12 h-16 object-cover"
              />
              <div class="flex-1">
                <p class="text-small font-bold text-silver">{{ card.name }}</p>
                <p class="text-tiny text-silver-70">{{ card.set_name }}</p>
                <p class="text-tiny text-neon mt-1">
                  ${{ card.prices.usd || 'N/A' }}
                  <span v-if="card.prices.usd_foil" class="ml-2">
                    (Foil: ${{ card.prices.usd_foil }})
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected Card Form -->
      <div v-if="selectedCard" class="space-y-4">
        <div class="border border-silver-30 p-4">
          <div class="flex gap-4">
            <img
                v-if="selectedCard.image_uris?.normal"
                :src="selectedCard.image_uris.normal"
                :alt="selectedCard.name"
                class="w-24 h-32 object-cover"
            />
            <div class="flex-1">
              <p class="text-body font-bold text-silver">{{ selectedCard.name }}</p>
              <p class="text-small text-silver-70">{{ selectedCard.set_name }}</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-small text-silver-70 block mb-2">Cantidad</label>
            <BaseInput
                v-model="quantity"
                type="number"
                placeholder="1"
            />
          </div>

          <div>
            <label class="text-small text-silver-70 block mb-2">Condición</label>
            <BaseSelect
                v-model="condition"
                :options="conditionOptions"
            />
          </div>
        </div>

        <div>
          <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
            <input
                v-model="foil"
                type="checkbox"
                class="w-4 h-4"
            />
            <span>Foil</span>
          </label>
        </div>

        <!-- Deck name input -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Nombre del mazo (opcional)</label>
          <BaseInput
              v-model="deckNameInput"
              placeholder="Nombre del mazo"
              type="text"
          />
        </div>

        <!-- Public checkbox -->
        <div>
          <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
            <input
                v-model="isPublic"
                type="checkbox"
                class="w-4 h-4"
            />
            <span>Visible en mi perfil público</span>
          </label>
        </div>

        <div class="bg-primary-dark border border-silver-30 p-3">
          <p class="text-tiny text-silver-70">
            💡 La carta se agregará a tu colección. Luego podrás elegir si venderla o cambiarla haciendo click en ella.
          </p>
        </div>

        <div class="flex gap-3">
          <BaseButton
              variant="secondary"
              size="small"
              @click="selectedCard = null"
              class="flex-1"
          >
            CAMBIAR CARTA
          </BaseButton>
          <BaseButton
              variant="primary"
              @click="handleAdd"
              :disabled="quantity < 1"
              class="flex-1"
          >
            AGREGAR
          </BaseButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>