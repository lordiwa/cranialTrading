<script setup lang="ts">
import { ref, watch } from 'vue';
import { Card, CardCondition, ScryfallCard } from '../../types/card';
import { searchCards } from '../../services/scryfall';
import BaseModal from '../ui/BaseModal.vue';
import BaseInput from '../ui/BaseInput.vue';
import BaseSelect from '../ui/BaseSelect.vue';
import BaseButton from '../ui/BaseButton.vue';
import BaseLoader from '../ui/BaseLoader.vue';

const props = defineProps<{
  show: boolean;
  card: Card | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [updates: Partial<Card>];
}>();

const form = ref({
  quantity: 1,
  condition: 'NM' as CardCondition,
  foil: false,
  price: 0,
  public: false,
  scryfallId: '',
  name: '',
  edition: '',
  image: '',
});

const conditions: CardCondition[] = ['M', 'NM', 'LP', 'MP', 'HP', 'PO'];
const searchQuery = ref('');
const searchResults = ref<ScryfallCard[]>([]);
const searching = ref(false);
const editingCard = ref(false);

let searchTimeout: ReturnType<typeof setTimeout>;

watch(() => props.card, (newCard) => {
  if (newCard) {
    form.value = {
      quantity: newCard.quantity,
      condition: newCard.condition,
      foil: newCard.foil,
      price: newCard.price,
      public: newCard.public || false,
      scryfallId: newCard.scryfallId,
      name: newCard.name,
      edition: newCard.edition,
      image: newCard.image,
    };
    editingCard.value = false;
    searchQuery.value = '';
    searchResults.value = [];
  }
}, { deep: true });

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
  form.value.scryfallId = card.id;
  form.value.name = card.name;
  form.value.edition = card.set_name;
  form.value.image = card.image_uris?.normal || '';
  form.value.price = parseFloat(card.prices.usd || '0');
  searchQuery.value = '';
  searchResults.value = [];
  editingCard.value = false;
};

const handleSave = () => {
  emit('save', {
    quantity: form.value.quantity,
    condition: form.value.condition,
    foil: form.value.foil,
    price: form.value.price,
    public: form.value.public,
    scryfallId: form.value.scryfallId,
    name: form.value.name,
    edition: form.value.edition,
    image: form.value.image,
  });
};
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="w-full max-w-md">
      <h2 class="text-h2 font-bold text-silver mb-6">EDITAR CARTA</h2>

      <div v-if="!editingCard" class="space-y-md">
        <!-- Card preview -->
        <div class="border border-silver-30 p-lg">
          <div class="flex gap-lg">
            <img
                v-if="form.image"
                :src="form.image"
                :alt="form.name"
                class="w-20 h-28 object-cover"
            />
            <div class="flex-1">
              <p class="text-body font-bold text-silver">{{ form.name }}</p>
              <p class="text-small text-silver-70 mt-1">{{ form.edition }}</p>
              <div class="flex items-center gap-2 mt-2">
                <span class="text-small font-bold text-neon">x{{ form.quantity }}</span>
                <span v-if="form.foil" class="text-tiny text-neon">FOIL</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Edit button -->
        <BaseButton
            variant="secondary"
            size="small"
            @click="editingCard = true"
            class="w-full"
        >
          CAMBIAR CARTA / EDICIÓN
        </BaseButton>

        <div class="grid grid-cols-2 gap-lg">
          <div>
            <label class="text-small font-bold text-silver mb-2 block">Cantidad</label>
            <BaseInput
                v-model.number="form.quantity"
                type="number"
                min="1"
                placeholder="1"
            />
          </div>

          <div>
            <label class="text-small font-bold text-silver mb-2 block">Condición</label>
            <BaseSelect
                v-model="form.condition"
                :options="conditions.map(c => ({ value: c, label: c }))"
            />
          </div>
        </div>

        <div>
          <label class="text-small font-bold text-silver mb-2 block">Precio</label>
          <BaseInput
              v-model.number="form.price"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
          />
        </div>

        <div class="space-y-xs">
          <label class="flex items-center gap-3 text-small text-silver cursor-pointer">
            <input
                v-model="form.foil"
                type="checkbox"
                class="w-4 h-4"
            />
            <span>FOIL</span>
          </label>

          <label class="flex items-center gap-3 text-small text-silver cursor-pointer">
            <input
                v-model="form.public"
                type="checkbox"
                class="w-4 h-4"
            />
            <span>Visible en mi perfil público</span>
          </label>
        </div>

        <div class="flex gap-md mt-6">
          <BaseButton
              variant="secondary"
              class="flex-1"
              @click="emit('close')"
          >
            CANCELAR
          </BaseButton>
          <BaseButton
              class="flex-1"
              @click="handleSave"
          >
            GUARDAR
          </BaseButton>
        </div>
      </div>

      <!-- Card selection -->
      <div v-else class="space-y-md">
        <BaseInput
            v-model="searchQuery"
            placeholder="Buscar nueva carta..."
            type="text"
        />

        <div v-if="searching" class="mt-4">
          <BaseLoader size="small" />
        </div>

        <div v-if="searchResults.length > 0" class="max-h-64 overflow-y-auto space-y-xs">
          <div
              v-for="card in searchResults"
              :key="card.id"
              @click="selectCard(card)"
              class="border border-silver-30 p-sm hover:border-neon transition-fast cursor-pointer"
          >
            <div class="flex gap-md">
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
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-md">
          <BaseButton
              variant="secondary"
              class="flex-1"
              @click="editingCard = false"
          >
            ATRÁS
          </BaseButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>