<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMatchesStore } from '../stores/matches'
import { useContactsStore } from '../stores/contacts'
import { useI18n } from '../composables/useI18n'
import { db } from '../services/firebase'
import { doc, getDoc } from 'firebase/firestore'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import SpriteIcon from '../components/ui/SpriteIcon.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { getAvatarUrlForUser } from '../utils/avatar'

const matchesStore = useMatchesStore()
const contactsStore = useContactsStore()
const { t } = useI18n()

// State
const activeTab = ref<'new' | 'sent' | 'saved' | 'deleted'>('new')
const matchesWithEmails = ref<any[]>([])
const loading = ref(false)

// ✅ DATOS REALES desde store
const newMatches = computed(() => matchesStore.newMatches)
const sentMatches = computed(() => matchesStore.sentMatches)
const savedMatches = computed(() => matchesStore.savedMatches)
const deletedMatches = computed(() => matchesStore.deletedMatches)

// Tabs configuration
const tabs = computed(() => [
  {
    id: 'new' as const,
    label: t('matches.tabs.new'),
    icon: 'dot',
    count: newMatches.value.length
  },
  {
    id: 'sent' as const,
    label: t('matches.tabs.sent'),
    icon: 'hand',
    count: sentMatches.value.length
  },
  {
    id: 'saved' as const,
    label: t('matches.tabs.saved'),
    icon: 'star',
    count: savedMatches.value.length
  },
  {
    id: 'deleted' as const,
    label: t('matches.tabs.deleted'),
    icon: 'trash',
    count: deletedMatches.value.length
  }
])

// Group matches by user option
const groupByUser = ref(true)

// Current tab matches
const currentMatches = computed(() => {
  switch (activeTab.value) {
    case 'new': return newMatches.value
    case 'sent': return sentMatches.value
    case 'saved': return matchesWithEmails.value
    case 'deleted': return deletedMatches.value
    default: return []
  }
})

// Grouped matches by user
const groupedMatches = computed(() => {
  if (!groupByUser.value) return null

  const groups: Record<string, { username: string; userId: string; avatarUrl?: string; location?: string; matches: any[] }> = {}

  for (const match of currentMatches.value) {
    const key = match.otherUserId
    if (!groups[key]) {
      groups[key] = {
        username: match.otherUsername,
        userId: match.otherUserId,
        avatarUrl: match.otherAvatarUrl,
        location: match.otherLocation,
        matches: []
      }
    }
    groups[key].matches.push(match)
  }

  return Object.values(groups).sort((a, b) => b.matches.length - a.matches.length)
})

// Today's matches (for bulk action)
const todaysNewMatches = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return newMatches.value.filter(m => {
    const created = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)
    return created >= today
  })
})

// ✅ CARGAR EMAILS para matches guardados
const loadSavedMatchesWithEmails = async () => {
  loading.value = true
  try {
    const matchesWithData = await Promise.all(
        savedMatches.value.map(async (match) => {
          try {
            // Obtener email del usuario desde Firestore
            const userRef = doc(db, 'users', match.otherUserId)
            const userSnap = await getDoc(userRef)

            if (userSnap.exists()) {
              const userData = userSnap.data()
              return {
                ...match,
                otherEmail: userData.email || '',
              }
            }
          } catch (err) {
            console.error(`Error cargando email para ${match.otherUserId}:`, err)
          }

          return {
            ...match,
            otherEmail: '',
          }
        })
    )

    matchesWithEmails.value = matchesWithData
  } finally {
    loading.value = false
  }
}

// ✅ ACCIONES REALES conectadas al store
const handleSaveMatch = async (match: any) => {
  await matchesStore.saveMatch(match)
  // Recargar emails después de guardar
  await loadSavedMatchesWithEmails()
}

const handleDiscardMatch = async (matchId: string) => {
  const tab = activeTab.value === 'new' ? 'new' : 'saved'
  await matchesStore.discardMatch(matchId, tab)
  // Recargar emails después de descartar
  await loadSavedMatchesWithEmails()
}

const handleTabChange = (tabId: 'new' | 'sent' | 'saved' | 'deleted') => {
  activeTab.value = tabId
}

// Bulk save all today's matches
const handleSaveAllToday = async () => {
  for (const match of todaysNewMatches.value) {
    await matchesStore.saveMatch(match)
  }
  await loadSavedMatchesWithEmails()
}

// ✅ CARGAR DATOS AL MONTAR
onMounted(async () => {
  await matchesStore.loadAllMatches()
  await contactsStore.loadSavedContacts()
  await loadSavedMatchesWithEmails()
})

onUnmounted(() => {
  matchesStore.cleanExpiredMatches()
  contactsStore.stopListeningContacts()
})
</script>

