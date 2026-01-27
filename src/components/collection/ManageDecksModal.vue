<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDecksStore } from '../../stores/decks'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import type { Card } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  close: []
}>()

const decksStore = useDecksStore()
const toastStore = useToastStore()
const { getAllocationsForCard } = useCardAllocation()

const saving = ref(false)

// Track allocation changes: deckId -> { quantity, isInSideboard }
const allocations = ref<Record<string, { quantity: number; isInSideboard: boolean }>>({})

// Current allocations for this card
const currentAllocations = computed(() => {
  if (!props.card) return []
  return getAllocationsForCard(props.card.id)
})

// Total quantity in the card
const totalQty = computed(() => props.card?.quantity || 0)

// Currently allocated (sum of all deck allocations)
const allocatedQty = computed(() => {
  return Object.values(allocations.value).reduce((sum, a) => sum + a.quantity, 0)
})

// Remaining available
const remainingQty = computed(() => {
  return totalQty.value - allocatedQty.value
})

// Initialize allocations when card changes
watch(() => [props.show, props.card], () => {
  if (props.show && props.card) {
    // Reset and populate with current allocations
    const newAllocations: Record<string, { quantity: number; isInSideboard: boolean }> = {}

    for (const alloc of currentAllocations.value) {
      newAllocations[alloc.deckId] = {
        quantity: alloc.quantity,
        isInSideboard: alloc.isInSideboard || false
      }
    }

    allocations.value = newAllocations
  }
}, { immediate: true })

// Get allocation for a specific deck
const getDeckAllocation = (deckId: string) => {
  return allocations.value[deckId]?.quantity || 0
}

// Check if deck is in sideboard
const isInSideboard = (deckId: string) => {
  return allocations.value[deckId]?.isInSideboard || false
}

// Update allocation for a deck
const updateAllocation = (deckId: string, quantity: number) => {
  if (quantity < 0) quantity = 0

  // Check if we have enough available
  const currentForDeck = allocations.value[deckId]?.quantity || 0
  const newTotal = allocatedQty.value - currentForDeck + quantity

  if (newTotal > totalQty.value) {
    toastStore.show(`Solo tienes ${totalQty.value} copias disponibles`, 'error')
    return
  }

  if (quantity === 0) {
    delete allocations.value[deckId]
  } else {
    allocations.value[deckId] = {
      quantity,
      isInSideboard: allocations.value[deckId]?.isInSideboard || false
    }
  }
}

// Toggle sideboard
const toggleSideboard = (deckId: string) => {
  if (allocations.value[deckId]) {
    allocations.value[deckId].isInSideboard = !allocations.value[deckId].isInSideboard
  }
}

// Increment allocation
const increment = (deckId: string) => {
  const current = getDeckAllocation(deckId)
  updateAllocation(deckId, current + 1)
}

// Decrement allocation
const decrement = (deckId: string) => {
  const current = getDeckAllocation(deckId)
  if (current > 0) {
    updateAllocation(deckId, current - 1)
  }
}

// Save all changes
const handleSave = async () => {
  if (!props.card) return

  saving.value = true

  try {
    const cardId = props.card.id

    // Get original allocations
    const originalAllocations = new Map(
      currentAllocations.value.map(a => [`${a.deckId}-${a.isInSideboard}`, a])
    )

    // Process each deck
    for (const deck of decksStore.decks) {
      const newAlloc = allocations.value[deck.id]
      const newQty = newAlloc?.quantity || 0
      const newSideboard = newAlloc?.isInSideboard || false

      // Find original allocation for this deck (mainboard and sideboard)
      const origMain = originalAllocations.get(`${deck.id}-false`)
      const origSide = originalAllocations.get(`${deck.id}-true`)

      // Handle mainboard allocation
      if (!newSideboard) {
        if (origMain) {
          if (newQty !== origMain.quantity) {
            if (newQty === 0) {
              await decksStore.deallocateCard(deck.id, cardId, false)
            } else {
              await decksStore.updateAllocation(deck.id, cardId, false, newQty)
            }
          }
        } else if (newQty > 0) {
          await decksStore.allocateCardToDeck(deck.id, cardId, newQty, false)
        }

        // Remove sideboard if was there before
        if (origSide) {
          await decksStore.deallocateCard(deck.id, cardId, true)
        }
      } else {
        // Handle sideboard allocation
        if (origSide) {
          if (newQty !== origSide.quantity) {
            if (newQty === 0) {
              await decksStore.deallocateCard(deck.id, cardId, true)
            } else {
              await decksStore.updateAllocation(deck.id, cardId, true, newQty)
            }
          }
        } else if (newQty > 0) {
          await decksStore.allocateCardToDeck(deck.id, cardId, newQty, true)
        }

        // Remove mainboard if was there before
        if (origMain) {
          await decksStore.deallocateCard(deck.id, cardId, false)
        }
      }
    }

    toastStore.show('Asignaciones actualizadas', 'success')
    emit('close')
  } catch (error) {
    console.error('Error saving allocations:', error)
    toastStore.show('Error al guardar', 'error')
  } finally {
    saving.value = false
  }
}

