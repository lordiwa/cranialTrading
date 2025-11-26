<script setup lang="ts">
import { computed } from 'vue';
import { SimpleMatch } from '../../stores/matches';
import MatchCountdownBadge from './MatchCountdownBadge.vue';
import BaseButton from '../ui/BaseButton.vue';
import BaseBadge from '../ui/BaseBadge.vue';

const props = defineProps<{
  match: SimpleMatch;
  tab: 'new' | 'saved' | 'deleted';
}>();

const emit = defineEmits<{
  'save': [match: SimpleMatch];
  'discard': [matchId: string, tab: 'new' | 'saved'];
  'contact': [];
  'complete': [matchId: string];
  'recover': [matchId: string];
  'delete': [matchId: string];
}>();

// Determinar borde izquierdo según estado
const borderLeftClass = computed(() => {
  if (props.tab === 'new') return 'border-l-4 border-l-rust';
  if (props.tab === 'saved') return 'border-l-4 border-l-silver';
  return 'border-l-4 border-l-silver-30';
});

// Color de fondo sutil según estado
const bgClass = computed(() => {
  if (props.tab === 'new') return 'bg-rust-5';
  return 'bg-primary';
});

// Helper para obtener visuals (tipo de preferencia/status)
const getVisualFor = (obj: any) => {
  if (!obj) return { badge: 'solo', label: 'COLECCIÓN' };

  if (obj.type) {
    const t = String(obj.type).toUpperCase();
    if (t === 'VENDO') return { badge: 'vendo', label: 'VENDO' };
    if (t === 'CAMBIO') return { badge: 'cambio', label: 'CAMBIO' };
    if (t === 'BUSCO') return { badge: 'busco', label: 'BUSCO' };
  }

  if (obj.status) {
    const s = String(obj.status).toLowerCase();
    if (s === 'sell') return { badge: 'vendo', label: 'VENDO' };
    if (s === 'trade') return { badge: 'cambio', label: 'CAMBIO' };
    if (s === 'busco') return { badge: 'busco', label: 'BUSCO' };
    if (s === 'collection') return { badge: 'solo', label: 'COLECCIÓN' };
  }

  return { badge: 'solo', label: 'COLECCIÓN' };
};

// Determinar objeto a mostrar (card o preferencia)
const displayObject = computed(() => {
  if (props.match.type === 'VENDO') {
    return { card: props.match.myCard, pref: props.match.otherPreference };
  } else {
    return { card: props.match.otherCard, pref: props.match.myPreference };
  }
});

// Es match nuevo (< 24 horas)
const isNewMatch = computed(() => {
  if (!props.match.createdAt) return false;
  const now = new Date();
  const created = props.match.createdAt instanceof Date
      ? props.match.createdAt
      : new Date(props.match.createdAt);
  const diff = now.getTime() - created.getTime();
  return diff < 24 * 60 * 60 * 1000;
});

// Determinar qué mostrar (imagen + nombre)
const displayCard = computed(() => {
  return displayObject.value.card || displayObject.value.pref;
});

const displayImage = computed(() => {
  return displayCard.value?.image || '';
});

const displayName = computed(() => {
  return displayCard.value?.name || 'Sin nombre';
});
</script>

<template>
  <div :class="['bg-primary border border-silver-30 p-4 md:p-5 transition-normal', borderLeftClass, bgClass]">
    <!-- Header: Usuario + Info -->
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex-1">
        <router-link
            :to="{ name: 'userProfile', params: { userId: match.otherUserId } }"
            class="text-small md:text-body font-bold text-silver hover:text-neon transition-fast"
        >
          {{ match.otherUsername }}
        </router-link>
        <p v-if="match.otherLocation" class="text-tiny text-silver-70">
          📍 {{ match.otherLocation }}
        </p>
      </div>

      <!-- Badge NUEVO + Countdown -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <MatchCountdownBadge
            :created-at="match.createdAt"
            :life-expires-at="match.lifeExpiresAt"
            :is-new="tab === 'new' && isNewMatch"
        />
      </div>
    </div>

    <!-- Card preview -->
    <div v-if="displayCard" class="border border-silver-30 p-3 md:p-4 mb-3 flex gap-3">
      <img
          v-if="displayImage"
          :src="displayImage"
          :alt="displayName"
          class="w-16 h-20 md:w-20 md:h-24 object-cover flex-shrink-0"
      />
      <div class="flex-1 min-w-0">
        <p class="text-small md:text-body font-bold text-silver line-clamp-2">
          {{ displayName }}
        </p>
        <p class="text-tiny text-silver-70 mt-1">
          {{ displayCard.edition }}
        </p>

        <div class="flex items-center gap-2 mt-2 flex-wrap">
          <span class="text-tiny font-bold text-neon">x{{ displayCard.quantity }}</span>
          <span class="text-silver-70">|</span>
          <span class="text-tiny text-silver-70">{{ displayCard.condition }}</span>
          <BaseBadge :variant="getVisualFor(displayCard).badge">
            {{ getVisualFor(displayCard).label }}
          </BaseBadge>
        </div>

        <p v-if="displayCard.price" class="text-tiny text-neon mt-2 font-bold">
          ${{ parseFloat(displayCard.price).toFixed(2) }}
        </p>
      </div>
    </div>

    <!-- Descripción del tipo de match -->
    <p class="text-tiny text-silver-50 mb-4 px-0.5">
      <span v-if="match.type === 'VENDO'">
        💰 Este usuario quiere tu {{ match.myCard?.name || 'carta' }}
      </span>
      <span v-else>
        🔍 Buscas {{ match.myPreference?.name || 'esta carta' }} que tiene este usuario
      </span>
    </p>

    <!-- Botones según tab -->
    <div class="flex flex-col md:flex-row gap-2">
      <!-- TAB: NUEVOS -->
      <template v-if="tab === 'new'">
        <BaseButton
            variant="secondary"
            size="small"
            @click="emit('discard', match.docId || '', 'new')"
            class="flex-1"
        >
          ELIMINAR
        </BaseButton>
        <BaseButton
            size="small"
            @click="emit('save', match)"
            class="flex-1"
        >
          ME INTERESA
        </BaseButton>
      </template>

      <!-- TAB: MIS MATCHES -->
      <template v-if="tab === 'saved'">
        <BaseButton
            size="small"
            @click="emit('contact')"
            class="flex-1"
        >
          CONTACTAR
        </BaseButton>
        <BaseButton
            variant="secondary"
            size="small"
            @click="emit('complete', match.docId || '')"
            class="flex-1"
        >
          COMPLETADO
        </BaseButton>
        <BaseButton
            variant="danger"
            size="small"
            @click="emit('discard', match.docId || '', 'saved')"
            class="flex-1"
        >
          ELIMINAR
        </BaseButton>
      </template>

      <!-- TAB: ELIMINADOS -->
      <template v-if="tab === 'deleted'">
        <BaseButton
            variant="secondary"
            size="small"
            @click="emit('recover', match.docId || '')"
            class="flex-1"
        >
          RECUPERAR
        </BaseButton>
        <BaseButton
            variant="danger"
            size="small"
            @click="emit('delete', match.docId || '')"
            class="flex-1"
        >
          ELIMINAR
        </BaseButton>
      </template>
    </div>
  </div>
</template>