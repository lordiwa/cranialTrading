<script setup lang="ts">
import { useHead, useSeoMeta } from '@unhead/vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

useSeoMeta({
  ogTitle: t('seo.pages.howToTrade.title') + ' | Cranial Trading',
  ogDescription: t('seo.pages.howToTrade.description'),
  ogType: 'website',
  ogUrl: 'https://cranialtrading.com/guide/how-to-trade',
  ogSiteName: 'Cranial Trading',
  twitterCard: 'summary_large_image',
})

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'Cómo Intercambiar Cartas MTG de Forma Segura',
        description: 'Guía paso a paso para intercambiar cartas Magic: The Gathering de forma segura en Cranial Trading.',
        step: [
          { '@type': 'HowToStep', name: 'Sube tu Colección', text: 'Importa tus cartas desde Moxfield o agrégalas manualmente. Marca su estado: venta, cambio o deseado.' },
          { '@type': 'HowToStep', name: 'Encuentra Coincidencias', text: 'El algoritmo automáticamente busca usuarios que tienen lo que buscas y buscan lo que ofreces.' },
          { '@type': 'HowToStep', name: 'Evalúa las Cartas', text: 'Verifica condición, edición y precio de mercado antes de aceptar un intercambio.' },
          { '@type': 'HowToStep', name: 'Acuerda los Términos', text: 'Usa la mensajería integrada para negociar condiciones, método de envío y costos.' },
          { '@type': 'HowToStep', name: 'Envía y Confirma', text: 'Empaca las cartas de forma segura, envía con tracking y confirma la recepción.' },
        ],
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
    <main id="main-content" class="max-w-4xl mx-auto px-6 py-12">
      <h1 class="text-h1 font-bold text-silver mb-2">Cómo Intercambiar Cartas MTG de Forma Segura</h1>
      <p class="text-body text-silver-70 mb-8">
        El intercambio de cartas es parte fundamental de la experiencia Magic: The Gathering. Cranial Trading facilita
        la conexión entre jugadores, pero la seguridad en cada transacción depende de ti. Esta guía te ayudará a
        intercambiar con confianza.
      </p>

      <div class="space-y-10 text-body text-silver-70">
        <!-- Warning Box -->
        <section class="border-2 border-neon bg-neon/5 p-6 rounded-md">
          <h2 class="text-body font-bold text-neon mb-3">Importante: Plataforma Peer-to-Peer (P2P)</h2>
          <ul class="space-y-2 text-small">
            <li class="flex items-start gap-2">
              <span class="text-neon mt-0.5 flex-shrink-0">&#9888;</span>
              <span>Cranial Trading facilita la conexión entre jugadores pero <strong class="text-silver">NO es intermediario</strong> en las transacciones.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-neon mt-0.5 flex-shrink-0">&#9888;</span>
              <span>Las transacciones se realizan <strong class="text-silver">directamente entre usuarios</strong>. No procesamos pagos ni custodiamos cartas.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-neon mt-0.5 flex-shrink-0">&#9888;</span>
              <span>Siempre <strong class="text-silver">verifica la identidad y reputación</strong> de tu contraparte antes de enviar cartas o dinero.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-neon mt-0.5 flex-shrink-0">&#9888;</span>
              <span>Usa <strong class="text-silver">métodos de pago con protección al comprador</strong> siempre que sea posible.</span>
            </li>
          </ul>
        </section>

        <!-- Proceso Paso a Paso -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-6">Proceso Paso a Paso</h2>
          <div class="space-y-6">
            <!-- Paso 1 -->
            <div class="flex gap-4">
              <div class="w-10 h-10 rounded-full bg-neon-10 border-2 border-neon text-neon flex items-center justify-center text-body font-bold flex-shrink-0">1</div>
              <div>
                <h3 class="text-body font-bold text-silver mb-2">Sube tu Colección</h3>
                <p class="text-small text-silver-70">
                  Importa tus cartas desde Moxfield o agrégalas manualmente buscando en la base de datos de Scryfall.
                  Marca el estado de cada carta: <strong class="text-silver">venta</strong> (quieres vender),
                  <strong class="text-silver">cambio</strong> (quieres intercambiar) o <strong class="text-silver">deseado</strong> (cartas que buscas).
                  El sistema necesita saber qué ofreces y qué necesitas para encontrar coincidencias.
                </p>
              </div>
            </div>

            <!-- Paso 2 -->
            <div class="flex gap-4">
              <div class="w-10 h-10 rounded-full bg-neon-10 border-2 border-neon text-neon flex items-center justify-center text-body font-bold flex-shrink-0">2</div>
              <div>
                <h3 class="text-body font-bold text-silver mb-2">Encuentra Coincidencias</h3>
                <p class="text-small text-silver-70">
                  El algoritmo de Cranial Trading cruza automáticamente tu lista de cartas disponibles y deseadas con las
                  de todos los demás usuarios. Cuando encuentras un match, significa que otro jugador tiene algo que tú quieres
                  y tú tienes algo que él quiere. Sin necesidad de publicar en foros ni revisar hojas de cálculo.
                </p>
              </div>
            </div>

            <!-- Paso 3 -->
            <div class="flex gap-4">
              <div class="w-10 h-10 rounded-full bg-neon-10 border-2 border-neon text-neon flex items-center justify-center text-body font-bold flex-shrink-0">3</div>
              <div>
                <h3 class="text-body font-bold text-silver mb-2">Evalúa las Cartas</h3>
                <p class="text-small text-silver-70">
                  Antes de acordar un intercambio, verifica la <RouterLink to="/guide/card-conditions" class="text-neon hover:underline font-bold">condición de las cartas</RouterLink>,
                  la edición y el precio de mercado actual. Cranial Trading muestra precios de TCGPlayer ajustados por condición
                  para que ambas partes tengan una referencia clara del valor real.
                </p>
              </div>
            </div>

            <!-- Paso 4 -->
            <div class="flex gap-4">
              <div class="w-10 h-10 rounded-full bg-neon-10 border-2 border-neon text-neon flex items-center justify-center text-body font-bold flex-shrink-0">4</div>
              <div>
                <h3 class="text-body font-bold text-silver mb-2">Acuerda los Términos</h3>
                <p class="text-small text-silver-70">
                  Usa la mensajería integrada para negociar con tu contraparte. Acuerden claramente:
                  condición exacta de las cartas, edición específica, método de envío, quién paga el envío,
                  y cualquier diferencia de valor que deba compensarse. Pide fotos detalladas de las cartas
                  antes de cerrar el trato.
                </p>
              </div>
            </div>

            <!-- Paso 5 -->
            <div class="flex gap-4">
              <div class="w-10 h-10 rounded-full bg-neon-10 border-2 border-neon text-neon flex items-center justify-center text-body font-bold flex-shrink-0">5</div>
              <div>
                <h3 class="text-body font-bold text-silver mb-2">Envía y Confirma</h3>
                <p class="text-small text-silver-70">
                  Empaca las cartas de forma segura (ver sección de envío más abajo), envía con número de seguimiento
                  y comparte el tracking con tu contraparte. Al recibir, verifica que las cartas coincidan con lo acordado
                  en condición y edición. Confirma la recepción para mantener la confianza en la comunidad.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Verificar Autenticidad -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">Cómo Verificar la Autenticidad de una Carta</h2>
          <p class="mb-4">
            Las cartas falsificadas son un problema real en el mercado de MTG, especialmente en cartas de alto valor.
            Estos son los métodos más confiables para verificar autenticidad:
          </p>
          <div class="space-y-4">
            <div class="p-4 bg-secondary/30 border border-silver-30 rounded-md">
              <h3 class="text-small font-bold text-silver mb-1">Test de Luz</h3>
              <p class="text-small text-silver-70">
                Sostén la carta contra una fuente de luz brillante. Las cartas reales de Magic tienen una capa central
                azul/negra que bloquea la mayor parte de la luz. Las falsificaciones suelen ser más translúcidas o
                dejan pasar la luz de manera uniforme.
              </p>
            </div>
            <div class="p-4 bg-secondary/30 border border-silver-30 rounded-md">
              <h3 class="text-small font-bold text-silver mb-1">Test de Lupa (20x)</h3>
              <p class="text-small text-silver-70">
                Bajo magnificación de 20x, las cartas reales muestran un patrón de impresión roseta (puntos en forma de roseta).
                Las falsificaciones suelen tener un patrón diferente, más borroso, o puntos distribuidos de manera irregular.
              </p>
            </div>
            <div class="p-4 bg-secondary/30 border border-silver-30 rounded-md">
              <h3 class="text-small font-bold text-silver mb-1">Test del Punto Verde</h3>
              <p class="text-small text-silver-70">
                Bajo magnificación, examina el símbolo de mana verde en la carta. En cartas reales, verás puntos
                individuales de color rojo, verde y azul (RGB) claramente separados. En falsificaciones, los colores
                tienden a fusionarse o el patrón es diferente.
              </p>
            </div>
            <div class="p-4 bg-secondary/30 border border-silver-30 rounded-md">
              <h3 class="text-small font-bold text-silver mb-1">Peso y Textura</h3>
              <p class="text-small text-silver-70">
                Una carta real de MTG pesa aproximadamente 1.8 gramos y tiene una textura tipo lino (linen finish)
                que se siente ligeramente rugosa al tacto. Las falsificaciones suelen ser más lisas, más gruesas o
                más ligeras que el original.
              </p>
            </div>
          </div>
        </section>

        <!-- Mejores Prácticas de Envío -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">Mejores Prácticas de Envío</h2>
          <p class="mb-4">
            Un envío mal preparado puede arruinar cartas valiosas. Sigue estas recomendaciones para proteger
            tus cartas durante el transporte:
          </p>
          <ul class="list-disc list-inside space-y-3 ml-4">
            <li><strong class="text-silver">Funda interior (penny sleeve) + toploader:</strong> Cada carta debe ir en una funda plástica suave y luego en un protector rígido (toploader).</li>
            <li><strong class="text-silver">Cinta de pintor:</strong> Sella la apertura del toploader con cinta de pintor (painter's tape). Nunca uses cinta adhesiva directa sobre el toploader, ya que deja residuo difícil de remover.</li>
            <li><strong class="text-silver">Sobre acolchado o bubble mailer:</strong> Envía en un sobre con protección de burbujas. Evita sobres simples que no protegen contra dobleces.</li>
            <li><strong class="text-silver">Número de seguimiento:</strong> Para envíos de más de $20 en valor, siempre usa un servicio con tracking. Comparte el número de seguimiento con tu contraparte.</li>
            <li><strong class="text-silver">Marca "NO DOBLAR":</strong> Escribe "NO DOBLAR" / "DO NOT BEND" visiblemente en el sobre exterior.</li>
            <li><strong class="text-silver">Seguro para cartas de alto valor:</strong> Para envíos de más de $50, considera agregar seguro postal que cubra el valor declarado.</li>
          </ul>
        </section>

        <!-- Banderas Rojas -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">Banderas Rojas: Señales de Alerta</h2>
          <div class="border-2 border-rust bg-rust/5 p-6 rounded-md">
            <p class="text-small text-silver-70 mb-4">
              Si detectas alguna de estas señales, procede con extrema precaución o cancela la negociación:
            </p>
            <ul class="space-y-3 text-small">
              <li class="flex items-start gap-2">
                <span class="text-rust mt-0.5 flex-shrink-0 font-bold">&#10007;</span>
                <span><strong class="text-silver">Rehúsa enviar fotos detalladas</strong> de las cartas cuando se le solicita.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-rust mt-0.5 flex-shrink-0 font-bold">&#10007;</span>
                <span><strong class="text-silver">Presiona para cerrar el trato rápidamente</strong> sin dar tiempo para verificar.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-rust mt-0.5 flex-shrink-0 font-bold">&#10007;</span>
                <span><strong class="text-silver">Ofrece precios demasiado buenos para ser verdad</strong> — si parece demasiado bueno, probablemente lo sea.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-rust mt-0.5 flex-shrink-0 font-bold">&#10007;</span>
                <span><strong class="text-silver">Rechaza métodos de pago con protección</strong> e insiste en transferencias directas o criptomonedas.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-rust mt-0.5 flex-shrink-0 font-bold">&#10007;</span>
                <span><strong class="text-silver">Cuenta recién creada sin historial</strong> — no significa que sea estafador, pero justifica precaución extra.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-rust mt-0.5 flex-shrink-0 font-bold">&#10007;</span>
                <span><strong class="text-silver">Evita responder preguntas sobre condición o edición</strong> de las cartas ofrecidas.</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- CTA -->
        <section class="border border-silver-30 p-6 rounded-md text-center">
          <h3 class="text-body font-bold text-silver mb-2">¿Listo para intercambiar?</h3>
          <p class="text-small text-silver-70 mb-4">
            Crea tu cuenta gratuita y comienza a encontrar matches con otros jugadores de MTG.
          </p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <RouterLink to="/register" class="text-neon hover:underline text-small font-bold">
              Crear cuenta gratis
            </RouterLink>
            <span class="text-silver-30 hidden sm:inline">|</span>
            <RouterLink to="/guide/card-conditions" class="text-neon hover:underline text-small font-bold">
              Guía de Estado de Cartas
            </RouterLink>
          </div>
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
