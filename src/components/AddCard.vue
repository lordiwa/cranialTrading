<template>
  <div>
    <h2>Add Card</h2>
    <form @submit.prevent="addCard">
      <input v-model="name" placeholder="Card Name" required />
      <input v-model="set" placeholder="Set" required />
      <input v-model="rarity" placeholder="Rarity" required />
      <select v-model="status">
        <option value="collection">Collection</option>
        <option value="trading">Trading</option>
        <option value="sharing">Sharing</option>
        <option value="lookingFor">Looking For</option>
      </select>
      <button type="submit">Add Card</button>
    </form>
  </div>
</template>

<script>
import Card from '../models/Card';

export default {
  data() {
    return {
      name: '',
      set: '',
      rarity: '',
      status: 'collection',
    };
  },
  methods: {
    addCard() {
      const newCard = new Card(Date.now(), this.name, this.set, this.rarity, this.status);
      this.$emit('add-card', newCard);
      this.name = '';
      this.set = '';
      this.rarity = '';
      this.status = 'collection';
    },
  },
};
</script>