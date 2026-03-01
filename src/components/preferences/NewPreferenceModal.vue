<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import BaseModal from '../ui/BaseModal.vue';
import BaseInput from '../ui/BaseInput.vue';
import BaseSelect from '../ui/BaseSelect.vue';
import BaseButton from '../ui/BaseButton.vue';
import BaseLoader from '../ui/BaseLoader.vue';
import BaseBadge from '../ui/BaseBadge.vue';
import { searchCards } from '../../services/scryfall';
import { type Card, type CardCondition, type ScryfallCard } from '../../types/card';
import { type PreferenceType } from '../../types/preferences';

const props = defineProps<{
  show: boolean;
  preSelectedCard?: Card | null;
  defaultType?: PreferenceType;
}>();

const emit = defineEmits<{
  close: [];
  add: [prefData: any];
}>();

const { t } = useI18n();

const searchQuery = ref('');
const searchResults = ref<ScryfallCard[]>([]);
const selectedCard = ref<ScryfallCard | null>(null);
const type = ref<PreferenceType>('BUSCO');
const quantity = ref(1);
const condition = ref<CardCondition>('NM');
const searching = ref(false);

const typeOptions: { value: PreferenceType; label: string; variant: 'busco' | 'cambio' | 'vendo' }[] = [
  { value: 'BUSCO', label: 'WISHLIST', variant: 'busco' },
  { value: 'CAMBIO', label: 'CAMBIO', variant: 'cambio' },
  { value: 'VENDO', label: 'VENDO', variant: 'vendo' },
];

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
]);

let searchTimeout: ReturnType<typeof setTimeout>;

// Watch for pre-selected card
watch(() => props.preSelectedCard, (card) => {
  if (card) {
    // Convert Card to ScryfallCard format
    selectedCard.value = {
      id: card.scryfallId,
      name: card.name,
      set_name: card.edition,
      set: '',
      collector_number: '',
      rarity: '',
      type_line: '',
      image_uris: {
        normal: card.image,
        small: card.image,
      },
      prices: {
        usd: card.price.toString(),
      },
    } as ScryfallCard;
  }
}, { immediate: true });

// Watch for default type
watch(() => props.defaultType, (defaultType) => {
  if (defaultType) {
    type.value = defaultType;
  }
}, { immediate: true });

watch(searchQuery, (newQuery) => {
  clearTimeout(searchTimeout);

  if (newQuery.length < 2) {
    searchResults.value = [];
    return;
  }

  searching.value = true;
  searchTimeout = setTimeout(() => {
    void (async () => {
      try {
        searchResults.value = await searchCards(newQuery);
      } catch (e) {
        console.error('Error searching cards:', e)
        searchResults.value = [];
      } finally {
        searching.value = false;
      }
    })();
  }, 300);
});

const selectCard = (card: ScryfallCard) => {
  selectedCard.value = card;
  searchResults.value = [];
  searchQuery.value = '';
};

const handleAdd = () => {
  if (!selectedCard.value || quantity.value < 1) return;

  emit('add', {
    scryfallId: selectedCard.value.id,
    name: selectedCard.value.name,
    type: type.value,
    quantity: quantity.value,
    condition: condition.value,
    edition: selectedCard.value.set_name,
    image: selectedCard.value.image_uris?.normal || '',
  });

  handleClose();
};

const handleClose = () => {
  searchQuery.value = '';
  searchResults.value = [];
  selectedCard.value = null;
  type.value = props.defaultType || 'BUSCO';
  quantity.value = 1;
  condition.value = 'NM';
  emit('close');
};
</script>

<template>
  <BaseModal :show="show" :title="t('preferences.newModal.title')" @close="handleClose">
    <div class="space-y-md">
      <!-- Search -->
      <div v-if="!selectedCard">
        <BaseInput
            v-model="searchQuery"
            :placeholder="t('preferences.newModal.searchPlaceholder')"
            type="text"
        />

        <div v-if="searching" class="mt-4">
          <BaseLoader size="small" />
        </div>

        <div v-if="searchResults.length > 0" class="mt-4 max-h-64 overflow-y-auto space-y-xs">
          <div
              v-for="card in searchResults"
              :key="card.id"
              @click="selectCard(card)"
              class="border border-silver-30 p-sm hover:border-neon transition-fast cursor-pointer"
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
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected Card Form -->
      <div v-if="selectedCard" class="space-y-md">
        <div class="border border-silver-30 p-md">
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

        <div>
          <span class="text-small text-silver-70 block mb-2">{{ t('common.labels.type') }}</span>
          <div class="flex gap-2">
            <button
                v-for="opt in typeOptions"
                :key="opt.value"
                @click="type = opt.value"
                class="flex-1"
            >
              <BaseBadge :variant="type === opt.value ? opt.variant : 'cambio'">
                {{ opt.label }}
              </BaseBadge>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="new-pref-quantity" class="text-small text-silver-70 block mb-2">{{ t('common.labels.quantity') }}</label>
            <BaseInput
                id="new-pref-quantity"
                v-model="quantity"
                type="number"
                placeholder="1"
            />
          </div>

          <div>
            <label for="new-pref-condition" class="text-small text-silver-70 block mb-2">{{ t('preferences.newModal.minCondition') }}</label>
            <BaseSelect
                id="new-pref-condition"
                v-model="condition"
                :options="conditionOptions"
            />
          </div>
        </div>

        <div class="flex gap-3">
          <BaseButton
              variant="secondary"
              size="small"
              @click="selectedCard = null"
              class="flex-1"
          >
            {{ t('preferences.newModal.changeCard') }}
          </BaseButton>
          <BaseButton
              variant="primary"
              @click="handleAdd"
              :disabled="quantity < 1"
              class="flex-1"
          >
            {{ t('common.actions.update') }}
          </BaseButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>