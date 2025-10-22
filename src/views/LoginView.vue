<script setup lang="ts">
    import { ref } from 'vue';
    import { useRouter } from 'vue-router';
    import { useAuthStore } from '../stores/auth';
    import BaseInput from '../components/ui/BaseInput.vue';
    import BaseButton from '../components/ui/BaseButton.vue';

    const router = useRouter();
    const authStore = useAuthStore();

    const email = ref('');
    const password = ref('');
    const loading = ref(false);

    const handleLogin = async () => {
      if (!email.value || !password.value) return;

      loading.value = true;
      try {
        const success = await authStore.login(email.value, password.value);
        console.log('authStore.login returned:', success);

        if (success) {
          console.log('Navigating to dashboard...');
          await router.push('/dashboard');
          return;
        }

        console.warn('Login did not succeed (authStore returned falsy).');
      } catch (err) {
        console.error('Login error:', err);
      } finally {
        loading.value = false;
      }
    };
    </script>

    <template>
      <div class="min-h-screen flex items-center justify-center bg-primary px-4">
        <div class="w-full max-w-md">
          <h1 class="text-h1 font-bold text-neon text-center mb-8 tracking-wider">CRANIAL</h1>

          <div class="bg-primary border border-silver-30 p-8 shadow-medium">
            <h2 class="text-h2 font-bold text-silver mb-6">INICIAR SESIÓN</h2>

            <form @submit.prevent="handleLogin" class="space-y-4">
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

            <div class="mt-6 text-center">
              <RouterLink
                  to="/register"
                  class="text-small text-silver hover:text-neon transition-fast"
              >
                ¿No tienes cuenta? Registrarse
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </template>