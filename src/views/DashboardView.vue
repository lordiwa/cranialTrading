<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">MATCHES</h1>
          <p class="text-small md:text-body text-silver-70">
            {{ calculatedMatches.length }} matches encontrados
          </p>
        </div>

        <div class="flex flex-col md:flex-row gap-2">
          <BaseButton
              variant="secondary"
              size="small"
              @click="recalculateMatches"
              :disabled="loading || (collectionStore.cards.length === 0 && preferencesStore.preferences.length === 0)"
              class="w-full md:w-auto"
          >
            {{ loading ? 'CALCULANDO...' : '🔄 RECALCULAR' }}
          </BaseButton>
          <BaseButton
              variant="secondary"
              size="small"
              @click="syncPublicData"
              :disabled="syncing"
              class="w-full md:w-auto"
          >
            {{ syncing ? 'SINCRONIZANDO...' : '📡 SINCRONIZAR' }}
          </BaseButton>
          <BaseButton
              size="small"
              @click="$router.push('/saved-matches')"
              class="w-full md:w-auto"
          >
            ⭐ MIS MATCHES
          </BaseButton>
          <!-- TEMPORAL: Botón para borrar datos -->
          <BaseButton
              variant="secondary"
              size="small"
              @click="clearAllData"
              class="w-full md:w-auto border-rust text-rust"
          >
            🗑️ BORRAR MIS DATOS
          </BaseButton>
        </div>
      </div>

      <!-- Progress bar -->
      <div v-if="loading && progressTotal > 0" class="bg-primary border border-neon p-4 mb-6">
        <div class="flex items-center justify-between mb-2">
          <p class="text-small text-neon font-bold">CALCULANDO MATCHES</p>
          <p class="text-tiny text-silver-70">{{ progressCurrent }} / {{ progressTotal }}</p>
        </div>
        <div class="w-full h-2 bg-silver-20">
          <div
              class="h-full bg-neon transition-all duration-300"
              :style="{ width: `${(progressCurrent / progressTotal) * 100}%` }"
          ></div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="loading && progressTotal === 0" class="text-center py-16">
        <BaseLoader size="large" />
        <p class="text-body text-silver-70 mt-4">Cargando datos...</p>
      </div>

      <!-- No data warning -->
      <div v-else-if="collectionStore.cards.length === 0 && preferencesStore.preferences.length === 0" class="border border-silver-30 p-8 md:p-12 text-center">
        <p class="text-h3 text-silver-70 mb-2">⚠️ No tienes cartas ni preferencias</p>
        <p class="text-body text-silver-50 mb-6">
          Agrega cartas a tu colección o crea una preferencia para encontrar matches automáticamente.
        </p>
        <RouterLink to="/collection">
          <BaseButton>VER MI COLECCIÓN</BaseButton>
        </RouterLink>
      </div>

      <!-- No matches state -->
      <div v-else-if="calculatedMatches.length === 0 && !loading" class="border border-silver-30 p-8 md:p-12 text-center">
        <p class="text-h3 text-silver-70 mb-2">📭 No hay matches disponibles</p>
        <p class="text-body text-silver-50">
          Hay {{ totalUsers }} usuarios en la plataforma. Cuando alguien tenga cartas que buscas o busque las tuyas, aparecerá aquí.
        </p>
      </div>

      <!-- Matches grid -->
      <div v-else class="space-y-md">
        <MatchCard
            v-for="match in calculatedMatches"
            :key="match.id"
            :match="match"
            tab="new"
            @save="handleSaveMatch"
            @discard="handleDiscardMatch"
        />
      </div>
    </div>
  </AppContainer>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { useAuthStore } from '../stores/auth'
import { useMatchesStore } from '../stores/matches'
import { usePriceMatchingStore } from '../stores/priceMatchingHelper'
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../services/firebase'
import {
  findCardsMatchingPreferences,
  findPreferencesMatchingCards,
  type PublicCard,
  type PublicPreference,
} from '../services/publicCards'

const collectionStore = useCollectionStore()
const preferencesStore = usePreferencesStore()
const authStore = useAuthStore()
const matchesStore = useMatchesStore()
const priceMatching = usePriceMatchingStore()

