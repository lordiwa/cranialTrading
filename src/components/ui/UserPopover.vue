<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useI18n } from '../../composables/useI18n'
import BaseInput from './BaseInput.vue'
import BaseButton from './BaseButton.vue'
import SvgIcon from './SvgIcon.vue'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const isOpen = ref(false)
const popoverRef = ref<HTMLElement | null>(null)
const avatarError = ref(false)

// Location editing
const editingLocation = ref(false)
const newLocation = ref('')
const detectingLocation = ref(false)
const savingLocation = ref(false)
const locationSuggestions = ref<string[]>([])
const searchingLocations = ref(false)
let locationSearchTimeout: ReturnType<typeof setTimeout> | null = null

// Avatar editing
const editingAvatar = ref(false)
const newAvatarUrl = ref('')
const savingAvatar = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const avatarPreview = ref('')

const avatarUrl = computed(() => authStore.getAvatarUrl(80))

const togglePopover = () => {
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    editingLocation.value = false
    editingAvatar.value = false
  }
}

const closePopover = () => {
  isOpen.value = false
  editingLocation.value = false
  editingAvatar.value = false
}

// Click outside handler - use mousedown to avoid closing when dragging text selection outside
const handleMouseDown = (event: MouseEvent) => {
  if (popoverRef.value && !popoverRef.value.contains(event.target as Node)) {
    closePopover()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleMouseDown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleMouseDown)
})

// Location functions
const startEditLocation = () => {
  newLocation.value = authStore.user?.location || ''
  locationSuggestions.value = []
  editingLocation.value = true
}