// Get card image
const cardImage = computed(() => {
  if (!props.card) return ''
  return props.card.image || ''
})
</script>

<template>
  <BaseModal :show="show" @close="emit('close')" :close-on-click-outside="false">
    <div class="space-y-6 w-full max-w-lg">
      <!-- Header -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">ASIGNAR A MAZOS</h2>
        <p class="text-small text-silver-70">Gestiona en qué mazos está esta carta</p>
      </div>

      <!-- Card info -->
      <div v-if="card" class="flex gap-4 p-4 bg-secondary border border-silver-30">
        <img
          v-if="cardImage"
          :src="cardImage"
          :alt="card.name"
          class="w-20 h-28 object-cover border border-silver-30"
        />
        <div class="flex-1">
          <p class="font-bold text-silver text-h3">{{ card.name }}</p>
          <p class="text-small text-silver-70">{{ card.edition }} - {{ card.condition }}</p>
          <p class="text-small text-neon font-bold mt-2">
            {{ totalQty }} copias total
          </p>
          <p class="text-tiny mt-1" :class="remainingQty > 0 ? 'text-silver-70' : 'text-rust'">
            {{ remainingQty }} sin asignar
          </p>
        </div>
      </div>

      <!-- Decks list -->
      <div class="space-y-3 max-h-[40vh] overflow-y-auto">
        <div v-if="decksStore.decks.length === 0" class="text-center py-8">
          <p class="text-small text-silver-70">No tienes mazos creados</p>
        </div>

        <div
          v-for="deck in decksStore.decks"
          :key="deck.id"
          class="p-3 border transition-150"
          :class="getDeckAllocation(deck.id) > 0 ? 'border-neon bg-neon-5' : 'border-silver-30'"
        >
          <div class="flex items-center justify-between gap-3">
            <!-- Deck info -->
            <div class="flex-1 min-w-0">
              <p class="font-bold text-silver truncate">{{ deck.name }}</p>
              <p class="text-tiny text-silver-50">{{ deck.format.toUpperCase() }}</p>
            </div>

            <!-- Quantity controls -->
            <div class="flex items-center gap-2">
              <button
                @click="decrement(deck.id)"
                :disabled="getDeckAllocation(deck.id) === 0"
                class="w-8 h-8 flex items-center justify-center border border-silver-30 text-silver hover:border-neon hover:text-neon transition-150 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                -
              </button>

              <span class="w-8 text-center font-bold" :class="getDeckAllocation(deck.id) > 0 ? 'text-neon' : 'text-silver-50'">
                {{ getDeckAllocation(deck.id) }}
              </span>

              <button
                @click="increment(deck.id)"
                :disabled="remainingQty <= 0 && getDeckAllocation(deck.id) === 0"
                class="w-8 h-8 flex items-center justify-center border border-silver-30 text-silver hover:border-neon hover:text-neon transition-150 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>

            <!-- Sideboard toggle -->
            <button
              v-if="getDeckAllocation(deck.id) > 0"
              @click="toggleSideboard(deck.id)"
              class="px-2 py-1 text-tiny border transition-150"
              :class="isInSideboard(deck.id) ? 'border-amber text-amber' : 'border-silver-30 text-silver-50 hover:border-silver'"
            >
              {{ isInSideboard(deck.id) ? 'SIDE' : 'MAIN' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton class="flex-1" @click="handleSave" :disabled="saving">
          {{ saving ? 'GUARDANDO...' : 'GUARDAR' }}
        </BaseButton>
        <BaseButton variant="secondary" class="flex-1" @click="emit('close')">
          CANCELAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.bg-neon-5 {
  background-color: rgba(204, 255, 0, 0.05);
}
</style>
