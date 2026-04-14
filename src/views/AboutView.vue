<script setup lang="ts">
import { useHead, useSeoMeta } from '@unhead/vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

useSeoMeta({
  ogTitle: t('seo.pages.about.title') + ' | Cranial Trading',
  ogDescription: t('seo.pages.about.description'),
  ogType: 'website',
  ogUrl: 'https://cranialtrading.com/about',
  ogSiteName: 'Cranial Trading',
  twitterCard: 'summary_large_image',
})

const orgJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Cranial Trading',
  url: 'https://cranialtrading.com',
  description: 'Plataforma de intercambio de cartas Magic: The Gathering. Gestiona tu colección, encuentra matches y conecta con otros jugadores.',
  foundingDate: '2024',
  areaServed: 'Latin America',
  knowsAbout: ['Magic: The Gathering', 'Card Trading', 'Collection Management'],
})

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: orgJsonLd,
    },
  ],
})
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
          <span class="text-h3 font-bold text-neon font-brother">CRANIAL TRADING</span>
        </RouterLink>
      </div>
    </header>

    <!-- Content -->
    <main id="main-content" class="max-w-4xl mx-auto px-6 py-12">
      <h1 class="text-h1 font-bold text-silver mb-8">Sobre Cranial Trading</h1>

      <!-- Mission Statement -->
      <section class="mb-12 p-8 border border-neon/30 bg-secondary">
        <p class="text-h3 text-neon font-bold leading-relaxed">
          Nuestra misión es democratizar el intercambio de cartas Magic: The Gathering en Latinoamérica
          y el mundo, conectando jugadores de forma segura y transparente.
        </p>
      </section>

      <div class="space-y-12 text-body text-silver-70">
        <!-- Qué Hacemos -->
        <section>
          <h2 class="text-h1 font-bold text-silver mb-6">Qué Hacemos</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Gestión de Colecciones -->
            <div class="border border-silver-30 p-6">
              <h3 class="text-h3 font-bold text-silver mb-3">Gestión de Colecciones</h3>
              <p>
                Registra cada carta con su edición, condición y precios de mercado. Importa desde Moxfield.
                Organiza en binders y mazos para tener el control total de tu colección.
              </p>
            </div>

            <!-- Matches Automáticos -->
            <div class="border border-silver-30 p-6">
              <h3 class="text-h3 font-bold text-silver mb-3">Matches Automáticos</h3>
              <p>
                Nuestro algoritmo cruza lo que buscas con lo que otros ofrecen, y viceversa.
                No más publicaciones en foros ni hojas de cálculo interminables.
              </p>
            </div>

            <!-- Mensajería Integrada -->
            <div class="border border-silver-30 p-6">
              <h3 class="text-h3 font-bold text-silver mb-3">Mensajería Integrada</h3>
              <p>
                Chatea directamente con traders que coincidan contigo. Negocia condiciones,
                comparte fotos de las cartas y acuerda el envío sin salir de la plataforma.
              </p>
            </div>

            <!-- Precios de Mercado -->
            <div class="border border-silver-30 p-6">
              <h3 class="text-h3 font-bold text-silver mb-3">Precios de Mercado</h3>
              <p>
                Precios en tiempo real de TCGPlayer a través de Scryfall. Valuación ajustada por condición
                para que los intercambios sean justos para ambas partes.
              </p>
            </div>
          </div>
        </section>

        <!-- Nuestros Datos -->
        <section>
          <h2 class="text-h1 font-bold text-silver mb-6">Nuestros Datos</h2>
          <p class="mb-4">
            Cranial Trading utiliza fuentes de datos confiables y reconocidas por la comunidad de Magic: The Gathering:
          </p>
          <ul class="list-disc list-inside space-y-3 ml-4">
            <li>
              <strong class="text-silver">Scryfall</strong> — Información de cartas, imágenes, legalidad de formatos
              y datos de ediciones. La referencia estándar para datos de MTG.
            </li>
            <li>
              <strong class="text-silver">TCGPlayer</strong> — Precios de mercado, el estándar para las Américas.
              Actualizados diariamente para reflejar el valor real de cada carta.
            </li>
            <li>
              <strong class="text-silver">Card Kingdom</strong> — Precios de buylist como referencia para venta.
              Útil para evaluar el valor mínimo de tus cartas.
            </li>
            <li>
              <strong class="text-silver">MTGJSON</strong> — Datos históricos de precios y tendencias.
              Información complementaria para análisis y seguimiento.
            </li>
          </ul>
          <p class="mt-6 p-4 bg-secondary border border-silver-30">
            <strong class="text-neon">Privacidad:</strong> No vendemos ni compartimos datos personales.
            Consulta nuestra
            <RouterLink to="/privacy" class="text-neon hover:underline">Política de Privacidad</RouterLink>
            para más detalles.
          </p>
        </section>

        <!-- Para la Comunidad -->
        <section>
          <h2 class="text-h1 font-bold text-silver mb-6">Para la Comunidad</h2>
          <p class="mb-4">
            Cranial Trading nació de una necesidad real: facilitar el intercambio de cartas en regiones donde
            la infraestructura de trading es limitada. Estos son nuestros principios:
          </p>
          <ul class="list-disc list-inside space-y-3 ml-4">
            <li>
              <strong class="text-silver">100% gratuito, sin comisiones</strong> — No cobramos por usar la plataforma
              ni tomamos porcentaje de las transacciones.
            </li>
            <li>
              <strong class="text-silver">Creado por jugadores para jugadores</strong> — Entendemos las necesidades
              de la comunidad porque somos parte de ella.
            </li>
            <li>
              <strong class="text-silver">Enfoque en Latinoamérica</strong> — Donde la infraestructura de trading
              es más limitada y la necesidad de herramientas accesibles es mayor.
            </li>
            <li>
              <strong class="text-silver">Apoyo a comunidades locales y tiendas (LGS)</strong> — Creemos que
              fortalecer el ecosistema local beneficia a todos los jugadores.
            </li>
            <li>
              <strong class="text-silver">Abierto a jugadores de todo el mundo</strong> — Aunque nuestro enfoque
              es Latinoamérica, cualquier jugador puede unirse y encontrar matches globalmente.
            </li>
          </ul>
        </section>

        <!-- Contáctanos -->
        <section>
          <h2 class="text-h1 font-bold text-silver mb-4">Contáctanos</h2>
          <p>
            ¿Tienes preguntas, sugerencias o quieres reportar un problema? Nos encantaría escucharte.
            Visita nuestra página de
            <RouterLink to="/contact" class="text-neon hover:underline">contacto</RouterLink>
            para comunicarte con el equipo de Cranial Trading.
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
        <nav class="flex gap-4 text-tiny" aria-label="Legal links">
          <RouterLink to="/terms" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.terms') }}</RouterLink>
          <RouterLink to="/privacy" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.privacy') }}</RouterLink>
          <RouterLink to="/cookies" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.cookies') }}</RouterLink>
          <span class="text-silver-30">|</span>
          <RouterLink to="/faq" class="text-neon font-bold underline underline-offset-2 hover:text-neon/80 transition-fast">{{ t('legal.footer.faq') }}</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
