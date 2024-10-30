<template>
  <div>
    <h2>Coincidences</h2>
    <ul>
      <li v-for="card in coincidences" :key="card.id">
        {{ card.name }} - {{ card.set_name }} - Amount: {{ card.amount }}
        <img :src="card.image_uris?.small" :alt="card.name" v-if="card.image_uris?.small" />
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  props: {
    lookingFor: Array,
    friendsList: Array,
  },
  computed: {
    coincidences() {
      return this.lookingFor.filter(lookingForCard => {
        const friendCard = this.friendsList.find(friendCard => friendCard.name === lookingForCard.name);
        return friendCard && friendCard.amount >= lookingForCard.amount;
      });
    }
  }
};
</script>

<style scoped>
ul {
  list-style-type: none;
  padding: 0;
}

li {
  margin: 10px 0;
}

img {
  margin-left: 10px;
  width: 50px;
  height: auto;
}
</style>