<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="mb-lg md:mb-xl">
        <h1 class="text-h2 md:text-h1 font-bold text-silver mb-sm flex items-center gap-sm">
          {{ t('matches.title') }}
          <HelpTooltip
              :text="t('help.tooltips.matches.compatibility')"
              :title="t('help.titles.compatibility')"
          />
        </h1>
        <p class="text-small md:text-body text-silver-70">
          {{ t('matches.subtitle') }}
        </p>
      </div>

      <!-- Tabs -->
      <div class="flex flex-wrap gap-sm md:gap-md mb-lg md:mb-xl border-b border-silver-20">
        <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="handleTabChange(tab.id)"
            :class="[
            'pb-md border-b-2 transition-fast whitespace-nowrap font-bold text-small md:text-body flex items-center gap-sm',
            activeTab === tab.id
              ? 'border-neon text-neon'
              : 'border-transparent text-silver-70 hover:text-silver'
          ]"
        >
          <SpriteIcon :name="tab.icon" size="small" />
          <span>{{ tab.label }}</span>
          <HelpTooltip
              :text="tab.id === 'new' ? t('help.tooltips.matches.tabNew') :
                     tab.id === 'sent' ? t('help.tooltips.matches.tabSent') :
                     tab.id === 'saved' ? t('help.tooltips.matches.tabSaved') :
                     t('help.tooltips.matches.tabDeleted')"
              :title="tab.id === 'new' ? t('help.titles.tabNew') :
                      tab.id === 'sent' ? t('help.titles.tabSent') :
                      tab.id === 'saved' ? t('help.titles.tabSaved') :
                      t('help.titles.tabDeleted')"
          />
          <span v-if="tab.count > 0" class="text-tiny bg-neon text-primary px-sm py-xs font-bold rounded-sm">
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Controls bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <!-- Group toggle -->
        <label class="flex items-center gap-2 cursor-pointer">
          <input
              v-model="groupByUser"
              type="checkbox"
              class="w-4 h-4 accent-neon"
          />
          <span class="text-small text-silver-70">{{ t('matches.controls.groupByUser') }}</span>
        </label>

        <!-- Bulk action -->
        <BaseButton
            v-if="activeTab === 'new' && todaysNewMatches.length > 0"
            size="small"
            @click="handleSaveAllToday"
        >
          {{ t('matches.controls.saveAllToday', { count: todaysNewMatches.length }) }}
        </BaseButton>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center items-center py-xl">
        <BaseLoader size="large" />
      </div>

      <!-- Empty state -->
      <div v-else-if="currentMatches.length === 0" class="border border-silver-30 p-8 md:p-12 text-center rounded-md">
        <p class="text-body text-silver-70">
          {{ activeTab === 'new' ? t('matches.empty.new.title') :
            activeTab === 'sent' ? t('matches.empty.sent.title') :
            activeTab === 'saved' ? t('matches.empty.saved.title') :
                t('matches.empty.deleted.title') }}
        </p>
        <p class="text-small text-silver-50 mt-2">
          {{ activeTab === 'new' ? t('matches.empty.new.message') :
            activeTab === 'sent' ? t('matches.empty.sent.message') :
            activeTab === 'saved' ? t('matches.empty.saved.message') :
                t('matches.empty.deleted.message') }}
        </p>
      </div>

      <!-- Matches list - Grouped by user -->
      <div v-else-if="groupByUser && groupedMatches" class="space-y-8">
        <div
            v-for="group in groupedMatches"
            :key="group.userId"
            class="border border-silver-30 rounded-md overflow-hidden"
        >
          <!-- Group header -->
          <div class="bg-silver-5 px-4 py-3 flex items-center gap-3 border-b border-silver-20">
            <img
                :src="getAvatarUrlForUser(group.username, 32, group.avatarUrl)"
                alt=""
                class="w-8 h-8 rounded-full"
            />
            <div class="flex-1">
              <router-link
                  :to="`/@${group.username}`"
                  class="text-body font-bold text-neon hover:underline"
              >
                @{{ group.username }}
              </router-link>
              <p v-if="group.location" class="text-tiny text-silver-50">📍 {{ group.location }}</p>
            </div>
            <span class="text-small text-silver-70">
              {{ group.matches.length }} {{ t('matches.controls.matchesCount') }}
            </span>
          </div>

          <!-- Group matches -->
          <div class="p-4 space-y-4">
            <MatchCard
                v-for="(match, idx) in group.matches"
                :key="match.docId || match.id"
                :match="match"
                :match-index="idx + 1"
                :tab="activeTab"
                @save="handleSaveMatch"
                @discard="handleDiscardMatch"
            />
          </div>
        </div>
      </div>

      <!-- Matches list - Flat (no grouping) -->
      <div v-else class="space-y-md">
        <MatchCard
            v-for="match in currentMatches"
            :key="match.docId || match.id"
            :match="match"
            :match-index="currentMatches.indexOf(match) + 1"
            :tab="activeTab"
            @save="handleSaveMatch"
            @discard="handleDiscardMatch"
        />
      </div>
    </div>
  </AppContainer>
</template>