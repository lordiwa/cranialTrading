<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useI18n } from '../composables/useI18n';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import SvgIcon from '../components/ui/SvgIcon.vue';

const router = useRouter();
const authStore = useAuthStore();
const toastStore = useToastStore();
const { t } = useI18n();

const email = ref('');
const password = ref('');
const loading = ref(false);

const handleLogin = async () => {
  if (!email.value || !password.value) return;

  loading.value = true;
  try {
    const success = await authStore.login(email.value, password.value);

    if (success) {
      await router.push('/dashboard');
      return;
    }

    toastStore.show(t('auth.messages.invalidCredentials'), 'error');
  } catch {
    toastStore.show(t('auth.messages.invalidCredentials'), 'error');
  } finally {
    loading.value = false;
  }
};

const features = computed(() => [
  {
    icon: 'box',
    title: t('landing.features.collection.title'),
    description: t('landing.features.collection.description')
  },
  {
    icon: 'search',
    title: t('landing.features.matches.title'),
    description: t('landing.features.matches.description')
  },
  {
    icon: 'money',
    title: t('landing.features.bulk.title'),
    description: t('landing.features.bulk.description')
  },
  {
    icon: 'handshake',
    title: t('landing.features.connect.title'),
    description: t('landing.features.connect.description')
  }
]);
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Main Content -->
    <main class="flex-1 flex flex-col lg:flex-row">
      <!-- Left Column: Institutional Info -->
      <div class="flex-1 flex flex-col justify-center px-6 py-12 lg:px-12 xl:px-20 border-b lg:border-b-0 lg:border-r border-silver-20">
        <!-- Logo & Tagline -->
        <div class="mb-10">
          <div class="flex items-center gap-4 mb-6">
            <svg class="w-16 h-16 lg:w-20 lg:h-20 text-neon" viewBox="0 0 100 100" fill="currentColor">
              <use href="/icons.svg#cranial-logo" />
            </svg>
            <div>
              <h1 class="text-h2 lg:text-h1 font-bold text-neon tracking-wider">CRANIAL TRADING</h1>
              <p class="text-small text-silver-70">{{ t('auth.login.subtitle') }}</p>
            </div>
          </div>

          <!-- Hero Text -->
          <div class="space-y-4">
            <h2 class="text-h2 lg:text-h1 font-bold text-silver leading-tight">
              From Trash<br/>
              <span class="text-neon">to Treasures</span>
            </h2>
            <p class="text-body text-silver-70 max-w-lg">
              {{ t('landing.subtitle') }}
              {{ t('landing.description') }}
            </p>
          </div>
        </div>

        <!-- Features Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div
              v-for="feature in features"
              :key="feature.title"
              class="bg-primary/90 border border-silver-20 p-4 hover:border-neon-30 transition-all rounded-md"
          >
            <div class="mb-2"><SvgIcon :name="feature.icon" size="large" /></div>
            <h3 class="text-small font-bold text-silver mb-1">{{ feature.title }}</h3>
            <p class="text-tiny text-silver-50">{{ feature.description }}</p>
          </div>
        </div>

        <!-- Stats -->
        <div class="flex gap-8 text-center">
          <div>
            <p class="text-h2 font-bold text-neon">100%</p>
            <p class="text-tiny text-silver-50">{{ t('landing.stats.free') }}</p>
          </div>
          <div>
            <p class="text-h2 font-bold text-neon">P2P</p>
            <p class="text-tiny text-silver-50">{{ t('landing.stats.p2p') }}</p>
          </div>
          <div>
            <p class="text-h2 font-bold text-neon">MTG</p>
            <p class="text-tiny text-silver-50">{{ t('landing.stats.mtg') }}</p>
          </div>
        </div>
      </div>

      <!-- Right Column: Login Form -->
      <div class="w-full lg:w-[420px] xl:w-[480px] flex items-center justify-center px-6 py-12 lg:px-12">
        <div class="w-full max-w-sm">
          <div class="bg-primary/95 border border-silver-30 p-8 rounded-lg">
            <h2 class="text-h2 font-bold text-silver mb-6">{{ t('auth.login.title') }}</h2>

            <form @submit.prevent="handleLogin" class="space-y-md">
              <BaseInput
                  v-model="email"
                  type="email"
                  :placeholder="t('common.labels.email')"
              />

              <BaseInput
                  v-model="password"
                  type="password"
                  :placeholder="t('common.labels.password')"
              />

              <BaseButton
                  type="submit"
                  class="w-full"
                  :disabled="loading || !email || !password"
              >
                {{ loading ? t('auth.login.submitting') : t('auth.login.submit') }}
              </BaseButton>
            </form>

            <div class="mt-6 space-y-sm text-center">
              <RouterLink
                  to="/forgot-password"
                  class="block text-small text-silver-70 hover:text-neon transition-fast"
              >
                {{ t('auth.login.forgotPassword') }}
              </RouterLink>
              <div class="text-silver-50 text-tiny">o</div>
              <RouterLink
                  to="/register"
                  class="block text-small text-silver hover:text-neon transition-fast"
              >
                {{ t('auth.login.noAccount') }} {{ t('auth.login.register') }}
              </RouterLink>
            </div>
          </div>

          <!-- Trust badges -->
          <div class="mt-6 flex items-center justify-center gap-4 text-tiny text-silver-50">
            <span class="flex items-center gap-1"><SvgIcon name="lock" size="tiny" /> {{ t('auth.login.secureConnection') }}</span>
            <span>•</span>
            <span class="flex items-center gap-1"><SvgIcon name="fire" size="tiny" /> {{ t('auth.login.firebaseAuth') }}</span>
          </div>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-silver-20 bg-secondary/30">
      <div class="max-w-7xl mx-auto px-6 py-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <!-- Brand -->
          <div class="col-span-2 md:col-span-1">
            <div class="flex items-center gap-2 mb-4">
              <svg class="w-8 h-8 text-neon" viewBox="0 0 100 100" fill="currentColor">
                <use href="/icons.svg#cranial-logo" />
              </svg>
              <span class="text-small font-bold text-neon">CRANIAL</span>
            </div>
            <p class="text-tiny text-silver-50">
              {{ t('landing.description') }}
            </p>
          </div>

          <!-- Platform -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">{{ t('landing.footer.platform') }}</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/login" class="hover:text-neon transition-fast">{{ t('auth.login.title') }}</RouterLink></li>
              <li><RouterLink to="/register" class="hover:text-neon transition-fast">{{ t('auth.register.title') }}</RouterLink></li>
              <li><span class="text-silver-30">{{ t('header.nav.collection') }}</span></li>
              <li><span class="text-silver-30">Matches</span></li>
            </ul>
          </div>

          <!-- Resources -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">{{ t('landing.footer.resources') }}</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><a href="https://scryfall.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">Scryfall</a></li>
              <li><a href="https://www.moxfield.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">Moxfield</a></li>
              <li><a href="https://www.cardkingdom.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">Card Kingdom</a></li>
              <li><a href="https://www.tcgplayer.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">TCGPlayer</a></li>
            </ul>
          </div>

          <!-- Legal -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">{{ t('landing.footer.legal') }}</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/terms" class="hover:text-neon transition-fast">{{ t('legal.terms.title') }}</RouterLink></li>
              <li><RouterLink to="/privacy" class="hover:text-neon transition-fast">{{ t('legal.privacy.title') }}</RouterLink></li>
              <li><RouterLink to="/cookies" class="hover:text-neon transition-fast">{{ t('legal.cookies.title') }}</RouterLink></li>
            </ul>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="pt-6 border-t border-silver-20 flex flex-col md:flex-row items-center justify-between gap-4">
          <p class="text-tiny text-silver-50">
            {{ t('legal.footer.copyright') }}. Todos los derechos reservados.
          </p>
          <p class="text-tiny text-silver-30">
            Magic: The Gathering es marca registrada de Wizards of the Coast.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.border-neon-30 {
  border-color: rgba(204, 255, 0, 0.3);
}
</style>