const loading = ref(false)
const syncing = ref(false)
const calculatedMatches = ref<any[]>([])
const progressCurrent = ref(0)
const progressTotal = ref(0)
const totalUsers = ref(0)

/**
 * Sincronizar datos a colecciones públicas para matches optimizados
 */
const syncPublicData = async () => {
  if (!authStore.user) return

  syncing.value = true
  try {
    // collectionStore ahora sincroniza tanto sale/trade como wishlist
    await collectionStore.syncAllToPublic()
    console.log('✅ Datos sincronizados a colecciones públicas')
  } catch (error) {
    console.error('Error sincronizando datos públicos:', error)
  } finally {
    syncing.value = false
  }
}

onMounted(async () => {
  if (!authStore.user) return

  loading.value = true
  try {
    // Cargar datos del usuario
    await Promise.all([
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])

    // Contar usuarios totales
    const usersRef = collection(db, 'users')
    const usersSnapshot = await getDocs(usersRef)
    totalUsers.value = usersSnapshot.docs.length - 1 // Excluir al usuario actual

    // ✅ CORREGIDO: Calcular matches si tiene CARTAS O PREFERENCIAS
    // Antes: Solo si tenía preferencias
    // Ahora: Si tiene cartas (para VENDER) O preferencias (para BUSCAR)
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }
})

/**
 * TEMPORAL: Borrar todos los datos del usuario (cartas, preferencias, matches)
 */
const clearAllData = async () => {
  if (!authStore.user) return

  if (!confirm('¿Borrar TODAS tus cartas, preferencias y matches? Esta acción no se puede deshacer.')) {
    return
  }

  loading.value = true
  const userId = authStore.user.id
  let errors = 0

  // Borrar cartas
  try {
    const cardsRef = collection(db, 'users', userId, 'cards')
    const cardsSnapshot = await getDocs(cardsRef)
    for (const cardDoc of cardsSnapshot.docs) {
      await deleteDoc(doc(db, 'users', userId, 'cards', cardDoc.id))
    }
    console.log(`🗑️ ${cardsSnapshot.docs.length} cartas borradas`)
  } catch (e) {
    console.error('Error borrando cartas:', e)
    errors++
  }

  // Borrar preferencias
  try {
    const prefsRef = collection(db, 'users', userId, 'preferences')
    const prefsSnapshot = await getDocs(prefsRef)
    for (const prefDoc of prefsSnapshot.docs) {
      await deleteDoc(doc(db, 'users', userId, 'preferences', prefDoc.id))
    }
    console.log(`🗑️ ${prefsSnapshot.docs.length} preferencias borradas`)
  } catch (e) {
    console.error('Error borrando preferencias:', e)
    errors++
  }

  // Borrar todas las colecciones de matches
  const matchCollections = ['matches_nuevos', 'matches_guardados', 'matches_eliminados']
  for (const colName of matchCollections) {
    try {
      const matchesRef = collection(db, 'users', userId, colName)
      const matchesSnapshot = await getDocs(matchesRef)
      for (const matchDoc of matchesSnapshot.docs) {
        await deleteDoc(doc(db, 'users', userId, colName, matchDoc.id))
      }
      console.log(`🗑️ ${matchesSnapshot.docs.length} ${colName} borrados`)
    } catch (e) {
      console.error(`Error borrando ${colName}:`, e)
      errors++
    }
  }

  // Borrar contactos guardados
  try {
    const contactsRef = collection(db, 'users', userId, 'contactos_guardados')
    const contactsSnapshot = await getDocs(contactsRef)
    for (const contactDoc of contactsSnapshot.docs) {
      await deleteDoc(doc(db, 'users', userId, 'contactos_guardados', contactDoc.id))
    }
    console.log(`🗑️ ${contactsSnapshot.docs.length} contactos borrados`)
  } catch (e) {
    console.error('Error borrando contactos:', e)
    errors++
  }

  // Limpiar stores locales
  collectionStore.clear()
  preferencesStore.clear()
  calculatedMatches.value = []

  loading.value = false

  if (errors > 0) {
    alert(`⚠️ Datos borrados con ${errors} error(es). Recarga la página.`)
  } else {
    alert('✅ Todos los datos han sido borrados.')
  }
  window.location.reload()
}

/**
 * OPTIMIZED: Calcular matches usando colecciones públicas indexadas
 * En vez de O(n) usuarios, hace queries directas por scryfallId
 */
