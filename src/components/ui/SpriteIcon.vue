<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  name: string
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'xl'
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small'
})

// Sprite grid: 7 columns x 4 rows
// Optimized spritesheet: 1344x768px with 192x192px cells
const CELL_SIZE = 192
const SPRITE_WIDTH = 1344
const SPRITE_HEIGHT = 768

// Icon positions mapping [row, col] (0-indexed)
const iconPositions: Record<string, [number, number]> = {
  // Row 1
  'search': [0, 0],           // Magnifying Glass with Gear
  'collection': [0, 1],       // Open Books with Runes
  'star': [0, 2],             // Geometric Star
  'chat': [0, 3],             // Circuit Board Speech Bubble
  'user': [0, 4],             // Armored Knight Bust
  'user-alt': [0, 5],         // Cyborg Bust
  'settings': [0, 6],         // Gear

  // Row 2
  'check': [1, 0],            // Bone Checkmark
  'x-mark': [1, 1],           // Crossed Swords/X-Mark
  'money': [1, 2],            // Money Bag with Dollar Sign
  'trash': [1, 3],            // Trash Bin with Monster Hand
  'recover': [1, 4],          // Circular Arrow with Dots
  'flip': [1, 5],             // Refresh Arrows
  'edit': [1, 6],             // Glowing Pen

  // Row 3
  'eye-open': [2, 0],         // Eye with Shutter
  'eye-closed': [2, 1],       // Eye with Line and Padlock
  'dot': [2, 2],              // Glowing Circle Target
  'loading': [2, 3],          // Hourglass with Gears
  'dagger': [2, 4],           // Dagger
  'card-gear': [2, 5],        // Credit Card with Gear
  'hand': [2, 6],             // Hand with Three Fingers

  // Row 4
  'box': [3, 0],              // Open Box with Files
  'handshake': [3, 1],        // Robot Handshake
  'lock': [3, 2],             // Padlock
  'fire': [3, 3],             // Flame with Circuit
  'warning': [3, 4],          // Warning Triangle with Spikes
  'folder': [3, 5],           // Folder with Skull
}

// Size mappings in pixels
// Optimized for 192px source cells (2x for retina at 96px max)
// Increased minimum sizes for better scaling quality
const sizes = {
  tiny: 24,    // was 20 - increased for better scaling
  small: 32,   // was 28 - increased for better scaling
  medium: 48,  // was 40 - better ratio with 192px source
  large: 64,   // was 56 - cleaner division of 192
  xl: 96       // was 80 - exact 2x scale from 192px
}

const getPosition = (name: string) => {
  const pos = iconPositions[name]
  if (!pos) return { x: 0, y: 0 }
  return {
    x: pos[1] * CELL_SIZE,
    y: pos[0] * CELL_SIZE
  }
}

const position = computed(() => getPosition(props.name))
const displaySize = computed(() => sizes[props.size])
const scale = computed(() => displaySize.value / CELL_SIZE)
</script>

<template>
  <span
    class="sprite-icon inline-block"
    :class="[props.class, `sprite-${props.size}`]"
    :style="{
      width: `${displaySize}px`,
      height: `${displaySize}px`,
      backgroundImage: `url('/icons.png')`,
      backgroundPosition: `-${position.x * scale}px -${position.y * scale}px`,
      backgroundSize: `${SPRITE_WIDTH * scale}px ${SPRITE_HEIGHT * scale}px`,
      backgroundRepeat: 'no-repeat'
    }"
  />
</template>

<style scoped>
.sprite-icon {
  vertical-align: middle;
  flex-shrink: 0;
  /* Use high-quality scaling for smooth icons */
  image-rendering: -webkit-optimize-contrast;
  image-rendering: smooth;
  /* Slight sharpening filter for small sizes */
  filter: contrast(1.02);
}

/* For very small icons, use crisp rendering */
.sprite-icon.sprite-tiny,
.sprite-icon.sprite-small {
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
  filter: contrast(1.05) brightness(1.02);
}

/* Higher quality rendering on high-DPI screens */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
  .sprite-icon {
    image-rendering: auto;
    filter: none;
  }

  .sprite-icon.sprite-tiny,
  .sprite-icon.sprite-small {
    image-rendering: auto;
    filter: contrast(1.02);
  }
}
</style>
