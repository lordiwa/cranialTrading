import { onMounted, onUnmounted } from 'vue';

export function useScrollReveal(selector = '.scroll-reveal') {
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll(selector).forEach((el) => { observer?.observe(el); });
  });

  onUnmounted(() => observer?.disconnect());
}
