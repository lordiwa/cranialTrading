<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { type SupportedLocale, useI18n } from '../composables/useI18n';
import { useScrollReveal } from '../composables/useScrollReveal';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import SvgIcon from '../components/ui/SvgIcon.vue';

const route = useRoute();
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

useScrollReveal();

const handleLogin = async () => {
  if (!email.value || !password.value) return;

  loading.value = true;
  try {
    const success = await authStore.login(email.value, password.value);

    if (success) {
      await router.push(route.query.returnUrl as string || '/dashboard');
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
      await router.push(route.query.returnUrl as string || '/dashboard');
    }
  } finally {
    googleLoading.value = false;
  }
};

const features = computed(() => [
  {
    icon: 'handshake',
    title: t('landing.features.matching.title'),
    description: t('landing.features.matching.description')
  },
  {
    icon: 'collection',
    title: t('landing.features.collection.title'),
    description: t('landing.features.collection.description')
  },
  {
    icon: 'box',
    title: t('landing.features.decks.title'),
    description: t('landing.features.decks.description')
  },
  {
    icon: 'chat',
    title: t('landing.features.messaging.title'),
    description: t('landing.features.messaging.description')
  }
]);

const comparisonRows = computed(() => [
  'allInOne', 'matching', 'messaging', 'price'
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
              <span class="text-h3 font-bold text-neon font-brother">CRANIAL TRADING</span>
            </div>

            <!-- CTA box above login form -->
            <div class="mb-6 p-4 bg-neon-10 border border-neon-30 rounded-lg text-center">
              <p class="text-small font-bold text-neon mb-2">{{ t('landing.subtitle') }}</p>
              <RouterLink to="/register">
                <BaseButton class="w-full">{{ t('landing.hero.cta') }}</BaseButton>
              </RouterLink>
            </div>

            <!-- Separator -->
            <p class="text-center text-tiny text-silver-50 mb-4">{{ t('landing.login.alreadyHaveAccount') }}</p>

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

            <!-- Trust badge -->
            <div class="mt-4 flex items-center justify-center text-tiny text-silver-50">
              <span class="flex items-center gap-1"><SvgIcon name="lock" size="tiny" /> {{ t('auth.login.secureConnection') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Left Column: Content (scrollable) -->
      <div class="flex-1 px-6 py-12 lg:px-12 xl:px-16 overflow-y-auto">
<!-- Section 1: Hero -->
        <div class="mb-16 relative">
          <!-- Floating card images -->
          <div class="hidden xl:block absolute right-0 top-0 w-20 2xl:w-28 h-full pointer-events-none overflow-hidden" aria-hidden="true">
            <img
              src="https://cards.scryfall.io/art_crop/front/e/0/e01b2a09-d4e1-43f4-9015-4b06bfc0f712.jpg?1547517482"
              alt=""
              class="floating-card absolute w-10 2xl:w-14 rounded shadow-lg opacity-50"
              style="top: 10%; right: 5%; animation-delay: 0s;"
            />
            <img
              src="https://cards.scryfall.io/art_crop/front/d/7/d7749331-3eb8-4f42-aee6-a29e22d4ee82.jpg?1673147665"
              alt=""
              class="floating-card absolute w-8 2xl:w-12 rounded shadow-lg opacity-35"
              style="top: 45%; right: 20%; animation-delay: 1.5s;"
            />
            <img
              src="https://cards.scryfall.io/art_crop/front/0/c/0c3e1e43-b07a-4955-8be5-d340b3044a8e.jpg?1673146614"
              alt=""
              class="floating-card absolute w-8 2xl:w-12 rounded shadow-lg opacity-40"
              style="top: 75%; right: 0%; animation-delay: 3s;"
            />
          </div>

          <div class="flex items-center gap-4 mb-6">
            <svg class="w-16 h-16 lg:w-20 lg:h-20 text-neon" viewBox="0 0 100 100" fill="currentColor">
              <use href="/icons.svg#cranial-logo" />
            </svg>
            <div>
              <h1 class="text-h2 lg:text-h1 font-bold text-neon tracking-wider font-brother">CRANIAL TRADING</h1>
              <p class="text-small text-silver-70">{{ t('auth.login.subtitle') }}</p>
            </div>
          </div>

          <div class="space-y-4">
            <h2 class="text-h2 lg:text-h1 font-bold text-silver leading-tight">
              From Trash<br/>
              <span class="text-neon">to Treasures</span>
            </h2>
            <p class="text-body text-silver-70 max-w-lg">
              {{ t('landing.subtitle') }}
            </p>
            <RouterLink to="/register" class="inline-block mt-2">
              <BaseButton>{{ t('landing.hero.cta') }}</BaseButton>
            </RouterLink>
          </div>
        </div>

        <!-- Section 2: How It Works -->
        <section class="scroll-reveal mb-16">
          <h2 class="text-h3 font-bold text-silver mb-8">{{ t('landing.howItWorks.title') }}</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <!-- Step 1 -->
            <div class="text-center md:text-left">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neon-10 border-2 border-neon mb-4">
                <SvgIcon name="plus" size="large" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-2">{{ t('landing.howItWorks.step1.title') }}</h3>
              <p class="text-tiny text-silver-50">{{ t('landing.howItWorks.step1.desc') }}</p>
            </div>

            <!-- Step 2 -->
            <div class="text-center md:text-left">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neon-10 border-2 border-neon mb-4">
                <SvgIcon name="search" size="large" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-2">{{ t('landing.howItWorks.step2.title') }}</h3>
              <p class="text-tiny text-silver-50">{{ t('landing.howItWorks.step2.desc') }}</p>
            </div>

            <!-- Step 3 -->
            <div class="text-center md:text-left">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neon-10 border-2 border-neon mb-4">
                <SvgIcon name="chat" size="large" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-2">{{ t('landing.howItWorks.step3.title') }}</h3>
              <p class="text-tiny text-silver-50">{{ t('landing.howItWorks.step3.desc') }}</p>
            </div>
          </div>
        </section>

        <!-- Section 4: Feature Deep-Dive -->
        <section class="scroll-reveal mb-16">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
                v-for="feature in features"
                :key="feature.title"
                class="bg-primary/90 border border-silver-20 p-5 hover:border-neon-30 transition-all rounded-md group"
            >
              <div class="mb-3 w-10 h-10 bg-neon-10 rounded-full flex items-center justify-center group-hover:bg-neon-20 transition-colors">
                <SvgIcon :name="feature.icon" size="small" class="text-neon" />
              </div>
              <h3 class="text-small font-bold text-silver mb-1">{{ feature.title }}</h3>
              <p class="text-tiny text-silver-50">{{ feature.description }}</p>
            </div>
          </div>
        </section>

        <!-- Section 5: Why Cranial Trading + Final CTA -->
        <section class="scroll-reveal mb-16">
          <h2 class="text-h3 font-bold text-silver mb-6">{{ t('landing.comparison.title') }}</h2>
          <ul class="space-y-4">
            <li
              v-for="row in comparisonRows"
              :key="row"
              class="flex items-start gap-3 p-4 bg-secondary/20 border border-silver-10 rounded-md"
            >
              <span class="text-neon text-body mt-0.5 flex-shrink-0">&#10003;</span>
              <div>
                <h3 class="text-small font-bold text-silver">{{ t(`landing.comparison.rows.${row}.label`) }}</h3>
                <p class="text-tiny text-silver-50">{{ t(`landing.comparison.rows.${row}.us`) }}</p>
              </div>
            </li>
          </ul>
          <div class="mt-8 text-center">
            <RouterLink to="/register" class="inline-block">
              <BaseButton>{{ t('landing.comparison.cta') }}</BaseButton>
            </RouterLink>
          </div>
        </section>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-silver-20 bg-secondary/30">
      <div class="max-w-[1200px] mx-auto px-6 py-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
.bg-neon-20 {
  background-color: rgba(204, 255, 0, 0.2);
}

/* Floating card animation */
.floating-card {
  animation: float 6s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0px) rotate(-2deg); }
  50% { transform: translateY(-15px) rotate(2deg); }
}

/* Scroll reveal */
.scroll-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}
.scroll-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}
</style>
