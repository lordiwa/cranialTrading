<script setup lang="ts">
// v2 redesign — shared stroke-icon symbol sprite (design→app v2 F1, see cranial-design/prototype/DESIGN-DIRECTION.md §4).
// Geometry copied verbatim from cranial-design/prototype/_shell-reference.html.
// Mounted once (in App.vue) — every IconV2 instance references these symbols via <use href="#i-...">.
// Not virtualized: this sprite lives in the app shell (header/tabbar), so the Mali <svg><use> risk
// documented in memory (many <use> per virtualized list item) does not apply here.
</script>

<template>
  <svg style="display:none" aria-hidden="true">
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
    <symbol id="i-cards" viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="16" rx="2" /><path d="M15 7h2.5A2.5 2.5 0 0 1 20 9.5V18a3 3 0 0 1-3 3h-6" /></symbol>
    <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8l-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8z" /></symbol>
    <symbol id="i-swap" viewBox="0 0 24 24"><path d="M4 8h13M14 4.5 17.5 8 14 11.5M20 16H7M10 12.5 6.5 16l3.5 3.5" /></symbol>
    <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3V11.5A8.5 8.5 0 0 1 11.5 3h1A8.5 8.5 0 0 1 21 11.5z" /></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.9 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12" /></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.4" /><path d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2" /></symbol>
    <symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4" /></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5" /></symbol>
    <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.4 9a2.7 2.7 0 1 1 3.6 2.5c-.8.3-1 .9-1 1.8M12 16.8v.2" /></symbol>
    <symbol id="i-sync" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3.5V8.5h-5" /></symbol>
    <symbol id="i-chev-d" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></symbol>
    <symbol id="i-chev-r" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></symbol>
    <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></symbol>
    <symbol id="i-arrow-r" viewBox="0 0 24 24"><path d="M4 12h16M13 5l7 7-7 7" /></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M4.5 12.5l5 5L20 6.5" /></symbol>
    <symbol id="i-block" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></symbol>
    <symbol id="i-import" viewBox="0 0 24 24"><path d="M12 3v12M7 10.5 12 15.5l5-5M4 21h16" /></symbol>
    <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20S3.5 15 3.5 9.2C3.5 6.3 5.7 4.5 8 4.5c1.6 0 3 .8 4 2.2 1-1.4 2.4-2.2 4-2.2 2.3 0 4.5 1.8 4.5 4.7C20.5 15 12 20 12 20z" /></symbol>
  </svg>
</template>
