<template>
  <div>
    <h2>Card List</h2>
    <ul>
      <li v-for="card in cards" :key="card.id">
        {{ card.name }} - {{ card.set }} - {{ card.rarity }} - {{ card.status }}
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  props: {
    cards: Array,
  },
};
</script>