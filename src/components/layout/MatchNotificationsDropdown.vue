<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMatchesStore } from '../../stores/matches'
import { useI18n } from '../../composables/useI18n'
import SvgIcon from '../ui/SvgIcon.vue'

defineProps<{
  active: boolean
}>()

const router = useRouter()
const matchesStore = useMatchesStore()
const { t } = useI18n()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const loaded = ref(false)

const badgeCount = computed(() => {
  return matchesStore.newMatches.filter(m => m.status === 'nuevo').length
})

// Load matches on first interaction or when user is authenticated
const ensureLoaded = async () => {
  if (!loaded.value) {
    loaded.value = true
    await matchesStore.loadAllMatches()
  }
}

onMounted(() => {
  ensureLoaded()
})

// Show up to 6 most recent new matches
const recentAlerts = computed(() => {
  return [...matchesStore.newMatches]
    .filter(m => m.status === 'nuevo')
    .sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)
      return dateB.getTime() - dateA.getTime()
    })
    .slice(0, 6)
})

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const closeDropdown = () => {
  isOpen.value = false
}

const handleMouseDown = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleMouseDown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleMouseDown)
})

const getAlertDescription = (match: any): string => {
  if (match.type === 'VENDO') {
    const cardName = match.myCards?.[0]?.name || match.myCard?.name || '?'
    return t('matches.notifications.wantsYourCard', { card: cardName })
  } else {
    const cardName = match.otherCards?.[0]?.name || match.otherCard?.name || '?'
    return t('matches.notifications.hasCardYouWant', { card: cardName })
  }
}

const timeAgo = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('matches.notifications.justNow')
  if (diffMins < 60) return t('matches.notifications.minutesAgo', { n: diffMins })
  if (diffHours < 24) return t('matches.notifications.hoursAgo', { n: diffHours })
  return t('matches.notifications.daysAgo', { n: diffDays })
}

const goToMatches = () => {
  closeDropdown()
  router.push('/saved-matches')
}

const goToMatch = (match: any) => {
  closeDropdown()
  const matchId = match.docId || match.id
  router.push({ path: '/saved-matches', query: { match: matchId } })
}
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- Matches nav button (styled like other nav links) -->
    <button
        @click.stop="toggleDropdown"
        :class="[
          'px-4 py-2 text-small font-bold transition-fast rounded-sm flex items-center gap-2 relative',
          active
            ? 'bg-neon-10 border-b-2 border-neon text-neon'
            : 'text-silver-70 hover:text-silver hover:border-b-2 hover:border-silver'
        ]"
    >
      <span class="relative">
        <SvgIcon name="handshake" size="small" />
        <span
            v-if="badgeCount > 0"
            class="absolute -top-1 -right-1 min-w-[16px] h-4 bg-rust text-primary text-[10px] font-bold rounded-full flex items-center justify-center px-1"
        >
          {{ badgeCount > 9 ? '9+' : badgeCount }}
        </span>
      </span>
      {{ t('header.nav.matches') }}
    </button>

    <!-- Dropdown panel -->
    <Transition
        enter-active-class="transition ease-out duration-100"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition ease-in duration-75"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
    >
      <div
          v-if="isOpen"
          class="absolute left-0 top-full mt-2 w-80 bg-primary border border-silver-30 rounded-md shadow-lg z-50"
      >
        <!-- Header -->
        <div class="px-4 py-3 border-b border-silver-20 flex items-center justify-between">
          <span class="text-small font-bold text-silver">{{ t('matches.notifications.title') }}</span>
          <span v-if="badgeCount > 0" class="text-tiny text-neon font-bold">
            {{ badgeCount }} {{ badgeCount === 1 ? t('matches.notifications.newSingular') : t('matches.notifications.newPlural') }}
          </span>
        </div>

        <!-- Alert list -->
        <div v-if="recentAlerts.length > 0" class="max-h-[320px] overflow-y-auto">
          <button
              v-for="match in recentAlerts"
              :key="match.docId || match.id"
              @click="goToMatch(match)"
              class="w-full px-4 py-3 flex items-start gap-3 hover:bg-silver-5 transition-fast text-left border-b border-silver-10 last:border-b-0"
          >
            <!-- Avatar -->
            <img
                v-if="match.otherAvatarUrl"
                :src="match.otherAvatarUrl"
                alt=""
                class="w-8 h-8 rounded-full bg-silver-10 object-cover flex-shrink-0 mt-0.5"
            />
            <span
                v-else
                class="w-8 h-8 rounded-full bg-silver-10 flex items-center justify-center flex-shrink-0 mt-0.5"
            >
              <SvgIcon name="user" size="tiny" />
            </span>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p class="text-tiny text-silver leading-snug">
                <span class="font-bold text-neon">@{{ match.otherUsername }}</span>
                {{ getAlertDescription(match) }}
              </p>
              <p class="text-[10px] text-silver-40 mt-1">{{ timeAgo(match.createdAt) }}</p>
            </div>

            <!-- Match type indicator -->
            <span
                :class="[
                  'text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5',
                  match.type === 'VENDO' ? 'bg-neon-10 text-neon' : 'bg-rust/20 text-rust'
                ]"
            >
              {{ match.type === 'VENDO' ? t('matches.notifications.sell') : t('matches.notifications.buy') }}
            </span>
          </button>
        </div>

        <!-- Empty state -->
        <div v-else class="px-4 py-8 text-center">
          <SvgIcon name="handshake" size="large" class="text-silver-20 mx-auto mb-2" />
          <p class="text-tiny text-silver-40">{{ t('matches.notifications.empty') }}</p>
        </div>

        <!-- Footer link -->
        <button
            @click="goToMatches"
            class="w-full px-4 py-3 text-center text-tiny font-bold text-neon hover:bg-neon-10 transition-fast border-t border-silver-20 rounded-b-md"
        >
          {{ t('matches.notifications.goToMatches') }}
        </button>
      </div>
    </Transition>
  </div>
</template>
