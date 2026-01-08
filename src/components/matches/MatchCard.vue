<template>
  <div class="border border-silver-30 p-6 md:p-8 hover:border-neon-30 hover:shadow-lg transition-all duration-300">
    <!-- Header: Match Title + Compatibility -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h3 class="text-h3 text-silver font-bold">
          MATCH #{{ matchIndex }} - COMPATIBILIDAD:
          <span class="text-neon">{{ match.compatibility }}%</span>
        </h3>
        <p class="text-small text-silver-70 mt-1">
          Con
          <RouterLink
              :to="{ name: 'userProfile', params: { username: match.otherUsername } }"
              class="text-neon hover:underline font-bold"
          >
            @{{ match.otherUsername }}
          </RouterLink>
          • 📍 {{ match.otherLocation }}
        </p>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-silver-20 my-6"></div>

    <!-- Match Content Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
      <!-- TÚ OFRECES -->
      <div>
        <h4 class="text-small font-bold text-silver-70 uppercase mb-4">Tú Ofreces</h4>
        <div class="space-y-2">
          <div v-if="match.myCards && match.myCards.length > 0">
            <div v-for="card in match.myCards" :key="card.id" class="bg-silver-5 border border-silver-20 p-3 rounded-sm">
              <p class="text-body font-bold text-silver">{{ card.name }}</p>
              <p class="text-small text-silver-70">{{ card.edition }} | {{ card.condition }}</p>
              <p class="text-small text-neon font-bold mt-1">x{{ card.quantity }} @ ${{ card.price?.toFixed(2) || '0.00' }}</p>
            </div>
          </div>
          <div v-else class="text-small text-silver-50 italic">
            Sin cartas específicas (regalando valor)
          </div>
        </div>
        <p class="text-h3 text-neon font-bold mt-4">${{ match.myTotalValue?.toFixed(2) || '0.00' }}</p>
        <p class="text-tiny text-silver-70">Valor total</p>
      </div>

      <!-- RECIBES -->
      <div>
        <h4 class="text-small font-bold text-silver-70 uppercase mb-4">Recibes</h4>
        <div class="space-y-2">
          <div v-if="match.otherCards && match.otherCards.length > 0">
            <div v-for="card in match.otherCards" :key="card.id" class="bg-silver-5 border border-silver-20 p-3 rounded-sm">
              <p class="text-body font-bold text-silver">{{ card.name }}</p>
              <p class="text-small text-silver-70">{{ card.edition }} | {{ card.condition }}</p>
              <p class="text-small text-neon font-bold mt-1">x{{ card.quantity }} @ ${{ card.price?.toFixed(2) || '0.00' }}</p>
            </div>
          </div>
          <div v-else class="text-small text-silver-50 italic">
            Sin cartas específicas (regalando valor)
          </div>
        </div>
        <p class="text-h3 text-neon font-bold mt-4">${{ match.theirTotalValue?.toFixed(2) || '0.00' }}</p>
        <p class="text-tiny text-silver-70">Valor total</p>
      </div>
    </div>

    <!-- Price Difference -->
    <div class="bg-silver-5 border border-silver-20 p-4 mb-6">
      <div class="flex justify-between items-center">
        <p class="text-small text-silver-70">Diferencia de precio:</p>
        <p :class="[
          'text-h3 font-bold',
          match.valueDifference >= 0 ? 'text-neon' : 'text-silver-50'
        ]">
          {{ match.valueDifference >= 0 ? '+' : '' }}${{ Math.abs(match.valueDifference).toFixed(2) }}
        </p>
      </div>
      <p class="text-tiny text-silver-70 mt-2">
        {{ match.valueDifference >= 0 ? 'Tú recibes ventaja' : 'El otro recibe ventaja' }}
      </p>
    </div>

    <!-- Match Type Badge -->
    <div class="flex gap-2 mb-6">
      <span v-if="match.type === 'BIDIRECTIONAL'" class="inline-block bg-neon-10 border border-neon px-3 py-1">
        <p class="text-tiny font-bold text-neon">✓ BIDIRECCIONAL</p>
      </span>
      <span v-else class="inline-block bg-silver-10 border border-silver-30 px-3 py-1">
        <p class="text-tiny font-bold text-silver-70">→ UNIDIRECCIONAL</p>
      </span>
    </div>

    <!-- Divider -->
    <div class="border-t border-silver-20 my-6"></div>

    <!-- Actions -->
    <div class="flex flex-col md:flex-row gap-3">
      <BaseButton
          class="flex-1"
          @click="handleSaveMatch"
          :disabled="saving"
      >
        {{ saving ? '⏳ GUARDANDO...' : '💾 ME INTERESA' }}
      </BaseButton>
      <BaseButton
          variant="secondary"
          class="flex-1"
          @click="handleDiscard"
      >
        ✕ IGNORAR
      </BaseButton>
      <BaseButton
          variant="secondary"
          class="flex-1"
          @click="copyEmailToClipboard"
      >
        📧 COPIAR EMAIL
      </BaseButton>
    </div>

    <!-- Modal de Contacto -->
    <BaseModal
        :show="showContactModal"
        title="CONTACTO"
        @close="showContactModal = false"
    >
      <div class="space-y-3 mb-6">
        <div>
          <p class="text-tiny text-silver-70 uppercase">Usuario</p>
          <p class="text-body font-bold text-silver">@{{ match.otherUsername }}</p>
        </div>
        <div>
          <p class="text-tiny text-silver-70 uppercase">Ubicación</p>
          <p class="text-body text-silver">📍 {{ match.otherLocation }}</p>
        </div>
        <div>
          <p class="text-tiny text-silver-70 uppercase">Email</p>
          <p class="text-body text-silver">{{ match.otherEmail }}</p>
        </div>
      </div>

      <div class="flex gap-2 pt-4">
        <BaseButton class="flex-1" @click="copyEmailToClipboard">
          📧 COPIAR EMAIL
        </BaseButton>
        <BaseButton variant="secondary" class="flex-1" @click="showContactModal = false">
          CERRAR
        </BaseButton>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'

interface Props {
  match: any
  matchIndex?: number
  tab?: string
}

const props = withDefaults(defineProps<Props>(), {
  matchIndex: 0,
  tab: 'new'
})

const emit = defineEmits(['save', 'discard'])

const saving = ref(false)
const showContactModal = ref(false)

const handleSaveMatch = async () => {
  saving.value = true
  try {
    emit('save', props.match)
  } finally {
    saving.value = false
  }
}

const handleDiscard = () => {
  emit('discard', props.match.id)
}

const copyEmailToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.match.otherEmail)
    alert('✅ Email copiado: ' + props.match.otherEmail)
  } catch (err) {
    alert('❌ Error al copiar email')
  }
}
</script>

<style scoped>
/* Los estilos se aplican directamente con clases Tailwind en el template */
</style>