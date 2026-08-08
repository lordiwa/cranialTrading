<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { type SimpleMatch, useMatchesStore } from '../../stores/matches'
import { useI18n } from '../../composables/useI18n'
import SvgIcon from '../ui/SvgIcon.vue'
import IconV2 from '../ui/IconV2.vue'
import { getMatchAlertDescription } from '../../utils/matchNotification'

defineProps<{
  active: boolean
}>()

const matchesStore = useMatchesStore()
const { t } = useI18n()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const loaded = ref(false)

const badgeCount = computed(() => {
  return matchesStore.newMatches.filter(m => m.status === 'nuevo').length
})

// TASK-148: this component mounts on every authenticated route regardless of
// viewport (`hidden md:block` on the desktop nav row is CSS-only — the
// component still mounts, and fires, on mobile too). Loading on mount meant
// /inicio paid loadAllMatches()'s 6 Firestore collection reads plus batched
// deletes with zero user gesture. Deferred to the bell click instead — the
// badge/dropdown populate as soon as the user actually opens it.
const ensureLoaded = async () => {
  if (!loaded.value) {
    loaded.value = true
    await matchesStore.loadAllMatches()
  }
}

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
  void ensureLoaded()
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

const getAlertDescription = (match: SimpleMatch): string =>
  getMatchAlertDescription(match, t)

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

</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- Matches nav button (styled like other v2 nav-row links) -->
    <button
        @click.stop="toggleDropdown"
        :aria-label="t('header.nav.matches')"
        :class="[
          'px-3.5 min-h-[44px] text-[12px] font-bold uppercase tracking-[.12em] transition-colors duration-200 ease-v2 flex items-center gap-2 relative border-b-2 focus-visible:outline-none focus-visible:shadow-glow-neon',
          active
            ? 'border-neon text-neon [text-shadow:0_0_12px_rgba(90,193,104,.4)]'
            : 'border-transparent text-silver-50 hover:text-silver'
        ]"
    >
      <IconV2 name="swap" :size="18" />
      {{ t('header.nav.matches') }}
      <span v-if="badgeCount > 0" class="w-1.5 h-1.5 rounded-full bg-neon shadow-[0_0_6px_rgba(90,193,104,.4)]"></span>
      <span v-if="badgeCount > 0" class="font-display font-tnum text-[13px] font-semibold text-silver-50">{{ badgeCount > 9 ? '9+' : badgeCount }}</span>
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
          <RouterLink
              v-for="match in recentAlerts"
              :key="match.docId || match.id"
              :to="{ path: '/saved-matches', query: { match: match.docId ?? match.id } }"
              @click="closeDropdown()"
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
              <p class="text-[14px] text-silver-40 mt-1">{{ timeAgo(match.createdAt) }}</p>
            </div>

            <!-- Match type indicator -->
            <span
                :class="[
                  'text-[11px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5',
                  match.type === 'VENDO' ? 'bg-neon-10 text-neon' : 'bg-rust/20 text-rust'
                ]"
            >
              {{ match.type === 'VENDO' ? t('matches.notifications.sell') : t('matches.notifications.buy') }}
            </span>
          </RouterLink>
        </div>

        <!-- Empty state -->
        <div v-else class="px-4 py-8 text-center">
          <SvgIcon name="handshake" size="large" class="text-silver-20 mx-auto mb-2" />
          <p class="text-tiny text-silver-40">{{ t('matches.notifications.empty') }}</p>
        </div>

        <!-- Footer link -->
        <RouterLink
            :to="'/saved-matches'"
            @click="closeDropdown()"
            class="w-full px-4 py-3 text-center text-tiny font-bold text-neon hover:bg-neon-10 transition-fast border-t border-silver-20 rounded-b-md block"
        >
          {{ t('matches.notifications.goToMatches') }}
        </RouterLink>
      </div>
    </Transition>
  </div>
</template>
