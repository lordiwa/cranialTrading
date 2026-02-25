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
          <span class="text-h3 font-bold text-neon font-brother">CRANIAL TRADING</span>
        </RouterLink>
      </div>
    </header>

    <!-- Content -->
    <main class="max-w-4xl mx-auto px-6 py-12">
      <h1 class="text-h1 font-bold text-silver mb-2">{{ t('legal.terms.title') }}</h1>
      <p class="text-small text-silver-50 mb-8">{{ t('legal.cookies.lastUpdated') }} {{ lastUpdated }}</p>

      <div class="space-y-8 text-body text-silver-70">
        <!-- Intro -->
        <section>
          <p>
            Bienvenido a Cranial Trading. Al acceder y utilizar nuestra plataforma, aceptas estos términos y condiciones en su totalidad.
            Si no estás de acuerdo con alguna parte de estos términos, no debes usar nuestro servicio.
          </p>
        </section>

        <!-- 1. Descripción del Servicio -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">1. Descripción del Servicio</h2>
          <p class="mb-4">
            Cranial Trading es una plataforma gratuita que facilita el intercambio y comercio de cartas de Magic: The Gathering
            entre usuarios. Nuestros servicios incluyen:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>Gestión de colecciones personales de cartas</li>
            <li>Sistema de búsqueda de coincidencias (matches) entre traders</li>
            <li>Herramientas de comunicación entre usuarios</li>
            <li>Importación de mazos desde plataformas externas</li>
            <li>Consulta de precios de mercado</li>
          </ul>
        </section>

        <!-- 2. Registro y Cuenta -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">2. Registro y Cuenta de Usuario</h2>
          <p class="mb-4">Para utilizar Cranial Trading debes:</p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>Ser mayor de 18 años o contar con autorización de un tutor legal</li>
            <li>Proporcionar información veraz y actualizada</li>
            <li>Mantener la confidencialidad de tus credenciales de acceso</li>
            <li>Notificarnos inmediatamente cualquier uso no autorizado de tu cuenta</li>
          </ul>
          <p class="mt-4">
            Eres responsable de todas las actividades que ocurran bajo tu cuenta. Nos reservamos el derecho de
            suspender o cancelar cuentas que violen estos términos.
          </p>
        </section>

        <!-- 3. Uso Aceptable -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">3. Uso Aceptable</h2>
          <p class="mb-4">Al usar Cranial Trading, te comprometes a NO:</p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>Publicar información falsa o engañosa sobre tus cartas</li>
            <li>Realizar fraudes o estafas a otros usuarios</li>
            <li>Acosar, amenazar o difamar a otros miembros de la comunidad</li>
            <li>Usar la plataforma para actividades ilegales</li>
            <li>Intentar acceder a cuentas o datos de otros usuarios</li>
            <li>Interferir con el funcionamiento normal de la plataforma</li>
            <li>Crear múltiples cuentas para evadir restricciones</li>
            <li>Comercializar cartas falsificadas o réplicas</li>
          </ul>
        </section>

        <!-- 4. Transacciones -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">4. Transacciones entre Usuarios</h2>
          <p class="mb-4">
            Cranial Trading es una plataforma de conexión peer-to-peer (P2P). Esto significa que:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong class="text-silver">No somos intermediarios:</strong> Las transacciones se realizan directamente entre usuarios</li>
            <li><strong class="text-silver">No procesamos pagos:</strong> Los métodos de pago son acordados entre las partes</li>
            <li><strong class="text-silver">No garantizamos transacciones:</strong> Cada usuario es responsable de verificar la legitimidad de la contraparte</li>
            <li><strong class="text-silver">No custodiamos cartas:</strong> El envío y recepción es responsabilidad de los usuarios</li>
          </ul>
          <p class="mt-4 p-4 bg-secondary border border-silver-30">
            <strong class="text-neon">Recomendación:</strong> Siempre verifica la reputación del usuario, solicita fotos detalladas
            de las cartas, y utiliza métodos de pago con protección al comprador cuando sea posible.
          </p>
        </section>

        <!-- 5. Propiedad Intelectual -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">5. Propiedad Intelectual</h2>
          <p class="mb-4">
            Magic: The Gathering, los nombres de cartas, imágenes y símbolos son propiedad de Wizards of the Coast LLC.
            Cranial Trading no está afiliado, patrocinado ni respaldado por Wizards of the Coast.
          </p>
          <p>
            Los datos de cartas y precios son proporcionados por servicios de terceros como Scryfall y TCGPlayer.
            El uso de estos datos está sujeto a sus respectivos términos de servicio.
          </p>
        </section>

        <!-- 6. Privacidad -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">6. Privacidad y Datos</h2>
          <p>
            El tratamiento de tus datos personales se rige por nuestra
            <RouterLink to="/privacy" class="text-neon hover:underline">Política de Privacidad</RouterLink>.
            Al usar Cranial Trading, aceptas nuestras prácticas de recopilación y uso de datos.
          </p>
        </section>

        <!-- 7. Limitación de Responsabilidad -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">7. Limitación de Responsabilidad</h2>
          <p class="mb-4">Cranial Trading se proporciona "tal cual" sin garantías de ningún tipo. No nos hacemos responsables de:</p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>Pérdidas económicas derivadas de transacciones entre usuarios</li>
            <li>Inexactitudes en los precios de mercado mostrados</li>
            <li>Interrupciones del servicio o pérdida de datos</li>
            <li>Acciones de terceros usuarios de la plataforma</li>
            <li>Cartas extraviadas, dañadas o falsificadas en transacciones</li>
          </ul>
        </section>

        <!-- 8. Modificaciones -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">8. Modificaciones</h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios significativos
            serán notificados a través de la plataforma. El uso continuado del servicio después de las modificaciones
            constituye tu aceptación de los nuevos términos.
          </p>
        </section>

        <!-- 9. Terminación -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">9. Terminación</h2>
          <p>
            Puedes cerrar tu cuenta en cualquier momento desde la configuración. Nos reservamos el derecho de
            suspender o terminar cuentas que violen estos términos, sin previo aviso y sin responsabilidad.
          </p>
        </section>

        <!-- 10. Contacto -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">10. Contacto</h2>
          <p>
            Para consultas sobre estos términos, puedes contactarnos a través de la plataforma o enviar un
            mensaje a nuestro equipo de soporte.
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
          <RouterLink to="/terms" class="text-neon underline underline-offset-2">{{ t('legal.footer.terms') }}</RouterLink>
          <RouterLink to="/privacy" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.privacy') }}</RouterLink>
          <RouterLink to="/cookies" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.cookies') }}</RouterLink>
          <span class="text-silver-30">|</span>
          <RouterLink to="/faq" class="text-neon font-bold underline underline-offset-2 hover:text-neon/80 transition-fast">{{ t('legal.footer.faq') }}</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
