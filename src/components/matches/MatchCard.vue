<template>
  <div class="card-base p-md md:p-lg border border-silver-30 hover:border-neon-40">
    <!-- Header con Username y Location -->
    <div class="flex justify-between items-start mb-md">
      <div class="flex-1">
        <!-- Username link con hover preview -->
        <div
            @mouseenter="showProfileHover = true"
            @mouseleave="showProfileHover = false"
            class="relative"
        >
          <RouterLink
              :to="{ name: 'userProfile', params: { username: match.username } }"
              class="text-h3 text-silver font-bold hover:text-neon transition-fast"
          >
            @{{ match.username }}
          </RouterLink>
          <UserProfileHoverCard
              :username="match.username"
              :show="showProfileHover"
          />
        </div>

        <p class="text-small text-silver-70 mt-sm">
          📍 {{ match.location || 'Ubicación no disponible' }}
        </p>
      </div>
      <span class="text-tiny text-silver-50">{{ formattedDate }}</span>
    </div>

    <div class="border-b border-silver-20 mb-md"></div>

    <!-- NUEVO: Compatibilidad y detalles de precio (si existen) -->
    <div v-if="match.compatibility !== undefined" class="mb-md p-sm bg-primary-dark border border-silver-20">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-tiny text-silver-70">Compatibilidad</p>
          <p class="text-h5 font-bold text-neon">{{ match.compatibility }}%</p>
        </div>
        <div v-if="match.valueDifference !== undefined" class="text-right">
          <p class="text-tiny text-silver-70">Diferencia de valor</p>
          <p :class="['text-h5 font-bold', getValueDifferenceColor(match.valueDifference)]">
            {{ formatValueDifference(match.valueDifference) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Cards Section with Compact Images -->
    <div class="grid grid-cols-2 gap-md mb-md">
      <!-- What They Want (Tu oferta) -->
      <div>
        <p class="text-tiny font-bold text-silver mb-sm">QUEREMOS:</p>
        <div class="space-y-xs">
          <div v-if="theyWant && theyWant.length > 0">
            <div v-for="card in theyWant" :key="`want-${card.name}`">
              <!-- Card Image - 25% size -->
              <div v-if="card.image" class="mb-xs w-1/4">
                <img
                    :src="card.image"
                    :alt="card.name"
                    class="w-full h-auto border border-silver-20 object-cover aspect-[3/4]"
                />
              </div>
              <!-- Card Info -->
              <p class="text-tiny text-silver font-medium">{{ card.name }}</p>
              <p class="text-tiny text-silver-70">x{{ card.quantity }} | {{ card.condition }}</p>
              <!-- NUEVO: Mostrar precio si disponible -->
              <p v-if="card.price" class="text-tiny text-neon font-bold">
                {{ formatMoney(card.price * card.quantity) }}
              </p>
            </div>
          </div>
          <div v-else class="text-small text-silver-50">N/A</div>
        </div>
      </div>

      <!-- What We Offer (Su oferta) -->
      <div>
        <p class="text-tiny font-bold text-silver mb-sm">OFRECEN:</p>
        <div class="space-y-xs">
          <div v-if="weOffer && weOffer.length > 0">
            <div v-for="card in weOffer" :key="`offer-${card.name}`">
              <!-- Card Image - 25% size -->
              <div v-if="card.image" class="mb-xs w-1/4">
                <img
                    :src="card.image"
                    :alt="card.name"
                    class="w-full h-auto border border-silver-20 object-cover aspect-[3/4]"
                />
              </div>
              <!-- Card Info -->
              <p class="text-tiny text-silver font-medium">{{ card.name }}</p>
              <p class="text-tiny text-silver-70">x{{ card.quantity }} | {{ card.condition }}</p>
              <!-- NUEVO: Mostrar precio si disponible -->
              <p v-if="card.price" class="text-tiny text-neon font-bold">
                {{ formatMoney(card.price * card.quantity) }}
              </p>
            </div>
          </div>
          <div v-else class="text-small text-silver-50">N/A</div>
        </div>
      </div>
    </div>

    <!-- NUEVO: Totales de valor (si existen) -->
    <div v-if="match.myTotalValue !== undefined && match.theirTotalValue !== undefined" class="mb-md p-sm bg-primary-dark border border-silver-20">
      <div class="grid grid-cols-2 gap-md text-center">
        <div>
          <p class="text-tiny text-silver-70">Tu valor</p>
          <p class="text-small font-bold text-silver">{{ formatMoney(match.myTotalValue) }}</p>
        </div>
        <div>
          <p class="text-tiny text-silver-70">Su valor</p>
          <p class="text-small font-bold text-silver">{{ formatMoney(match.theirTotalValue) }}</p>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-sm md:gap-md flex-wrap">
      <!-- NUEVOS Tab -->
      <template v-if="tab === 'new'">
        <button
            @click="$emit('save', match)"
            class="btn-primary px-lg py-md text-small font-bold transition-fast flex-1"
        >
          ✓ ME INTERESA
        </button>
        <button
            @click="$emit('discard', match.id, 'new')"
            class="btn-secondary px-lg py-md text-small font-bold transition-fast flex-1"
        >
          ✕ IGNORAR
        </button>
      </template>

      <!-- SAVED Tab (MIS MATCHES) -->
      <template v-if="tab === 'saved'">
        <button
            @click="$emit('contactar', { username: match.username, email: match.email, location: match.location })"
            class="btn-primary px-lg py-md text-small font-bold transition-fast flex-1"
        >
          💬 CONTACTAR
        </button>

        <button
            @click="$emit('marcar-completado', match.id)"
            class="btn-secondary px-lg py-md text-small font-bold transition-fast flex-1"
        >
          ✓ COMPLETADO
        </button>

        <button
            @click="$emit('descartar', match.id)"
            class="btn-danger px-lg py-md text-small font-bold transition-fast"
        >
          ✕ ELIMINAR
        </button>
      </template>

      <!-- DELETED Tab -->
      <template v-if="tab === 'deleted'">
        <button
            @click="$emit('recover', match.id)"
            class="btn-secondary px-lg py-md text-small font-bold transition-fast flex-1"
        >
          ↩️ RECUPERAR
        </button>
        <button
            @click="$emit('delete', match.id)"
            class="btn-danger px-lg py-md text-small font-bold transition-fast flex-1"
        >
          🗑️ ELIMINAR
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import UserProfileHoverCard from '../user/UserProfileHoverCard.vue'

interface Card {
  name: string
  quantity?: number
  condition?: string
  image?: string | null
  price?: number
  [key: string]: any
}

interface Match {
  id: string
  username: string
  location?: string
  email?: string
  myCard?: Card | null
  otherPreference?: Card | null
  myTotalValue?: number
  theirTotalValue?: number
  valueDifference?: number
  compatibility?: number
  [key: string]: any
}

interface Props {
  match: Match
  tab: 'new' | 'saved' | 'deleted'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  save: [match: Match]
  discard: [matchId: string, tab: 'new']
  contactar: [contact: { username: string; email?: string; location?: string }]
  'marcar-completado': [matchId: string]
  descartar: [matchId: string]
  recover: [matchId: string]
  delete: [matchId: string]
}>()

const showProfileHover = ref(false)

// Lo que ELLOS QUIEREN (nuestra oferta)
const theyWant = computed(() => {
  const cards: Card[] = []

  // Si nosotros ofrecemos una carta (myCard)
  if (props.match.myCard) {
    const card = {
      name: props.match.myCard.name || 'Carta desconocida',
      quantity: props.match.myCard.quantity || 1,
      condition: props.match.myCard.condition || 'M',
      image: props.match.myCard.image || null,
      price: props.match.myCard.price,
    }
    cards.push(card)
  }

  return cards.length > 0 ? cards : null
})

// Lo que NOSOTROS QUEREMOS (su oferta)
const weOffer = computed(() => {
  const cards: Card[] = []

  // Si ellos ofrecen una preferencia (otherPreference)
  if (props.match.otherPreference) {
    const card = {
      name: props.match.otherPreference.name || 'Carta desconocida',
      quantity: props.match.otherPreference.quantity || 1,
      condition: props.match.otherPreference.condition || 'M',
      image: props.match.otherPreference.image || null,
      price: props.match.otherPreference.price,
    }
    cards.push(card)
  }

  return cards.length > 0 ? cards : null
})

const formattedDate = computed(() => {
  if (!props.match.createdAt) return 'reciente'

  try {
    const now = new Date()
    const created = typeof props.match.createdAt === 'string'
        ? new Date(props.match.createdAt)
        : props.match.createdAt instanceof Date
            ? props.match.createdAt
            : props.match.createdAt?.toDate?.() || new Date()

    const diff = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))

    if (diff === 0) return 'hoy'
    if (diff === 1) return 'ayer'
    if (diff < 0) return 'reciente'
    return `hace ${diff}d`
  } catch (e) {
    return 'reciente'
  }
})

// NUEVO: Funciones para mostrar precio
const formatMoney = (value: number): string => `$${value.toFixed(2)}`

const getValueDifferenceColor = (diff: number): string => {
  if (diff > 0) return 'text-neon' // A mi favor
  if (diff < 0) return 'text-rust' // A su favor
  return 'text-silver' // Igualado
}

const formatValueDifference = (diff: number): string => {
  if (diff === 0) return 'Igual'
  if (diff > 0) return `+${formatMoney(diff)} favor`
  return `${formatMoney(Math.abs(diff))} su favor`
}
</script>

<style scoped>
/* All styles in global style.css */
</style>