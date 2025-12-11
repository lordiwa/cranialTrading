<template>
  <AppContainer>
    <div>
      <div class="mb-lg">
        <h1 class="text-h2 font-bold text-silver">MATCHES</h1>
        <p class="text-small text-silver-70 mt-sm">{{ calculatedMatches.length }} matches encontrados</p>
      </div>

      <div v-if="loading" class="text-center py-xl">
        <BaseLoader />
        <p class="text-body text-silver-70 mt-4">Buscando matches...</p>
      </div>

      <div v-else-if="calculatedMatches.length === 0" class="text-center py-xl">
        <p class="text-body text-silver-70">No hay matches disponibles</p>
      </div>

      <div v-else class="space-y-md">
        <div
            v-for="match in calculatedMatches"
            :key="match.id"
            class="bg-primary border border-silver-30 p-lg"
        >
          <div class="flex justify-between items-start mb-md">
            <div>
              <p class="text-h3 font-bold text-silver">{{ match.otherUsername }}</p>
              <p class="text-small text-silver-70">{{ match.otherLocation }}</p>
            </div>
            <p class="text-h3 font-bold text-neon">{{ match.compatibility }}%</p>
          </div>

          <div class="grid grid-cols-2 gap-lg mb-lg">
            <div>
              <p class="text-small text-silver-70 mb-2">TÚ OFRECES</p>
              <div class="text-small text-silver">
                <div v-for="card in match.myCardsInfo" :key="card.id">
                  {{ card.name }} x{{ card.quantity }}
                </div>
                <p class="text-neon font-bold mt-2">${{ match.myTotalValue.toFixed(2) }}</p>
              </div>
            </div>

            <div>
              <p class="text-small text-silver-70 mb-2">RECIBES</p>
              <div class="text-small text-silver">
                <div v-for="card in match.theirCardsInfo" :key="card.id">
                  {{ card.name }} x{{ card.quantity }}
                </div>
                <p class="text-neon font-bold mt-2">${{ match.theirTotalValue.toFixed(2) }}</p>
              </div>
            </div>
          </div>

          <p class="text-small text-silver-70 mb-md">
            Diferencia:
            <span :class="match.valueDifference > 0 ? 'text-neon' : 'text-silver-70'">
              ${{ Math.abs(match.valueDifference).toFixed(2) }}
            </span>
          </p>

          <div class="flex gap-md">
            <BaseButton @click="handleSaveMatch(match.id)">ME INTERESA</BaseButton>
            <BaseButton variant="secondary" @click="handleDiscardMatch(match.id)">IGNORAR</BaseButton>
          </div>
        </div>
      </div>
    </div>
  </AppContainer>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { useAuthStore } from '../stores/auth'
import { usePriceMatchingStore } from '../stores/priceMatchingHelper'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'

const collectionStore = useCollectionStore()
const preferencesStore = usePreferencesStore()
const authStore = useAuthStore()
const priceMatching = usePriceMatchingStore()

const loading = ref(false)
const calculatedMatches = ref<any[]>([])

onMounted(async () => {
  await collectionStore.loadCollection()
  await preferencesStore.loadPreferences()
  await calculateMatches()
})

const calculateMatches = async () => {
  if (!authStore.user) return

  loading.value = true
  calculatedMatches.value = []

  try {
    const myCards = collectionStore.cards
    const myPrefs = preferencesStore.preferences

    console.log('🔍 Starting match calculation...')
    console.log('My cards:', myCards.length)
    console.log('My preferences:', myPrefs.length)

    if (myPrefs.length === 0) {
      loading.value = false
      return
    }

    const usersRef = collection(db, 'users')
    const usersSnapshot = await getDocs(usersRef)
    const foundMatches: any[] = []

    console.log('Total users found:', usersSnapshot.docs.length)

    for (const userDoc of usersSnapshot.docs) {
      if (userDoc.id === authStore.user.id) continue

      try {
        const otherUserId = userDoc.id
        const otherUserData = userDoc.data()

        console.log(`\n📊 Checking user: ${otherUserData.username}`)

        const theirCardsRef = collection(db, 'users', otherUserId, 'cards')
        const theirCardsSnapshot = await getDocs(theirCardsRef)
        const theirCards = theirCardsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as any[]

        const theirPrefsRef = collection(db, 'users', otherUserId, 'preferencias')
        const theirPrefsSnapshot = await getDocs(theirPrefsRef)
        const theirPreferences = theirPrefsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as any[]

        console.log(`  Their cards: ${theirCards.length}, Their prefs: ${theirPreferences.length}`)

        // DEBUG: mostrar cartas de srparca
        if (otherUserData.username === 'srparca') {
          console.log('  [SRPARCA CARDS DETAIL]:')
          theirCards.forEach(c => {
            if (c.name.includes('Phlage')) {
              console.log(`    ${c.name} - status: ${c.status}, price: $${c.price}, qty: ${c.quantity}`)
            }
          })
          console.log('  [SRPARCA PREFS]:', theirPreferences.map(p => p.name))
          console.log('  [MY PREFS - busco]:', myPrefs.map(p => p.name))
        }

        // INTENTAR MATCH BIDIRECCIONAL PRIMERO
        let matchDetails = priceMatching.calculateBidirectionalMatch(
            myCards,
            myPrefs,
            theirCards,
            theirPreferences
        )

        // SI NO HAY BIDIRECCIONAL, INTENTAR UNIDIRECCIONAL
        if (!matchDetails) {
          matchDetails = priceMatching.calculateUnidirectionalMatch(
              myCards,
              myPrefs,
              theirCards,
              theirPreferences
          )
        }

        if (matchDetails) {
          console.log(`  ✅ MATCH FOUND! Compatibility: ${matchDetails.compatibility}%`)
          foundMatches.push({
            id: `${authStore.user.id}_${otherUserId}_${Date.now()}`,
            otherUserId,
            otherUsername: otherUserData.username,
            otherLocation: otherUserData.location || 'Unknown',
            otherEmail: otherUserData.email,
            myCardsInfo: matchDetails.myCardsInfo,
            theirCardsInfo: matchDetails.theirCardsInfo,
            myTotalValue: matchDetails.myTotalValue,
            theirTotalValue: matchDetails.theirTotalValue,
            valueDifference: matchDetails.valueDifference,
            compatibility: matchDetails.compatibility,
          })
        } else {
          console.log(`  ❌ No match`)
        }
      } catch (err) {
        console.error(`Error processing user ${userDoc.id}:`, err)
      }
    }

    console.log(`\n✅ Total matches found: ${foundMatches.length}`)
    calculatedMatches.value = foundMatches.sort((a, b) => b.compatibility - a.compatibility)
  } catch (error) {
    console.error('Error calculating matches:', error)
  } finally {
    loading.value = false
  }
}

const handleSaveMatch = (matchId: string) => {
  console.log('Save match:', matchId)
  // TODO: Guardar en store de matches
}

const handleDiscardMatch = (matchId: string) => {
  calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== matchId)
}
</script>