<script setup lang="ts">
import { useHead, useSeoMeta } from '@unhead/vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

useSeoMeta({
  ogTitle: t('seo.pages.cardConditionGuide.title') + ' | Cranial Trading',
  ogDescription: t('seo.pages.cardConditionGuide.description'),
  ogType: 'website',
  ogUrl: 'https://cranialtrading.com/guide/card-conditions',
  ogSiteName: 'Cranial Trading',
  twitterCard: 'summary_large_image',
})

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Guía de Estado de Cartas Magic: The Gathering',
        description: 'Guía completa para identificar y clasificar el estado de cartas MTG: Mint, Near Mint, Lightly Played y más.',
        publisher: { '@type': 'Organization', name: 'Cranial Trading', url: 'https://cranialtrading.com' },
        mainEntityOfPage: 'https://cranialtrading.com/guide/card-conditions',
      }),
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
    <main class="max-w-4xl mx-auto px-6 py-12">
      <h1 class="text-h1 font-bold text-silver mb-2">Guía de Estado de Cartas Magic: The Gathering</h1>
      <p class="text-body text-silver-70 mb-10">
        El estado (condición) de una carta es uno de los factores más importantes en el intercambio y venta de cartas Magic: The Gathering.
        Una carta en perfecto estado puede valer varias veces más que la misma carta con desgaste significativo. Conocer la escala de condiciones
        te permite evaluar con precisión el valor real de tus cartas y negociar intercambios justos.
      </p>

      <div class="space-y-8 text-body text-silver-70">
        <!-- Escala de Condiciones -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-6">Escala de Condiciones</h2>
          <div class="space-y-4">
            <!-- M -->
            <div class="border-l-4 p-5 bg-secondary/30 rounded-r-md" style="border-color: #5AC168;">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-body font-bold text-silver">M — Mint</h3>
                <span class="text-neon font-bold text-small">100%</span>
              </div>
              <p class="text-small text-silver-70">
                Perfecto estado de fábrica. Sin marcas, bordes perfectos, superficie impecable en ambas caras.
                Recién sacada del sobre (pack fresh). Extremadamente raro de encontrar en cartas sueltas.
              </p>
            </div>

            <!-- NM -->
            <div class="border-l-4 p-5 bg-secondary/30 rounded-r-md" style="border-color: #5AC168;">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-body font-bold text-silver">NM — Near Mint</h3>
                <span class="text-neon font-bold text-small">100%</span>
              </div>
              <p class="text-small text-silver-70">
                Estado casi perfecto. Posible mínimo desgaste en bordes apenas perceptible a simple vista.
                Sin rayones en la superficie. La condición estándar del mercado — cuando se cotiza un precio,
                se asume NM. Jugable en torneo sin fundas protectoras.
              </p>
            </div>

            <!-- LP -->
            <div class="border-l-4 p-5 bg-secondary/30 rounded-r-md" style="border-color: #D4A843;">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-body font-bold text-silver">LP — Lightly Played</h3>
                <span class="font-bold text-small" style="color: #D4A843;">85%</span>
              </div>
              <p class="text-small text-silver-70">
                Desgaste menor visible al inspeccionar de cerca. Pequeños rayones en la superficie,
                leve blanqueamiento en bordes o esquinas. La carta ha sido jugada pero está en buen estado general.
                Completamente jugable con fundas.
              </p>
            </div>

            <!-- MP -->
            <div class="border-l-4 p-5 bg-secondary/30 rounded-r-md" style="border-color: #C4862B;">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-body font-bold text-silver">MP — Moderately Played</h3>
                <span class="font-bold text-small" style="color: #C4862B;">70%</span>
              </div>
              <p class="text-small text-silver-70">
                Desgaste notable a simple vista. Rayones visibles en la superficie, blanqueamiento moderado
                de bordes, posibles pliegues menores o marcas de shuffling. La carta muestra uso regular.
                Jugable con fundas opacas.
              </p>
            </div>

            <!-- HP -->
            <div class="border-l-4 p-5 bg-secondary/30 rounded-r-md" style="border-color: #8B2E1F;">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-body font-bold text-silver">HP — Heavily Played</h3>
                <span class="font-bold text-small" style="color: #8B2E1F;">50%</span>
              </div>
              <p class="text-small text-silver-70">
                Desgaste significativo en múltiples áreas. Rayones importantes, blanqueamiento fuerte de bordes
                y esquinas, pliegues notables, posible suciedad acumulada. La carta ha sido extensamente jugada
                sin protección. Requiere fundas opacas para torneo.
              </p>
            </div>

            <!-- PO -->
            <div class="border-l-4 p-5 bg-secondary/30 rounded-r-md" style="border-color: #8B2E1F;">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-body font-bold text-silver">PO — Poor / Damaged</h3>
                <span class="font-bold text-small" style="color: #8B2E1F;">30%</span>
              </div>
              <p class="text-small text-silver-70">
                Daño severo que compromete la integridad de la carta. Roturas, dobleces pronunciados, daño por agua,
                manchas permanentes, escritura o marcas con tinta. Puede no ser legal en torneo incluso con fundas.
                Solo coleccionistas o jugadores casuales la aceptarían.
              </p>
            </div>
          </div>
        </section>

        <!-- Tabla de Multiplicadores -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">Tabla de Multiplicadores de Precio</h2>
          <p class="mb-4">
            Los precios de mercado se cotizan para cartas en estado NM (Near Mint).
            Para otras condiciones, se aplica un multiplicador que ajusta el valor:
          </p>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="border-b border-silver-30">
                  <th class="text-left text-small font-bold text-silver py-3 px-4">Condición</th>
                  <th class="text-center text-small font-bold text-silver py-3 px-4">Multiplicador</th>
                  <th class="text-right text-small font-bold text-silver py-3 px-4">Ejemplo ($10.00 NM)</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-silver-20"><td class="py-3 px-4 text-small text-silver">M — Mint</td><td class="py-3 px-4 text-small text-neon text-center font-bold">100%</td><td class="py-3 px-4 text-small text-silver text-right">$10.00</td></tr>
                <tr class="border-b border-silver-20"><td class="py-3 px-4 text-small text-silver">NM — Near Mint</td><td class="py-3 px-4 text-small text-neon text-center font-bold">100%</td><td class="py-3 px-4 text-small text-silver text-right">$10.00</td></tr>
                <tr class="border-b border-silver-20"><td class="py-3 px-4 text-small text-silver">LP — Lightly Played</td><td class="py-3 px-4 text-small text-center font-bold" style="color: #D4A843;">85%</td><td class="py-3 px-4 text-small text-silver text-right">$8.50</td></tr>
                <tr class="border-b border-silver-20"><td class="py-3 px-4 text-small text-silver">MP — Moderately Played</td><td class="py-3 px-4 text-small text-center font-bold" style="color: #C4862B;">70%</td><td class="py-3 px-4 text-small text-silver text-right">$7.00</td></tr>
                <tr class="border-b border-silver-20"><td class="py-3 px-4 text-small text-silver">HP — Heavily Played</td><td class="py-3 px-4 text-small text-center font-bold" style="color: #8B2E1F;">50%</td><td class="py-3 px-4 text-small text-silver text-right">$5.00</td></tr>
                <tr><td class="py-3 px-4 text-small text-silver">PO — Poor</td><td class="py-3 px-4 text-small text-center font-bold" style="color: #8B2E1F;">30%</td><td class="py-3 px-4 text-small text-silver text-right">$3.00</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Cómo Afecta al Valor -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">Cómo Afecta la Condición al Valor</h2>
          <p class="mb-4">
            En el mercado de MTG, <strong class="text-silver">Near Mint (NM) es el estándar</strong>. Cuando ves un precio en TCGPlayer,
            CardMarket o cualquier tienda, ese precio corresponde a una carta en estado NM. Cualquier condición inferior reduce el valor proporcionalmente.
          </p>
          <p class="mb-4">
            Esto es especialmente importante en cartas de alto valor. Una carta de $100 en estado HP vale aproximadamente $50 —
            una diferencia de $50 que puede significar un intercambio desigual si no se tiene en cuenta la condición.
          </p>
          <p>
            Por eso, en Cranial Trading ajustamos automáticamente los precios según la condición registrada en tu colección,
            para que tanto tú como tu contraparte tengan una referencia justa al negociar.
          </p>
        </section>

        <!-- Consejos para Preservar -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">Consejos para Preservar tus Cartas</h2>
          <ul class="list-disc list-inside space-y-3 ml-4">
            <li><strong class="text-silver">Fundas dobles (double sleeve):</strong> Usa una funda interior (perfect fit) más una funda exterior estándar. Protege contra polvo, humedad y desgaste.</li>
            <li><strong class="text-silver">Carpetas con hojas de bolsillos:</strong> Ideales para colecciones. Usa hojas de carga lateral (side-loading) para evitar que las cartas se salgan.</li>
            <li><strong class="text-silver">Toploaders para cartas valiosas:</strong> Protectores rígidos de plástico para cartas de alto valor. Esenciales para envío seguro.</li>
            <li><strong class="text-silver">Evita humedad y luz solar:</strong> Almacena en un lugar fresco y seco. La humedad puede curvar cartas y la luz UV desvanece los colores.</li>
            <li><strong class="text-silver">Cajas con tapa magnética:</strong> Para mazos activos, usa cajas de calidad con cierre magnético que mantengan las cartas firmes y protegidas.</li>
            <li><strong class="text-silver">Manos limpias:</strong> Manipula cartas valiosas con manos limpias y secas. Los aceites naturales de la piel pueden dejar marcas con el tiempo.</li>
          </ul>
        </section>

        <!-- Cómo Cranial Trading Usa las Condiciones -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">Cómo Cranial Trading Usa las Condiciones</h2>
          <p class="mb-4">
            Cuando agregas una carta a tu colección en Cranial Trading, seleccionas su condición (M, NM, LP, MP, HP o PO).
            El sistema automáticamente:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4 mb-4">
            <li>Aplica el multiplicador correspondiente al precio de mercado</li>
            <li>Muestra el precio ajustado en tu colección y al buscar matches</li>
            <li>Permite que otros usuarios vean la condición antes de proponer un intercambio</li>
          </ul>
          <p>
            ¿Listo para gestionar tu colección con precios ajustados por condición?
            <RouterLink to="/register" class="text-neon hover:underline font-bold">Crea tu cuenta gratis</RouterLink>
            o conoce más sobre
            <RouterLink to="/guide/how-to-trade" class="text-neon hover:underline font-bold">cómo intercambiar de forma segura</RouterLink>.
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
