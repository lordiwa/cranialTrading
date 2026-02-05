<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { type SupportedLocale, useI18n } from '../composables/useI18n';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import SvgIcon from '../components/ui/SvgIcon.vue';

const router = useRouter();
const authStore = useAuthStore();
const toastStore = useToastStore();
const { t, locale, setLocale } = useI18n();

// Language options
const languages = [
  { code: 'es' as SupportedLocale, label: 'ES', name: 'Español' },
  { code: 'en' as SupportedLocale, label: 'EN', name: 'English' },
  { code: 'pt' as SupportedLocale, label: 'PT', name: 'Português' },
];

const email = ref('');
const password = ref('');
const loading = ref(false);
const googleLoading = ref(false);

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

const handleGoogleLogin = async () => {
  googleLoading.value = true;
  try {
    const success = await authStore.loginWithGoogle();
    if (success) {
      await router.push('/dashboard');
    }
  } finally {
    googleLoading.value = false;
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

const capabilities = computed(() => [
  { key: 'catalog', icon: 'collection' },
  { key: 'prices', icon: 'money' },
  { key: 'decks', icon: 'box' },
  { key: 'trade', icon: 'handshake' },
  { key: 'sell', icon: 'star' },
  { key: 'wishlist', icon: 'search' }
]);

const useCases = computed(() => [
  'casual',
  'competitive',
  'collectors',
  'stores',
  'returning'
]);
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Main Content -->
    <main class="flex-1 flex flex-col lg:flex-row">
      <!-- Right Column: Login Form (appears first on mobile, sticky on desktop) -->
      <div class="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 order-first lg:order-last lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto border-b lg:border-b-0 lg:border-l border-silver-20 bg-primary">
        <div class="flex items-center justify-center px-6 py-8 lg:py-12 lg:px-8 lg:min-h-screen">
          <div class="w-full max-w-sm">
            <!-- Logo on mobile only -->
            <div class="lg:hidden flex items-center justify-center gap-3 mb-6">
              <svg class="w-12 h-12 text-neon" viewBox="0 0 100 100" fill="currentColor">
                <use href="/icons.svg#cranial-logo" />
              </svg>
              <span class="text-h3 font-bold text-neon">CRANIAL TRADING</span>
            </div>

            <div class="bg-primary/95 border border-silver-30 p-6 lg:p-8 rounded-lg">
              <h2 class="text-h3 lg:text-h2 font-bold text-silver mb-6">{{ t('auth.login.title') }}</h2>

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

              <!-- Divider -->
              <div class="flex items-center gap-4 my-6">
                <div class="flex-1 h-px bg-silver-30"></div>
                <span class="text-tiny text-silver-50">{{ t('auth.login.orContinueWith') }}</span>
                <div class="flex-1 h-px bg-silver-30"></div>
              </div>

              <!-- Google Login Button -->
              <button
                  @click="handleGoogleLogin"
                  :disabled="googleLoading"
                  class="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {{ googleLoading ? '...' : t('auth.login.googleButton') }}
              </button>

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
            <div class="mt-4 flex items-center justify-center gap-4 text-tiny text-silver-50">
              <span class="flex items-center gap-1"><SvgIcon name="lock" size="tiny" /> {{ t('auth.login.secureConnection') }}</span>
              <span>•</span>
              <span class="flex items-center gap-1"><SvgIcon name="fire" size="tiny" /> {{ t('auth.login.firebaseAuth') }}</span>
            </div>

            <!-- CTA -->
            <div class="mt-6 p-4 bg-neon-10 border border-neon-30 rounded-lg text-center">
              <p class="text-small font-bold text-neon">{{ t('landing.cta.title') }}</p>
              <p class="text-tiny text-silver-50">{{ t('landing.cta.description') }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Left Column: Content (scrollable) -->
      <div class="flex-1 px-6 py-12 lg:px-12 xl:px-16 overflow-y-auto">
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
        <div class="flex gap-8 text-center mb-12">
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

        <!-- Capabilities Section -->
        <section class="mb-12">
          <h2 class="text-h3 font-bold text-silver mb-6">{{ t('landing.capabilities.title') }}</h2>
          <div class="space-y-4">
            <article
                v-for="cap in capabilities"
                :key="cap.key"
                class="flex gap-4 p-4 bg-secondary/20 border border-silver-10 rounded-md hover:border-silver-30 transition-all"
            >
              <div class="flex-shrink-0 w-10 h-10 bg-neon-10 rounded-full flex items-center justify-center">
                <SvgIcon :name="cap.icon" size="small" class="text-neon" />
              </div>
              <div>
                <h3 class="text-small font-bold text-silver mb-1">{{ t(`landing.capabilities.items.${cap.key}.title`) }}</h3>
                <p class="text-tiny text-silver-50">{{ t(`landing.capabilities.items.${cap.key}.description`) }}</p>
              </div>
            </article>
          </div>
        </section>

        <!-- Use Cases -->
        <section class="mb-12">
          <h2 class="text-h3 font-bold text-silver mb-4">{{ t('landing.useCases.title') }}</h2>
          <ul class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <li
                v-for="useCase in useCases"
                :key="useCase"
                class="flex items-center gap-2 text-small text-silver-70"
            >
              <span class="text-neon">✓</span>
              {{ t(`landing.useCases.${useCase}`) }}
            </li>
          </ul>
        </section>

        <!-- Help Section -->
        <section class="p-6 bg-neon-10 border border-neon-30 rounded-lg">
          <h2 class="text-h3 font-bold text-neon mb-2">{{ t('landing.helpSection.title') }}</h2>
          <p class="text-small text-silver-70 mb-4">{{ t('landing.helpSection.description') }}</p>
          <RouterLink
              to="/faq"
              class="inline-flex items-center gap-2 px-4 py-2 bg-neon text-primary font-bold text-small rounded hover:bg-neon/90 transition-fast"
          >
            <span class="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">?</span>
            {{ t('landing.helpSection.cta') }}
          </RouterLink>
        </section>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-silver-20 bg-secondary/30">
      <div class="max-w-7xl mx-auto px-6 py-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
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

          <!-- Help -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">{{ t('landing.footer.help') }}</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/faq" class="hover:text-neon transition-fast">{{ t('landing.footer.faq') }}</RouterLink></li>
              <li><RouterLink to="/faq#getting-started" class="hover:text-neon transition-fast">{{ t('landing.footer.gettingStarted') }}</RouterLink></li>
              <li><RouterLink to="/faq#trading" class="hover:text-neon transition-fast">{{ t('landing.footer.howToTrade') }}</RouterLink></li>
              <li><RouterLink to="/faq#safety" class="hover:text-neon transition-fast">{{ t('landing.footer.tradeSafety') }}</RouterLink></li>
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
            {{ t('legal.footer.copyright') }}
          </p>

          <!-- Language Selector -->
          <div class="flex items-center gap-2">
            <span class="text-tiny text-silver-50">{{ t('footer.language') }}:</span>
            <div class="flex items-center gap-1">
              <button
                v-for="lang in languages"
                :key="lang.code"
                @click="setLocale(lang.code)"
                :title="lang.name"
                :class="[
                  'px-2 py-1 text-tiny font-bold rounded transition-colors',
                  locale === lang.code
                    ? 'bg-neon text-primary'
                    : 'text-silver-50 hover:text-neon hover:bg-silver-5'
                ]"
              >
                {{ lang.label }}
              </button>
            </div>
          </div>

          <p class="text-tiny text-silver-30">
            Magic: The Gathering™ Wizards of the Coast
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
.bg-neon-10 {
  background-color: rgba(204, 255, 0, 0.1);
}
</style>
