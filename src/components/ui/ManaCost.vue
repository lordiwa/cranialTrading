<script setup lang="ts">
import { computed } from 'vue'
import ManaIcon from './ManaIcon.vue'

interface Props {
  cost: string  // e.g., "{2}{W}{U}" or "2WU"
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small'
})

// Parse mana cost string into array of symbols
const symbols = computed(() => {
  if (!props.cost) return []

  const result: string[] = []
  const cost = props.cost.trim()

  // Match {X}, {2/W}, {W/U}, {W}, {10}, etc. or bare symbols like 2WU
  const bracketPattern = /\{([^}]+)\}/g
  let match
  let lastIndex = 0

  while ((match = bracketPattern.exec(cost)) !== null) {
    // Check for any bare symbols before this match
    if (match.index > lastIndex) {
      const bare = cost.slice(lastIndex, match.index)
      result.push(...parseBareSymbols(bare))
    }
    const symbol = match[1]
    if (symbol) result.push(symbol)
    lastIndex = bracketPattern.lastIndex
  }

  // Check for any remaining bare symbols after last match
  if (lastIndex < cost.length) {
    const bare = cost.slice(lastIndex)
    result.push(...parseBareSymbols(bare))
  }

  // If no brackets were found, try parsing as bare symbols
  if (result.length === 0 && cost.length > 0) {
    result.push(...parseBareSymbols(cost))
  }

  return result
})

// Parse bare mana symbols like "2WU" or "3GGR"
function parseBareSymbols(str: string): string[] {
  const result: string[] = []
  let i = 0

  while (i < str.length) {
    const char = str[i]
    if (!char) break

    // Check for multi-digit numbers (10, 11, etc.)
    if (/\d/.test(char)) {
      let num = ''
      while (i < str.length) {
        const digit = str[i]
        if (!digit || !/\d/.test(digit)) break
        num += digit
        i++
      }
      result.push(num)
    }
    // Check for letter symbols (W, U, B, R, G, X, C, S, T, Q)
    else if (/[WUBRGXCSTQ]/i.test(char)) {
      result.push(char.toUpperCase())
      i++
    }
    // Skip unknown characters
    else {
      i++
    }
  }

  return result
}
</script>

<template>
  <span class="mana-cost inline-flex items-center gap-0.5">
    <ManaIcon
      v-for="(symbol, index) in symbols"
      :key="`${symbol}-${index}`"
      :symbol="symbol"
      :size="size"
    />
    <span v-if="symbols.length === 0 && cost" class="text-silver-50 text-tiny">
      {{ cost }}
    </span>
  </span>
</template>

<style scoped>
.mana-cost {
  vertical-align: middle;
}
</style>
