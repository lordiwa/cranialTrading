<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import BaseInput from '../components/ui/BaseInput.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import SpriteIcon from '../components/ui/SpriteIcon.vue';

const router = useRouter();
const authStore = useAuthStore();
const toastStore = useToastStore();

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

    toastStore.show('Credenciales inválidas', 'error');
  } catch (err) {
    toastStore.show('Error al iniciar sesión', 'error');
  } finally {
    loading.value = false;
  }
};

const features = [
  {
    icon: 'box',
    title: 'Gestiona tu Colección',
    description: 'Organiza todas tus cartas en un solo lugar. Controla lo que tienes, lo que vendes y lo que buscas.'
  },
  {
    icon: 'search',
    title: 'Encuentra Matches',
    description: 'Nuestro algoritmo encuentra traders que tienen lo que buscas y buscan lo que tienes.'
  },
  {
    icon: 'money',
    title: 'Monetiza tu Bulk',
    description: 'Esas cartas que crees que no valen nada pueden ser el tesoro de otro coleccionista.'
  },
  {
    icon: 'handshake',
    title: 'Conecta con Traders',
    description: 'Mensajería directa para coordinar intercambios y ventas de forma segura.'
  }
];
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
            <img
                src="/cranial-trading-logo-color.png"
                alt="Cranial Trading Logo"
                class="h-16 w-16 lg:h-20 lg:w-20"
            />
            <div>
              <h1 class="text-h2 lg:text-h1 font-bold text-neon tracking-wider">CRANIAL TRADING</h1>
              <p class="text-small text-silver-70">Magic: The Gathering Trading Platform</p>
            </div>
          </div>

          <!-- Hero Text -->
          <div class="space-y-4">
            <h2 class="text-h2 lg:text-h1 font-bold text-silver leading-tight">
              From Trash<br/>
              <span class="text-neon">to Treasures</span>
            </h2>
            <p class="text-body text-silver-70 max-w-lg">
              Tu bulk no es basura. Es el tesoro de otro coleccionista.
              Conectamos traders de Magic para que conviertas esas cartas olvidadas en valor real.
            </p>
          </div>
        </div>

        <!-- Features Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div
              v-for="feature in features"
              :key="feature.title"
              class="bg-secondary/50 border border-silver-20 p-4 hover:border-neon-30 transition-all"
          >
            <div class="mb-2"><SpriteIcon :name="feature.icon" size="large" /></div>
            <h3 class="text-small font-bold text-silver mb-1">{{ feature.title }}</h3>
            <p class="text-tiny text-silver-50">{{ feature.description }}</p>
          </div>
        </div>

        <!-- Stats -->
        <div class="flex gap-8 text-center">
          <div>
            <p class="text-h2 font-bold text-neon">100%</p>
            <p class="text-tiny text-silver-50">Gratis</p>
          </div>
          <div>
            <p class="text-h2 font-bold text-neon">P2P</p>
            <p class="text-tiny text-silver-50">Sin intermediarios</p>
          </div>
          <div>
            <p class="text-h2 font-bold text-neon">MTG</p>
            <p class="text-tiny text-silver-50">Especializado</p>
          </div>
        </div>
      </div>

      <!-- Right Column: Login Form -->
      <div class="w-full lg:w-[420px] xl:w-[480px] flex items-center justify-center px-6 py-12 lg:px-12">
        <div class="w-full max-w-sm">
          <div class="bg-primary border border-silver-30 p-8">
            <h2 class="text-h2 font-bold text-silver mb-6">INICIAR SESIÓN</h2>

            <form @submit.prevent="handleLogin" class="space-y-md">
              <BaseInput
                  v-model="email"
                  type="email"
                  placeholder="Email"
              />

              <BaseInput
                  v-model="password"
                  type="password"
                  placeholder="Contraseña"
              />

              <BaseButton
                  type="submit"
                  class="w-full"
                  :disabled="loading || !email || !password"
              >
                {{ loading ? 'INGRESANDO...' : 'INGRESAR' }}
              </BaseButton>
            </form>

            <div class="mt-6 space-y-sm text-center">
              <RouterLink
                  to="/forgot-password"
                  class="block text-small text-silver-70 hover:text-neon transition-fast"
              >
                ¿Olvidaste tu contraseña?
              </RouterLink>
              <div class="text-silver-50 text-tiny">o</div>
              <RouterLink
                  to="/register"
                  class="block text-small text-silver hover:text-neon transition-fast"
              >
                ¿No tienes cuenta? Registrarse
              </RouterLink>
            </div>
          </div>

          <!-- Trust badges -->
          <div class="mt-6 flex items-center justify-center gap-4 text-tiny text-silver-50">
            <span class="flex items-center gap-1"><SpriteIcon name="lock" size="tiny" /> Conexión segura</span>
            <span>•</span>
            <span class="flex items-center gap-1"><SpriteIcon name="fire" size="tiny" /> Firebase Auth</span>
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
              <img
                  src="/cranial-trading-logo-color.png"
                  alt="Cranial Trading"
                  class="h-8 w-8"
              />
              <span class="text-small font-bold text-neon">CRANIAL</span>
            </div>
            <p class="text-tiny text-silver-50">
              La plataforma de trading de Magic: The Gathering para la comunidad hispanohablante.
            </p>
          </div>

          <!-- Platform -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">PLATAFORMA</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/login" class="hover:text-neon transition-fast">Iniciar Sesión</RouterLink></li>
              <li><RouterLink to="/register" class="hover:text-neon transition-fast">Registrarse</RouterLink></li>
              <li><span class="text-silver-30">Colección</span></li>
              <li><span class="text-silver-30">Matches</span></li>
            </ul>
          </div>

          <!-- Resources -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">RECURSOS</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><a href="https://scryfall.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">Scryfall</a></li>
              <li><a href="https://www.moxfield.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">Moxfield</a></li>
              <li><a href="https://www.cardkingdom.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">Card Kingdom</a></li>
              <li><a href="https://www.tcgplayer.com" target="_blank" rel="noopener" class="hover:text-neon transition-fast">TCGPlayer</a></li>
            </ul>
          </div>

          <!-- Legal -->
          <div>
            <h4 class="text-tiny font-bold text-silver mb-3">LEGAL</h4>
            <ul class="space-y-2 text-tiny text-silver-50">
              <li><RouterLink to="/terms" class="hover:text-neon transition-fast">Términos de Uso</RouterLink></li>
              <li><RouterLink to="/privacy" class="hover:text-neon transition-fast">Privacidad</RouterLink></li>
              <li><RouterLink to="/cookies" class="hover:text-neon transition-fast">Cookies</RouterLink></li>
            </ul>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="pt-6 border-t border-silver-20 flex flex-col md:flex-row items-center justify-between gap-4">
          <p class="text-tiny text-silver-50">
            © 2024 Cranial Trading. Todos los derechos reservados.
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
