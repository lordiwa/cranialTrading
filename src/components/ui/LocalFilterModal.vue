<script setup lang="ts">
import { computed } from 'vue'
import { colorIconMap, colorOrder, manaOrder, rarityOrder, typeOrder } from '../../composables/useCardFilter'
import { useI18n } from '../../composables/useI18n'
import BaseModal from './BaseModal.vue'
import ManaIcon from './ManaIcon.vue'

const props = defineProps<{
  show: boolean
  selectedColors: Set<string>
  selectedManaValues: Set<string>
  selectedTypes: Set<string>
  selectedRarities: Set<string>
}>()

const emit = defineEmits<{
  close: []
  'toggle-color': [cat: string]
  'toggle-mana': [cat: string]
  'toggle-type': [cat: string]
  'toggle-rarity': [cat: string]
  'reset-all': []
}>()

const { t } = useI18n()

const activeCount = computed(() => {
  let count = 0
  if (props.selectedColors.size < colorOrder.length) count++
  if (props.selectedManaValues.size < manaOrder.length) count++
  if (props.selectedTypes.size < typeOrder.length) count++
  if (props.selectedRarities.size < rarityOrder.length) count++
  return count
})

const rarityStyleMap: Record<string, { active: string; inactive: string }> = {
  'Common': {
    active: 'bg-white text-black border-white',
    inactive: 'bg-silver-10 border-silver-30 text-white hover:border-white',
  },
  'Uncommon': {
    active: 'bg-[#C0C0C0] text-black border-[#C0C0C0]',
    inactive: 'bg-silver-10 border-silver-30 text-[#C0C0C0] hover:border-[#C0C0C0]',
  },
  'Rare': {
    active: 'bg-[#FFD700] text-black border-[#FFD700]',
    inactive: 'bg-silver-10 border-silver-30 text-[#FFD700] hover:border-[#FFD700]',
  },
  'Mythic': {
    active: 'bg-[#CD7F32] text-black border-[#CD7F32]',
    inactive: 'bg-silver-10 border-silver-30 text-[#CD7F32] hover:border-[#CD7F32]',
  },
  'Unknown': {
    active: 'bg-silver-50 text-black border-silver-50',
    inactive: 'bg-silver-10 border-silver-30 text-silver-50 hover:border-silver-50',
  },
}

const manaValueOptions = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']
</script>

<template>
  <BaseModal
      :show="show"
      :title="t('search.filterPanel.moreFilters')"
      @close="emit('close')"
  >
    <div class="space-y-5">
      <!-- Colors -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase mb-2 block">
          {{ t('collection.deckStats.color') }}
        </span>
        <div class="flex gap-1 flex-wrap">
          <button
              v-for="color in colorOrder"
              :key="color"
              @click="emit('toggle-color', color)"
              :class="[
                'w-8 h-8 text-sm font-bold transition-fast flex items-center justify-center rounded',
                selectedColors.has(color)
                  ? 'bg-neon text-primary border-2 border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
              :title="color"
          >
            <ManaIcon :symbol="colorIconMap[color] || 'C'" size="small" />
          </button>
        </div>
      </div>

      <!-- Types -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase mb-2 block">
          {{ t('collection.deckStats.type') }}
        </span>
        <div class="flex flex-wrap gap-1">
          <button
              v-for="type in typeOrder"
              :key="type"
              @click="emit('toggle-type', type)"
              :class="[
                'px-2 py-1 text-tiny font-bold transition-fast',
                selectedTypes.has(type)
                  ? 'bg-neon text-primary border border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
          >
            {{ type }}
          </button>
        </div>
      </div>

      <!-- Mana Value -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase mb-2 block">
          {{ t('collection.deckStats.mana') }}
        </span>
        <div class="flex flex-wrap gap-1 items-center">
          <button
              v-for="mv in manaValueOptions"
              :key="mv"
              @click="emit('toggle-mana', mv)"
              :class="[
                'w-8 h-8 flex items-center justify-center transition-fast rounded',
                selectedManaValues.has(mv)
                  ? 'bg-neon border-2 border-neon'
                  : 'bg-silver-10 border border-silver-30 hover:border-neon'
              ]"
              :title="mv"
          >
            <ManaIcon v-if="mv !== '10+' && mv !== 'Lands'" :symbol="mv" size="small" />
            <span v-else class="text-tiny font-bold" :class="selectedManaValues.has(mv) ? 'text-primary' : 'text-silver'">{{ mv === 'Lands' ? '🌍' : '10+' }}</span>
          </button>
        </div>
      </div>

      <!-- Rarity -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase mb-2 block">
          {{ t('search.modal.sections.rarity') }}
        </span>
        <div class="flex gap-1 flex-wrap">
          <button
              v-for="rarity in rarityOrder"
              :key="rarity"
              @click="emit('toggle-rarity', rarity)"
              :class="[
                'px-2 py-1 text-tiny font-bold transition-fast border',
                selectedRarities.has(rarity)
                  ? rarityStyleMap[rarity]?.active
                  : rarityStyleMap[rarity]?.inactive
              ]"
          >
            {{ rarity }}
          </button>
        </div>
      </div>

      <!-- Reset + Apply -->
      <div class="flex justify-between pt-4 border-t border-silver-30">
        <button
            v-if="activeCount > 0"
            @click="emit('reset-all')"
            class="px-3 py-1 text-tiny font-bold text-rust border border-rust hover:bg-rust hover:text-primary transition-fast"
        >
          {{ t('search.filterPanel.clear') }}
        </button>
        <div v-else />
        <button
            @click="emit('close')"
            class="px-4 py-2 text-small font-bold bg-neon text-primary hover:bg-neon/80 transition-fast"
        >
          {{ t('search.modal.apply') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
