<script setup lang="ts">
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()
const lastUpdated = '27 de Enero, 2025';
</script>

<template>
  <div class="min-h-screen">
    <!-- Header -->
    <header class="border-b border-silver-20 py-6">
      <div class="max-w-4xl mx-auto px-6">
        <RouterLink to="/login" class="flex items-center gap-3 w-fit">
          <svg class="w-10 h-10 text-neon" viewBox="0 0 100 100" fill="currentColor">
            <use href="/icons.svg#cranial-logo" />
          </svg>
          <span class="text-h3 font-bold text-neon">CRANIAL TRADING</span>
        </RouterLink>
      </div>
    </header>

    <!-- Content -->
    <main class="max-w-4xl mx-auto px-6 py-12">
      <h1 class="text-h1 font-bold text-silver mb-2">{{ t('legal.cookies.title') }}</h1>
      <p class="text-small text-silver-50 mb-8">{{ t('legal.cookies.lastUpdated') }} {{ lastUpdated }}</p>

      <div class="space-y-8 text-body text-silver-70">
        <!-- Intro -->
        <section>
          <p>
            Esta política explica qué son las cookies, cómo las utilizamos en Cranial Trading,
            y qué opciones tienes para gestionarlas.
          </p>
        </section>

        <!-- 1. Qué son las Cookies -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">1. ¿Qué son las Cookies?</h2>
          <p>
            Las cookies son pequeños archivos de texto que los sitios web guardan en tu dispositivo.
            Se utilizan ampliamente para hacer que los sitios funcionen correctamente, mejorar la
            experiencia del usuario y proporcionar información a los propietarios del sitio.
          </p>
        </section>

        <!-- 2. Cookies que Usamos -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">2. Cookies que Utilizamos</h2>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">2.1 Cookies Esenciales</h3>
          <p class="mb-4">
            Estas cookies son necesarias para el funcionamiento básico de la plataforma.
            Sin ellas, no podrías iniciar sesión ni usar las funciones principales.
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-small border border-silver-30">
              <thead class="bg-secondary">
                <tr>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Cookie</th>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Propósito</th>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Duración</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="p-3 border-b border-silver-20 font-mono text-neon">firebase-auth</td>
                  <td class="p-3 border-b border-silver-20">Mantener tu sesión iniciada</td>
                  <td class="p-3 border-b border-silver-20">Sesión</td>
                </tr>
                <tr>
                  <td class="p-3 border-b border-silver-20 font-mono text-neon">__session</td>
                  <td class="p-3 border-b border-silver-20">Token de autenticación</td>
                  <td class="p-3 border-b border-silver-20">14 días</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">2.2 Cookies de Rendimiento</h3>
          <p class="mb-4">
            Nos ayudan a entender cómo los usuarios interactúan con la plataforma para mejorarla.
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-small border border-silver-30">
              <thead class="bg-secondary">
                <tr>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Cookie</th>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Propósito</th>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Duración</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="p-3 border-b border-silver-20 font-mono text-neon">_ga</td>
                  <td class="p-3 border-b border-silver-20">Google Analytics - Identificador único</td>
                  <td class="p-3 border-b border-silver-20">2 años</td>
                </tr>
                <tr>
                  <td class="p-3 border-b border-silver-20 font-mono text-neon">_gid</td>
                  <td class="p-3 border-b border-silver-20">Google Analytics - Sesión</td>
                  <td class="p-3 border-b border-silver-20">24 horas</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">2.3 Almacenamiento Local</h3>
          <p class="mb-4">
            Además de cookies, utilizamos el almacenamiento local del navegador para:
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-small border border-silver-30">
              <thead class="bg-secondary">
                <tr>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Clave</th>
                  <th class="text-left p-3 text-silver border-b border-silver-30">Propósito</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="p-3 border-b border-silver-20 font-mono text-neon">mtgjson_prices</td>
                  <td class="p-3 border-b border-silver-20">Caché de precios de cartas (24h)</td>
                </tr>
                <tr>
                  <td class="p-3 border-b border-silver-20 font-mono text-neon">pinia_state</td>
                  <td class="p-3 border-b border-silver-20">Estado de la aplicación</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 3. Cookies de Terceros -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">3. Cookies de Terceros</h2>
          <p class="mb-4">
            Utilizamos servicios de terceros que pueden establecer sus propias cookies:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>
              <strong class="text-silver">Firebase (Google):</strong> Para autenticación y hosting.
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" class="text-neon hover:underline">
                Política de Privacidad de Google
              </a>
            </li>
            <li>
              <strong class="text-silver">Google Analytics:</strong> Para análisis de uso (si está habilitado).
              <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener" class="text-neon hover:underline">
                Desactivar Google Analytics
              </a>
            </li>
          </ul>
        </section>

        <!-- 4. Gestionar Cookies -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">4. Cómo Gestionar las Cookies</h2>
          <p class="mb-4">
            Puedes controlar y eliminar las cookies de varias formas:
          </p>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">4.1 Configuración del Navegador</h3>
          <p class="mb-4">
            La mayoría de navegadores te permiten ver, gestionar y eliminar cookies:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>
              <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener" class="text-neon hover:underline">
                Google Chrome
              </a>
            </li>
            <li>
              <a href="https://support.mozilla.org/es/kb/cookies-informacion-que-los-sitios-web-guardan-en-" target="_blank" rel="noopener" class="text-neon hover:underline">
                Mozilla Firefox
              </a>
            </li>
            <li>
              <a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener" class="text-neon hover:underline">
                Safari
              </a>
            </li>
            <li>
              <a href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener" class="text-neon hover:underline">
                Microsoft Edge
              </a>
            </li>
          </ul>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">4.2 Herramientas de Opt-out</h3>
          <p>
            Para desactivar cookies de análisis, puedes usar:
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener" class="text-neon hover:underline">
              Google Analytics Opt-out
            </a>
          </p>

          <div class="mt-4 p-4 bg-secondary border border-rust">
            <p class="text-small text-rust">
              <strong>Nota:</strong> Si bloqueas las cookies esenciales, algunas funciones de Cranial Trading
              no funcionarán correctamente (como mantener tu sesión iniciada).
            </p>
          </div>
        </section>

        <!-- 5. Actualizaciones -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">5. Actualizaciones de esta Política</h2>
          <p>
            Podemos actualizar esta política para reflejar cambios en nuestras prácticas o por
            requerimientos legales. Publicaremos cualquier cambio en esta página con una nueva
            fecha de actualización.
          </p>
        </section>

        <!-- 6. Más Información -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">6. Más Información</h2>
          <p>
            Para más información sobre nuestras prácticas de privacidad, consulta nuestra
            <RouterLink to="/privacy" class="text-neon hover:underline">Política de Privacidad</RouterLink>.
            Si tienes preguntas, contáctanos a través de la plataforma.
          </p>
        </section>
      </div>

      <!-- Back link -->
      <div class="mt-12 pt-8 border-t border-silver-20">
        <RouterLink to="/login" class="text-small text-neon hover:underline">
          {{ t('legal.backToHome') }}
        </RouterLink>
      </div>
    </main>

    <!-- Simple Footer -->
    <footer class="border-t border-silver-20 py-6">
      <div class="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-tiny text-silver-50">{{ t('legal.footer.copyright') }}</p>
        <div class="flex gap-6 text-tiny text-silver-50">
          <RouterLink to="/terms" class="hover:text-neon transition-fast">{{ t('legal.footer.terms') }}</RouterLink>
          <RouterLink to="/privacy" class="hover:text-neon transition-fast">{{ t('legal.footer.privacy') }}</RouterLink>
          <RouterLink to="/cookies" class="text-neon">{{ t('legal.footer.cookies') }}</RouterLink>
        </div>
      </div>
    </footer>
  </div>
</template>