const calculateMatches = async () => {
  if (!authStore.user) return

  loading.value = true
  progressCurrent.value = 0
  progressTotal.value = 0
  calculatedMatches.value = []

  try {
    const myCards = collectionStore.cards
    // Usar cartas con status 'wishlist' como lista de búsqueda (en lugar de preferencias)
    const myWishlist = myCards.filter(c => c.status === 'wishlist')
    const foundMatches: any[] = []
    const processedUsers = new Set<string>()

    console.log('🔍 Iniciando cálculo de matches (optimizado)...')
    console.log(`Mis cartas: ${myCards.length}, Mi wishlist: ${myWishlist.length}`)

    // PASO 1: Buscar cartas que coincidan con mi wishlist (lo que BUSCO)
    progressTotal.value = 2
    progressCurrent.value = 1

    // Debug: mostrar qué nombres estamos buscando
    const myWishlistNames = myWishlist.map(c => c.name).filter(n => n)
    console.log(`🔍 Buscando cartas por nombre:`, myWishlistNames)

    const matchingCards = await findCardsMatchingPreferences(myWishlist, authStore.user.id)
    console.log(`📦 Encontradas ${matchingCards.length} cartas que busco`)

    // PASO 2: Buscar preferencias que coincidan con mis cartas (VENDO)
    progressCurrent.value = 2

    // Debug: mostrar qué nombres tengo para vender
    const myTradeable = myCards.filter(c => c.status === 'trade' || c.status === 'sale')
    const myCardNames = myTradeable.map(c => c.name).filter(n => n)
    console.log(`🏷️ Mis cartas para vender (${myTradeable.length}):`, myCardNames)

    const matchingPrefs = await findPreferencesMatchingCards(myCards, authStore.user.id)
    console.log(`🔎 Encontradas ${matchingPrefs.length} personas buscando mis cartas`)

    // Agrupar por usuario
    const userMatches = new Map<string, {
      cards: PublicCard[],
      prefs: PublicPreference[],
      username: string,
      location: string,
      email: string
    }>()

    // Procesar cartas encontradas
    for (const card of matchingCards) {
      if (!userMatches.has(card.userId)) {
        userMatches.set(card.userId, {
          cards: [],
          prefs: [],
          username: card.username,
          location: card.location || 'Unknown',
          email: card.email || ''
        })
      }
      userMatches.get(card.userId)!.cards.push(card)
    }

    // Procesar preferencias encontradas
    for (const pref of matchingPrefs) {
      if (!userMatches.has(pref.userId)) {
        userMatches.set(pref.userId, {
          cards: [],
          prefs: [],
          username: pref.username,
          location: pref.location || 'Unknown',
          email: pref.email || ''
        })
      }
      userMatches.get(pref.userId)!.prefs.push(pref)
    }

    // Crear matches por usuario
    progressTotal.value = userMatches.size + 2
    let userIndex = 0

    for (const [otherUserId, data] of userMatches) {
      progressCurrent.value = userIndex + 3
      userIndex++

      // Convertir PublicCards a formato esperado por priceMatching
      const theirCards = data.cards.map(c => ({
        id: c.cardId,
        name: c.cardName,
        scryfallId: c.scryfallId,
        price: c.price,
        edition: c.edition,
        condition: c.condition as any,
        foil: c.foil,
        quantity: c.quantity,
        image: c.image,
        status: c.status as any,
        updatedAt: c.updatedAt?.toDate() || new Date(),
        createdAt: c.updatedAt?.toDate() || new Date(),
      }))

      const theirPreferences = data.prefs.map(p => ({
        id: p.prefId,
        name: p.cardName,
        cardName: p.cardName,
        scryfallId: p.scryfallId,
        maxPrice: p.maxPrice,
        minCondition: p.minCondition,
        // Fill required fields for type compatibility
        type: 'BUSCO' as const,
        quantity: 1,
        condition: 'NM' as const,
        edition: '',
        image: '',
        createdAt: p.updatedAt?.toDate() || new Date(),
      }))

      // INTENTAR MATCH BIDIRECCIONAL PRIMERO
      let matchCalc = priceMatching.calculateBidirectionalMatch(
          myCards,
          myWishlist,
          theirCards,
          theirPreferences
      )

      // SI NO HAY BIDIRECCIONAL, INTENTAR UNIDIRECCIONAL
      if (!matchCalc) {
        matchCalc = priceMatching.calculateUnidirectionalMatch(
            myCards,
            myWishlist,
            theirCards,
            theirPreferences
        )
      }

      if (matchCalc && matchCalc.isValid) {
        const match = {
          id: `${authStore.user.id}_${otherUserId}_${Date.now()}`,
          otherUserId,
          otherUsername: data.username,
          otherLocation: data.location,
          otherEmail: data.email,
          myCards: matchCalc.myCardsInfo || [],
          otherCards: matchCalc.theirCardsInfo || [],
          myTotalValue: matchCalc.myTotalValue,
          theirTotalValue: matchCalc.theirTotalValue,
          valueDifference: matchCalc.valueDifference,
          compatibility: matchCalc.compatibility,
          type: matchCalc.matchType === 'bidirectional' ? 'BIDIRECTIONAL' : 'UNIDIRECTIONAL',
          createdAt: new Date(),
          lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        }

        foundMatches.push(match)
        console.log(`✅ Match con ${data.username}: ${matchCalc.compatibility}%`)
      }
    }

    // Ordenar por compatibilidad descendente
    foundMatches.sort((a, b) => b.compatibility - a.compatibility)
    calculatedMatches.value = foundMatches

    // Persistir matches en Firestore
    if (foundMatches.length > 0) {
      await saveMatchesToFirebase(foundMatches)
    }

    console.log(`✅ Total de matches: ${foundMatches.length} (de ${userMatches.size} usuarios potenciales)`)
  } catch (error) {
    console.error('Error calculando matches:', error)
  } finally {
    loading.value = false
    progressCurrent.value = 0
    progressTotal.value = 0
  }
}

