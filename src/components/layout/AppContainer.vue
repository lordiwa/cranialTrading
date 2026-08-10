<script setup lang="ts">
import { type Component, onMounted, shallowRef } from 'vue';
import { shouldRenderAuthenticatedChrome } from '../../utils/authChrome';
import { getLastKnownAuthState } from '../../utils/authLastKnown';

/**
 * TASK-183: AppHeader is loaded as an async component, not a static import,
 * and is not mounted until after the first paint.
 *
 * BOTH HALVES ARE REQUIRED AND NEITHER WORKS ALONE. Making it async without
 * deferring the mount would still request its chunk during boot; deferring
 * the mount while keeping the static import would still DOWNLOAD it during
 * boot, because a static import is part of the route chunk's own module
 * graph and an ES module is evaluated whole. TASK-178 phase 2 was reverted
 * for exactly that mistake in the other direction — deferring work whose
 * bytes had already been fetched.
 *
 * What this buys is not the header's own markup, which is small. It is
 * everything the header drags behind it: stores/matches, stores/collection
 * and stores/messages, which statically import firebase/firestore (112KB
 * gzip — see TASK-181), plus icons.svg and the avatar request. None of that
 * is needed for /inicio's hero to be usable.
 */
const AppHeader = shallowRef<Component | null>(null);

/**
 * TASK-184: the two global modals are deferred for a different reason than
 * the header, and it is worth stating because it was invisible until a CDP
 * initiator stack pointed at it. Neither renders anything until it is
 * opened, so their cost was never their markup — WelcomeModal imports
 * useTour, and composables/useTour statically imports firebase/firestore.
 * That one static edge put the whole 162KB gzip Firebase chunk into
 * /inicio's ROUTE chunk graph, so it was requested at t+2.4s no matter what
 * stores/auth.ts did about deferring its own fetch. Deferring the auth
 * store's request alone was measured changing nothing at all (5594ms vs
 * 5560ms) precisely because this edge, not that request, is what pulled it.
 */
const HelpCarouselModal = shallowRef<Component | null>(null);
const WelcomeModal = shallowRef<Component | null>(null);

/**
 * The header is the topmost element, so mounting it late pushes everything
 * below it down — the exact layout jump TASK-182 went out of its way to
 * avoid in the other direction. The placeholder holds the header's own
 * height from the very first frame, and mirrors AppHeader's real structure
 * rather than hard-coding a pixel total: row 1 is `h-14 md:h-[72px]` with a
 * bottom border, and the desktop nav row exists only when the authenticated
 * chrome does — decided by the same predicate AppHeader itself uses, so the
 * placeholder and the real header can never disagree about whether that row
 * is there.
 */
const showAuthenticatedChrome = shouldRenderAuthenticatedChrome(false, false, getLastKnownAuthState());

let deferredLoadStarted = false;
const loadDeferredChrome = (): void => {
    if (deferredLoadStarted) return;
    deferredLoadStarted = true;
    void import('./AppHeader.vue').then((m) => {
        AppHeader.value = m.default;
    });
    void import('../ui/HelpCarouselModal.vue').then((m) => {
        HelpCarouselModal.value = m.default;
    });
    void import('../ui/WelcomeModal.vue').then((m) => {
        WelcomeModal.value = m.default;
    });
};

onMounted(() => {
    // Two frames, not one: the first fires before the browser has painted the
    // frame this mount belongs to, so scheduling inside it would still put
    // these requests ahead of the paint they exist to protect.
    requestAnimationFrame(() => {
        requestAnimationFrame(loadDeferredChrome);
    });
    // THE TIMER IS NOT BELT-AND-BRACES, IT IS THE ONLY THING THAT WORKS IN A
    // BACKGROUND TAB. requestAnimationFrame does not fire while a tab is not
    // visible, so on the rAF path alone the header simply never appeared —
    // caught by opening the app in a real Chrome window that happened not to
    // be focused, not by any measurement (Playwright's pages count as
    // visible, so every harness run looked perfect). Opening a link in a new
    // background tab, or restoring a session, is an ordinary thing to do.
    // When the tab IS visible the rAF path wins this race long before the
    // timer, so the deferral is unaffected.
    setTimeout(loadDeferredChrome, 1000);
});
</script>

<template>
  <div class="min-h-screen">
    <!--
      The swap is driven by the module actually being RESOLVED, never by a
      timer. An earlier version flipped a boolean after two frames and let an
      async component take over: the flag went true ~32ms in, the chunk had
      not arrived yet, the async component rendered nothing, and the reserved
      space collapsed — measured as a 118px jump on desktop. The placeholder
      has to survive until there is something real to put in its place.
    -->
    <component :is="AppHeader" v-if="AppHeader" />
    <div
        v-else
        aria-hidden="true"
        class="bg-hdr border-b border-line"
        data-testid="app-header-placeholder"
    >
      <div class="h-14 md:h-[72px]"></div>
      <div v-if="showAuthenticatedChrome" class="hidden md:block border-t border-line">
        <div class="min-h-[44px]"></div>
      </div>
    </div>
    <main id="main-content" class="container mx-auto px-4 md:px-lg py-6 md:py-8 pb-24 md:pb-8 max-w-[1200px] overflow-x-clip">
      <slot />
    </main>

    <!-- Global Help Carousel Modal -->
    <component :is="HelpCarouselModal" v-if="HelpCarouselModal" />

    <!-- Onboarding Tour Welcome -->
    <component :is="WelcomeModal" v-if="WelcomeModal" />
  </div>
</template>
