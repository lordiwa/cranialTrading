<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  symbol: string
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small'
})

// Original SVG dimensions and layout
// viewBox: "-945 -210.002 1045 730.002"
// Each symbol is a circle with radius 50 (diameter 100)
const SVG_WIDTH = 1045
const SVG_HEIGHT = 730
const SVG_OFFSET_X = -945  // viewBox x origin
const SVG_OFFSET_Y = -210  // viewBox y origin
const SYMBOL_SIZE = 100    // diameter of each mana symbol

// Size mappings in pixels for display
const sizes = {
  tiny: 16,
  small: 20,
  medium: 24,
  large: 32,
  xl: 48
}

// Symbol positions [cx, cy] in the SVG coordinate system
const symbolPositions: Record<string, [number, number]> = {
  // Row 1: Numbers 0-9 (y=-160)
  '0': [-895, -160],
  '1': [-790, -160],
  '2': [-685, -160],
  '3': [-580, -160],
  '4': [-475, -160],
  '5': [-370, -160],
  '6': [-265, -160],
  '7': [-160, -160],
  '8': [-55, -160],
  '9': [50, -160],

  // Row 2: Numbers 10-19 (y=-55)
  '10': [-895, -55],
  '11': [-790, -55],
  '12': [-685, -55],
  '13': [-580, -55],
  '14': [-475, -55],
  '15': [-370, -55],
  '16': [-265, -55],
  '17': [-160, -55],
  '18': [-55, -55],
  '19': [50, -55],

  // Row 3: Number 20 and mana symbols with icons (y=50)
  '20': [-895, 50],
  'C': [-475, 365],    // Colorless mana diamond (custom added)
  'G': [-55, 50],      // Green mana (tree symbol)
  'R': [-160, 50],     // Red mana (fire symbol)
  'W': [-475, 50],     // White mana (sun symbol)
  'U': [-370, 50],     // Blue mana (water drop)
  'B': [-265, 50],     // Black mana (skull)
  'Y': [-685, 50],     // Y mana (artifact)
  'Z': [-580, 50],     // Z mana
  'X': [-790, 50],     // X mana (variable)

  // Row 4: Hybrid mana (y=155)
  'W/U': [-895, 155],  // White/Blue
  'W/B': [-790, 155],  // White/Black
  'U/B': [-685, 155],  // Blue/Black
  'U/R': [-580, 155],  // Blue/Red
  'B/R': [-475, 155],  // Black/Red
  'B/G': [-370, 155],  // Black/Green
  'R/G': [-265, 155],  // Red/Green
  'R/W': [-160, 155],  // Red/White
  'G/W': [-55, 155],   // Green/White
  'G/U': [50, 155],    // Green/Blue

  // Row 5: Hybrid with colorless (y=260) - left side
  '2/W': [-895, 260],  // 2/White
  '2/U': [-790, 260],  // 2/Blue
  '2/B': [-685, 260],  // 2/Black
  '2/R': [-580, 260],  // 2/Red
  '2/G': [-475, 260],  // 2/Green

  // Pure mana circles (y=260, right side) - no inner symbol
  'G-pure': [50, 260],
  'R-pure': [-55, 260],
  'W-pure': [-160, 260],
  'U-pure': [-265, 260],
  'B-pure': [-370, 260],

  // Row 6: Special symbols (y=365)
  'infinity': [-895, 365], // Infinity symbol
  'T': [-790, 365],        // Tap symbol (black circle)
  'Q': [-685, 365],        // Untap symbol
  'half': [-580, 365],     // Half mana (1/2)
  'E': [-370, 365],        // Energy symbol (diamond with lightning)
  'S': [-265, 365],        // Snow/Chaos mana symbol
}

// Aliases for common notations
const aliases: Record<string, string> = {
  'w': 'W', 'u': 'U', 'b': 'B', 'r': 'R', 'g': 'G',
  'x': 'X', 't': 'T', 'q': 'Q', 'c': 'C', 's': 'S', 'e': 'E',
  'tap': 'T', 'untap': 'Q', 'energy': 'E',
  'white': 'W', 'blue': 'U', 'black': 'B', 'red': 'R', 'green': 'G',
  'colorless': 'C', 'snow': 'S',
  // Hybrid aliases
  'wu': 'W/U', 'uw': 'W/U',
  'wb': 'W/B', 'bw': 'W/B',
  'ub': 'U/B', 'bu': 'U/B',
  'ur': 'U/R', 'ru': 'U/R',
  'br': 'B/R', 'rb': 'B/R',
  'bg': 'B/G', 'gb': 'B/G',
  'rg': 'R/G', 'gr': 'R/G',
  'rw': 'R/W', 'wr': 'R/W',
  'gw': 'G/W', 'wg': 'G/W',
  'gu': 'G/U', 'ug': 'G/U',
}

const normalizedSymbol = computed(() => {
  const s = props.symbol.trim()
  return aliases[s.toLowerCase()] || aliases[s] || s
})

const position = computed(() => {
  const pos = symbolPositions[normalizedSymbol.value]
  if (!pos) {
    return null
  }
  // Convert SVG coordinates to background position
  // The cx,cy is the center of the symbol, we need top-left corner
  const svgX = pos[0] - 50  // top-left x in SVG coords
  const svgY = pos[1] - 50  // top-left y in SVG coords

  // Convert to position relative to viewBox origin
  const posX = svgX - SVG_OFFSET_X
  const posY = svgY - SVG_OFFSET_Y

  return { x: posX, y: posY }
})

const displaySize = computed(() => sizes[props.size])

// Calculate scale factor to fit symbol into display size
const scale = computed(() => displaySize.value / SYMBOL_SIZE)

// Background position (negative because we're offsetting the image)
const backgroundPosition = computed(() => {
  if (!position.value) return '0 0'
  return `-${position.value.x * scale.value}px -${position.value.y * scale.value}px`
})

// Background size (scale the entire SVG)
const backgroundSize = computed(() => {
  return `${SVG_WIDTH * scale.value}px ${SVG_HEIGHT * scale.value}px`
})

const isValid = computed(() => position.value !== null)
</script>

<template>
  <span
    v-if="isValid"
    class="mana-icon inline-block rounded-full"
    :style="{
      width: `${displaySize}px`,
      height: `${displaySize}px`,
      backgroundImage: `url('/Mana.svg')`,
      backgroundPosition: backgroundPosition,
      backgroundSize: backgroundSize,
      backgroundRepeat: 'no-repeat'
    }"
    :title="symbol"
  />
  <span
    v-else
    class="mana-icon-fallback inline-flex items-center justify-center bg-silver-20 text-silver rounded-full"
    :style="{
      width: `${displaySize}px`,
      height: `${displaySize}px`,
      fontSize: `${displaySize * 0.6}px`
    }"
    :title="symbol"
  >
    {{ symbol }}
  </span>
</template>

<style scoped>
.mana-icon {
  vertical-align: middle;
  flex-shrink: 0;
}

.mana-icon-fallback {
  vertical-align: middle;
  flex-shrink: 0;
  font-weight: bold;
  line-height: 1;
}
</style>
