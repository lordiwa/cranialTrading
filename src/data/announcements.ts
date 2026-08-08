/**
 * Announcements shown on the /inicio carousel.
 *
 * This file IS the editing surface — Rafael edits it and the next deploy publishes.
 * It deliberately lives in the bundle rather than Firestore so the landing keeps its
 * zero-extra-reads property: a Firestore-backed announcements collection would put a
 * read back on the one screen built to avoid them.
 *
 * Trade-off to know: changing an announcement needs a deploy. If that becomes
 * annoying, moving to Firestore is the fix — and it costs one read per landing.
 *
 * Ordering: first entry shows first. Put the freshest on top.
 * `tag` is the small label above the title (kept short — it renders in a pill).
 * `href` is optional; with it the whole slide becomes a link. Use an internal path
 * ('/search?q=…') for in-app destinations.
 */
import type { SupportedLocale } from '../composables/useI18n';

export interface Announcement {
  id: string;
  tag: Record<SupportedLocale, string>;
  title: Record<SupportedLocale, string>;
  body: Record<SupportedLocale, string>;
  href?: string;
}

export const announcements: Announcement[] = [
  {
    id: 'home-landing',
    tag: { es: 'Novedad', en: 'New', pt: 'Novidade' },
    title: {
      es: 'Nueva pantalla de inicio',
      en: 'New home screen',
      pt: 'Nova tela inicial',
    },
    body: {
      es: 'Ahora entrás directo a buscar. Tus matches y tu colección siguen a un clic.',
      en: 'You now land straight on search. Your matches and collection are one click away.',
      pt: 'Agora você entra direto na busca. Seus matches e coleção ficam a um clique.',
    },
  },
  {
    id: 'faster-landing',
    tag: { es: 'Rendimiento', en: 'Performance', pt: 'Desempenho' },
    title: {
      es: 'La app carga 4x más rápido',
      en: 'The app loads 4x faster',
      pt: 'O app carrega 4x mais rápido',
    },
    body: {
      es: 'Reescribimos cómo se cargan tus matches. Lo que tardaba minutos ahora tarda segundos.',
      en: 'We rewrote how your matches load. What took minutes now takes seconds.',
      pt: 'Reescrevemos como seus matches carregam. O que levava minutos agora leva segundos.',
    },
  },
];
