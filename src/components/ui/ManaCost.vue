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

  // Parse {X}, {2/W}, {W/U}, {W}, {10}, etc. or bare symbols like 2WU
  let i = 0
  while (i < cost.length) {
    if (cost[i] === '{') {
      const end = cost.indexOf('}', i + 1)
      if (end !== -1) {
        const symbol = cost.slice(i + 1, end)
        if (symbol) result.push(symbol)
        i = end + 1
      } else {
        result.push(...parseBareSymbols(cost.slice(i + 1)))
        break
      }
    } else {
      const nextBrace = cost.indexOf('{', i)
      const bare = nextBrace === -1 ? cost.slice(i) : cost.slice(i, nextBrace)
      result.push(...parseBareSymbols(bare))
      if (nextBrace === -1) break
      i = nextBrace
    }
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
