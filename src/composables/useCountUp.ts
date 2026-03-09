import { ref, onUnmounted, type Ref } from 'vue';

export function useCountUp(target: Ref<number>, duration = 1500) {
  const display = ref(0);
  let animationId = 0;

  function start() {
    const end = target.value;
    if (end <= 0) { display.value = 0; return; }
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      display.value = Math.round(eased * end);
      if (progress < 1) {
        animationId = requestAnimationFrame(tick);
      }
    }

    animationId = requestAnimationFrame(tick);
  }

  onUnmounted(() => cancelAnimationFrame(animationId));

  return { display, start };
}