/**
 * CAMBIO 3: Guardar matches en Firestore
 * Limpia los matches_nuevos existentes antes de guardar los nuevos
 */
const saveMatchesToFirebase = async (matches: any[]) => {
  if (!authStore.user) return

  try {
    const matchesRef = collection(db, 'users', authStore.user.id, 'matches_nuevos')

    // Primero limpiar matches_nuevos existentes para evitar duplicados
    const existingSnapshot = await getDocs(matchesRef)
    for (const docSnap of existingSnapshot.docs) {
      await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_nuevos', docSnap.id))
    }

    // Ahora guardar los nuevos
    for (const match of matches) {
      await addDoc(matchesRef, {
        id: match.id,
        otherUserId: match.otherUserId,
        otherUsername: match.otherUsername,
        otherLocation: match.otherLocation,
        otherEmail: match.otherEmail,
        myCards: match.myCards || [],
        otherCards: match.otherCards || [],
        myTotalValue: match.myTotalValue,
        theirTotalValue: match.theirTotalValue,
        valueDifference: match.valueDifference,
        compatibility: match.compatibility,
        type: match.type,
        status: 'nuevo',
        createdAt: match.createdAt,
        lifeExpiresAt: match.lifeExpiresAt,
      })
    }

    console.log(`💾 ${matches.length} matches guardados en Firestore (${existingSnapshot.docs.length} anteriores eliminados)`)
  } catch (err) {
    console.error('Error guardando matches:', err)
  }
}

/**
 * CAMBIO 3: Integrar con matches.ts store
 */
const handleSaveMatch = async (match: any) => {
  // Convertir match a formato SimpleMatch del store
  const matchToSave = {
    id: match.id,
    type: (match.type === 'VENDO' ? 'VENDO' : 'BUSCO') as 'VENDO' | 'BUSCO',
    otherUserId: match.otherUserId,
    otherUsername: match.otherUsername,
    otherLocation: match.otherLocation,
    myCard: match.myCard,
    otherCard: match.otherCard,
    myPreference: match.myPreference,
    otherPreference: match.otherPreference,
    createdAt: match.createdAt,
    status: 'nuevo' as const,
  }

  await matchesStore.saveMatch(matchToSave)

  // Remover del dashboard
  calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== match.id)
}

const handleDiscardMatch = (matchId: string) => {
  calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== matchId)
}

const recalculateMatches = async () => {
  await calculateMatches()
}
</script>