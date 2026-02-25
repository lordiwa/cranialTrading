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
      <h1 class="text-h1 font-bold text-silver mb-2">{{ t('legal.privacy.title') }}</h1>
      <p class="text-small text-silver-50 mb-8">{{ t('legal.cookies.lastUpdated') }} {{ lastUpdated }}</p>

      <div class="space-y-8 text-body text-silver-70">
        <!-- Intro -->
        <section>
          <p>
            En Cranial Trading, tu privacidad es importante para nosotros. Esta política explica qué datos recopilamos,
            cómo los usamos y qué derechos tienes sobre tu información personal.
          </p>
        </section>

        <!-- 1. Responsable -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">1. Responsable del Tratamiento</h2>
          <p>
            Cranial Trading es una plataforma operada de forma independiente. Para cualquier consulta sobre
            el tratamiento de tus datos personales, puedes contactarnos a través de la plataforma.
          </p>
        </section>

        <!-- 2. Datos que Recopilamos -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">2. Datos que Recopilamos</h2>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">2.1 Datos de Registro</h3>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong class="text-silver">Email:</strong> Para autenticación y comunicaciones</li>
            <li><strong class="text-silver">Nombre de usuario:</strong> Para identificarte en la plataforma</li>
            <li><strong class="text-silver">Contraseña:</strong> Almacenada de forma encriptada</li>
            <li><strong class="text-silver">Ubicación (opcional):</strong> Ciudad/país para facilitar trades locales</li>
          </ul>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">2.2 Datos de Uso</h3>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong class="text-silver">Colección de cartas:</strong> Las cartas que agregas a tu inventario</li>
            <li><strong class="text-silver">Preferencias:</strong> Cartas que buscas y configuraciones</li>
            <li><strong class="text-silver">Mazos:</strong> Listas de cartas organizadas</li>
            <li><strong class="text-silver">Mensajes:</strong> Comunicaciones con otros usuarios</li>
            <li><strong class="text-silver">Matches:</strong> Coincidencias encontradas con otros traders</li>
          </ul>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">2.3 Datos Técnicos</h3>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>Dirección IP</li>
            <li>Tipo de navegador y dispositivo</li>
            <li>Páginas visitadas y tiempo de uso</li>
            <li>Datos de rendimiento y errores</li>
          </ul>
        </section>

        <!-- 3. Cómo Usamos los Datos -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">3. Cómo Usamos tus Datos</h2>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong class="text-silver">Proveer el servicio:</strong> Gestionar tu cuenta, colección y matches</li>
            <li><strong class="text-silver">Conectarte con traders:</strong> Encontrar coincidencias y facilitar comunicación</li>
            <li><strong class="text-silver">Mejorar la plataforma:</strong> Analizar uso y corregir errores</li>
            <li><strong class="text-silver">Seguridad:</strong> Prevenir fraudes y proteger a los usuarios</li>
            <li><strong class="text-silver">Comunicaciones:</strong> Notificaciones sobre tu cuenta y el servicio</li>
          </ul>
        </section>

        <!-- 4. Datos Públicos -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">4. Información Pública</h2>
          <p class="mb-4">
            Algunos datos son visibles para otros usuarios de la plataforma:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong class="text-silver">Nombre de usuario:</strong> Visible en tu perfil público</li>
            <li><strong class="text-silver">Ubicación:</strong> Si decides compartirla</li>
            <li><strong class="text-silver">Cartas públicas:</strong> Las que marques como visibles en tu perfil</li>
          </ul>
          <p class="mt-4 p-4 bg-secondary border border-silver-30">
            <strong class="text-neon">Control:</strong> Puedes controlar qué cartas son públicas usando el toggle
            de visibilidad en cada carta o en la vista de mazo.
          </p>
        </section>

        <!-- 5. Compartir Datos -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">5. Con Quién Compartimos Datos</h2>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">5.1 Otros Usuarios</h3>
          <p class="mb-4">
            Cuando hay un match, el otro usuario puede ver tu nombre de usuario, ubicación (si es pública),
            y las cartas involucradas en la coincidencia.
          </p>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">5.2 Proveedores de Servicio</h3>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong class="text-silver">Firebase (Google):</strong> Autenticación y base de datos</li>
            <li><strong class="text-silver">Scryfall:</strong> Datos de cartas (no compartimos tus datos con ellos)</li>
          </ul>

          <h3 class="text-small font-bold text-silver mt-6 mb-3">5.3 Requisitos Legales</h3>
          <p>
            Podemos divulgar datos si es requerido por ley o para proteger nuestros derechos, seguridad
            o la de otros usuarios.
          </p>
        </section>

        <!-- 6. Seguridad -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">6. Seguridad de los Datos</h2>
          <p class="mb-4">Implementamos medidas de seguridad incluyendo:</p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>Conexiones encriptadas (HTTPS)</li>
            <li>Contraseñas hasheadas con algoritmos seguros</li>
            <li>Autenticación mediante Firebase Auth</li>
            <li>Reglas de seguridad en base de datos</li>
          </ul>
          <p class="mt-4">
            Ningún sistema es 100% seguro. Te recomendamos usar contraseñas únicas y fuertes.
          </p>
        </section>

        <!-- 7. Retención -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">7. Retención de Datos</h2>
          <p>
            Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, borraremos
            tus datos personales en un plazo razonable, excepto cuando debamos retenerlos por
            obligaciones legales o para resolver disputas.
          </p>
        </section>

        <!-- 8. Tus Derechos -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">8. Tus Derechos</h2>
          <p class="mb-4">Tienes derecho a:</p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong class="text-silver">Acceso:</strong> Solicitar una copia de tus datos</li>
            <li><strong class="text-silver">Rectificación:</strong> Corregir datos inexactos</li>
            <li><strong class="text-silver">Eliminación:</strong> Solicitar el borrado de tu cuenta y datos</li>
            <li><strong class="text-silver">Portabilidad:</strong> Exportar tus datos en formato legible</li>
            <li><strong class="text-silver">Oposición:</strong> Oponerte a ciertos usos de tus datos</li>
          </ul>
          <p class="mt-4">
            Para ejercer estos derechos, contacta con nosotros a través de la plataforma.
          </p>
        </section>

        <!-- 9. Menores -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">9. Menores de Edad</h2>
          <p>
            Cranial Trading está dirigido a mayores de 18 años. No recopilamos intencionalmente
            datos de menores. Si descubrimos que hemos recopilado datos de un menor sin
            consentimiento parental, los eliminaremos.
          </p>
        </section>

        <!-- 10. Cambios -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">10. Cambios a esta Política</h2>
          <p>
            Podemos actualizar esta política ocasionalmente. Publicaremos los cambios en esta página
            con una nueva fecha de actualización. Te recomendamos revisarla periódicamente.
          </p>
        </section>

        <!-- 11. Contacto -->
        <section>
          <h2 class="text-h3 font-bold text-silver mb-4">11. Contacto</h2>
          <p>
            Si tienes preguntas sobre esta política o el tratamiento de tus datos, contáctanos
            a través de la función de mensajes de la plataforma.
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
          <RouterLink to="/privacy" class="text-neon underline underline-offset-2">{{ t('legal.footer.privacy') }}</RouterLink>
          <RouterLink to="/cookies" class="text-silver-50 hover:text-silver hover:underline transition-fast">{{ t('legal.footer.cookies') }}</RouterLink>
          <span class="text-silver-30">|</span>
          <RouterLink to="/faq" class="text-neon font-bold underline underline-offset-2 hover:text-neon/80 transition-fast">{{ t('legal.footer.faq') }}</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