const handleLocationInput = () => {
  if (locationSearchTimeout) {
    clearTimeout(locationSearchTimeout)
  }

  locationSuggestions.value = []

  if (newLocation.value.length >= 2) {
    locationSearchTimeout = setTimeout(() => {
      void (async () => {
        searchingLocations.value = true
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newLocation.value)}&limit=5&addressdetails=1`,
            { headers: { 'Accept-Language': 'es' } }
          )
          const data = await response.json()
          locationSuggestions.value = data.map((item: any) => {
            const city = item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || ''
            const state = item.address?.state || ''
            const country = item.address?.country || ''
            if (city && country) {
              return state ? `${city}, ${state}, ${country}` : `${city}, ${country}`
            }
            return item.display_name.split(',').slice(0, 3).join(',').trim()
          }).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i) // Remove duplicates
        } catch (error) {
          console.error('Error searching locations:', error)
        }
        searchingLocations.value = false
      })()
    }, 300)
  }
}

const selectLocationSuggestion = (suggestion: string) => {
  newLocation.value = suggestion
  locationSuggestions.value = []
}

const handleDetectLocation = async () => {
  detectingLocation.value = true
  const location = await authStore.detectLocation()
  detectingLocation.value = false
  if (location) {
    newLocation.value = location
  }
}

const saveLocation = async () => {
  if (!newLocation.value.trim()) return
  savingLocation.value = true
  const success = await authStore.changeLocation(newLocation.value.trim())
  savingLocation.value = false
  if (success) {
    editingLocation.value = false
    locationSuggestions.value = []
  }
}

const cancelEditLocation = () => {
  editingLocation.value = false
  newLocation.value = ''
  locationSuggestions.value = []
}

// Avatar functions
const startEditAvatar = () => {
  newAvatarUrl.value = ''
  selectedFile.value = null
  avatarPreview.value = avatarUrl.value
  avatarError.value = false
  editingAvatar.value = true
}

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) {
    const file = input.files[0]
    selectedFile.value = file
    newAvatarUrl.value = ''

    const reader = new FileReader()
    reader.onload = (e) => {
      avatarPreview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const saveAvatar = async () => {
  savingAvatar.value = true
  let success = false

  if (selectedFile.value) {
    success = await authStore.uploadAvatar(selectedFile.value)
  } else {
    const url = newAvatarUrl.value.trim() || null
    success = await authStore.changeAvatar(url)
  }

  savingAvatar.value = false
  if (success) {
    editingAvatar.value = false
    selectedFile.value = null
    newAvatarUrl.value = ''
    avatarError.value = false
  }
}

const resetAvatar = async () => {
  savingAvatar.value = true
  const success = await authStore.changeAvatar(null)
  savingAvatar.value = false
  if (success) {
    editingAvatar.value = false
    newAvatarUrl.value = ''
    selectedFile.value = null
  }
}

const cancelEditAvatar = () => {
  editingAvatar.value = false
  newAvatarUrl.value = ''
  selectedFile.value = null
}

// Logout
const handleLogout = async () => {
  closePopover()
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div ref="popoverRef" class="relative">
    <!-- Trigger button (avatar only) -->
    <button
        @click.stop="togglePopover"
        class="flex items-center p-1 text-silver-50 hover:text-neon transition-fast rounded-full"
        :title="t('header.profile.viewPublicProfile')"
    >
      <img
          v-if="!avatarError"
          :src="avatarUrl"
          alt="Avatar"
          class="w-8 h-8 rounded-full bg-silver-10 border-2 border-transparent hover:border-neon transition-fast object-cover"
          @error="avatarError = true"
      />
      <span
          v-else
          class="w-8 h-8 rounded-full bg-silver-20 border-2 border-silver-30 hover:border-neon transition-fast flex items-center justify-center"
      >
        <SvgIcon name="user" size="small" />
      </span>
    </button>

    <!-- Popover content -->
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
          class="absolute right-0 top-full mt-2 w-72 bg-primary border border-silver-30 rounded-md shadow-lg z-50"
      >
        <!-- Avatar section -->
        <div class="p-4 border-b border-silver-20">
          <div class="flex items-center gap-3">
            <div class="relative group">
              <img
                  v-if="!avatarError || editingAvatar"
                  :src="editingAvatar ? avatarPreview : avatarUrl"
                  alt="Avatar"
                  class="w-14 h-14 rounded-full bg-silver-10 object-cover"
                  @error="avatarError = true"
              />
              <span
                  v-else
                  class="w-14 h-14 rounded-full bg-silver-10 flex items-center justify-center"
              >
                <SvgIcon name="user" size="large" />
              </span>
              <button
                  v-if="!editingAvatar"
                  @click.stop="startEditAvatar"
                  class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  :title="t('settings.changeAvatar.edit')"
              >
                <span class="text-white text-tiny">✎</span>
              </button>
              <button
                  v-else
                  @click.stop="triggerFileInput"
                  class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span class="text-white text-tiny">📷</span>
              </button>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-small font-bold text-silver truncate">@{{ authStore.user?.username }}</p>
              <p class="text-tiny text-silver-50 truncate">{{ authStore.user?.email }}</p>
            </div>
          </div>

          <!-- Avatar edit form -->
          <div v-if="editingAvatar" class="mt-3 space-y-2">
            <!-- Hidden file input -->
            <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleFileSelect"
            />

            <!-- Upload button -->
            <BaseButton
                variant="secondary"
                size="small"
                @click.stop="triggerFileInput"
                class="w-full"
            >
              {{ selectedFile ? selectedFile.name : t('settings.changeAvatar.upload') }}
            </BaseButton>

            <!-- Or URL input -->
            <BaseInput
                v-model="newAvatarUrl"
                type="url"
                :placeholder="t('settings.changeAvatar.placeholder')"
                size="small"
                :disabled="!!selectedFile"
            />

            <div class="flex gap-2">
              <BaseButton size="small" variant="secondary" @click.stop="cancelEditAvatar" class="flex-1">
                {{ t('common.actions.cancel') }}
              </BaseButton>
              <BaseButton size="small" variant="secondary" @click.stop="resetAvatar" :disabled="savingAvatar">
                {{ t('settings.changeAvatar.reset') }}
              </BaseButton>
              <BaseButton size="small" @click.stop="saveAvatar" :disabled="savingAvatar || (!selectedFile && !newAvatarUrl.trim())" class="flex-1">
                {{ savingAvatar ? '...' : t('common.actions.save') }}
              </BaseButton>
            </div>
          </div>
        </div>

        <!-- Location section -->
        <div class="p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-tiny text-silver-50">{{ t('settings.sections.accountInfo.location') }}</span>
            <button
                v-if="!editingLocation"
                @click.stop="startEditLocation"
                class="text-tiny text-neon hover:underline"
            >
              {{ t('common.actions.edit') }}
            </button>
          </div>

          <div v-if="!editingLocation">
            <p class="text-small text-silver flex items-center gap-1">
              <span>📍</span>
              {{ authStore.user?.location || t('settings.changeLocation.notSet') }}
            </p>
          </div>

          <!-- Location edit form -->
          <div v-else class="space-y-2">
            <div class="relative">
              <BaseInput
                  v-model="newLocation"
                  type="text"
                  :placeholder="t('settings.changeLocation.placeholder')"
                  size="small"
                  @input="handleLocationInput"
              />
              <!-- Loading indicator -->
              <div v-if="searchingLocations" class="absolute right-2 top-1/2 -translate-y-1/2">
                <span class="text-silver-50 text-tiny">...</span>
              </div>
              <!-- Suggestions dropdown -->
              <div
                  v-if="locationSuggestions.length > 0"
                  class="absolute z-10 w-full mt-1 bg-primary border border-silver-30 rounded shadow-lg max-h-40 overflow-auto"
              >
                <button
                    v-for="suggestion in locationSuggestions"
                    :key="suggestion"
                    @click.stop="selectLocationSuggestion(suggestion)"
                    class="w-full px-3 py-2 text-left text-tiny text-silver hover:bg-silver-5 hover:text-neon transition-fast"
                >
                  📍 {{ suggestion }}
                </button>
              </div>
            </div>
            <button
                @click.stop="handleDetectLocation"
                :disabled="detectingLocation"
                class="text-tiny text-neon hover:underline disabled:opacity-50"
            >
              {{ detectingLocation ? t('settings.changeLocation.detecting') : t('settings.changeLocation.detect') }}
            </button>
            <div class="flex gap-2">
              <BaseButton size="small" variant="secondary" @click.stop="cancelEditLocation" class="flex-1">
                {{ t('common.actions.cancel') }}
              </BaseButton>
              <BaseButton size="small" @click.stop="saveLocation" :disabled="savingLocation || !newLocation.trim()" class="flex-1">
                {{ savingLocation ? '...' : t('common.actions.save') }}
              </BaseButton>
            </div>
          </div>
        </div>

        <!-- Quick links -->
        <div class="border-t border-silver-20 p-2">
          <router-link
              :to="`/@${authStore.user?.username}`"
              @click="closePopover"
              class="flex items-center gap-2 px-3 py-2 text-tiny text-silver-70 hover:text-neon hover:bg-silver-5 rounded transition-fast"
          >
            {{ t('header.profile.viewPublicProfile') }}
          </router-link>
          <router-link
              to="/settings"
              @click="closePopover"
              class="flex items-center gap-2 px-3 py-2 text-tiny text-silver-70 hover:text-neon hover:bg-silver-5 rounded transition-fast"
          >
            {{ t('header.profile.settings') }}
          </router-link>
          <button
              @click="handleLogout"
              class="flex items-center gap-2 px-3 py-2 text-tiny text-rust hover:bg-rust-10 rounded transition-fast w-full text-left"
          >
            {{ t('header.profile.logout') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
