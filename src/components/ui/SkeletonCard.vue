<template>
  <div class="flex flex-col">
    <div class="h-[28px] rounded bg-silver-5 animate-pulse" />
    <!-- TASK-175: this box is what a real card's own image placeholder
         looks like the instant it mounts (CollectionGridCardCompact /
         CollectionGridCardFull — bg-primary + centered spinner, see those
         files), not a shimmering bg-silver-5 rectangle. When the real grid
         replaces this skeleton, the image box is now the SAME pixels in
         the SAME position — no visible change of appearance mid-load. -->
    <div class="relative aspect-[3/4] rounded bg-primary mt-1 flex items-center justify-center">
      <div class="w-8 h-8 border-2 border-silver-30 border-t-neon rounded-full animate-spin"></div>
    </div>
    <div class="h-[42px] rounded bg-silver-5 animate-pulse mt-1" />
    <div class="h-[40px] rounded bg-silver-5 animate-pulse mt-1" />
    <div class="h-[48px] rounded bg-silver-5 animate-pulse mt-1" />
    <div class="h-[24px] rounded bg-silver-5 animate-pulse mt-1" />
  </div>
</template>
