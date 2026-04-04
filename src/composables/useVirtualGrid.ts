import { computed, onMounted, onUnmounted, ref, type Ref, watch } from 'vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'

/**
 * Chunk a flat array of items into rows of `columns` items each.
 * Exported for unit testing.
 */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  if (items.length === 0) return []
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns))
  }
  return rows
}

/** Tailwind breakpoint widths in px */
const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 }

function getColumnCount(width: number, compact: boolean): number {
  if (compact) {
    // grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6
    if (width >= BREAKPOINTS.xl) return 6
    if (width >= BREAKPOINTS.lg) return 5
    if (width >= BREAKPOINTS.md) return 3
    return 2
  }
  // grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5
  if (width >= BREAKPOINTS.xl) return 5
  if (width >= BREAKPOINTS.lg) return 4
  if (width >= BREAKPOINTS.md) return 3
  return 2
}

export interface VirtualGridOptions<T> {
  items: Ref<T[]>
  compact?: Ref<boolean>
  /** Estimated row height in px — full ~480, compact ~300 */
  estimateRowHeight?: number
  /** Extra overscan rows rendered off-screen */
  overscan?: number
  /** Custom column count calculator — overrides default Tailwind grid logic */
  getColumns?: (containerWidth: number) => number
}

export function useVirtualGrid<T>(options: VirtualGridOptions<T>) {
  const containerRef = ref<HTMLElement | null>(null)
  const columnCount = ref(2)
  const scrollMargin = ref(0)
  const compact = options.compact ?? ref(false)

  const rows = computed(() => chunkIntoRows(options.items.value, columnCount.value))

  const virtualizer = useWindowVirtualizer(computed(() => ({
    count: rows.value.length,
    estimateSize: () => options.estimateRowHeight ?? (compact.value ? 300 : 480),
    overscan: options.overscan ?? 3,
    scrollMargin: scrollMargin.value,
  })))

  const virtualRows = computed(() => {
    const margin = scrollMargin.value
    return virtualizer.value.getVirtualItems().map(vItem => ({
      index: vItem.index,
      // Subtract scrollMargin so position is relative to the container, not the page
      start: vItem.start - margin,
      size: vItem.size,
      items: rows.value[vItem.index] ?? [],
    }))
  })

  const totalSize = computed(() => virtualizer.value.getTotalSize())

  // ResizeObserver to track container width for column count
  let resizeObserver: ResizeObserver | null = null

  const updateLayout = () => {
    if (containerRef.value) {
      // Custom getColumns uses container width (for flex-wrap layouts with fixed card widths)
      // Default getColumnCount uses viewport width (matches Tailwind media query breakpoints)
      const width = options.getColumns
        ? containerRef.value.clientWidth
        : window.innerWidth
      columnCount.value = options.getColumns
        ? options.getColumns(width)
        : getColumnCount(width, compact.value)
      scrollMargin.value = containerRef.value.offsetTop
    }
  }

  const setupObserver = (el: HTMLElement) => {
    if (resizeObserver) resizeObserver.disconnect()
    resizeObserver = new ResizeObserver(() => {
      const prevCols = columnCount.value
      updateLayout()
      if (prevCols !== columnCount.value) {
        virtualizer.value.measure()
      }
    })
    resizeObserver.observe(el)
  }

  onMounted(() => {
    updateLayout()
    if (containerRef.value) setupObserver(containerRef.value)
  })

  // Handle late-mount: container inside v-if/v-else-if may appear after onMounted
  watch(containerRef, (el) => {
    if (el) {
      updateLayout()
      setupObserver(el)
    }
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
  })

  // Scroll to top when items change (filter/sort)
  watch(() => options.items.value.length, () => {
    virtualizer.value.scrollToOffset(0)
  })

  return {
    containerRef,
    columnCount,
    rows,
    virtualRows,
    totalSize,
    virtualizer,
  }
}
