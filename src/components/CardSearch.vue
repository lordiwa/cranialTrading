<template>
  <div>
    <h2>Search Cards</h2>
    <form @submit.prevent="search">
      <input v-model="query" @input="fetchSuggestions" placeholder="Search for cards" required />
      <button type="submit">Search</button>
    </form>
    <div v-if="suggestions.length">
      <h3>Suggestions</h3>
      <ul>
        <li v-for="suggestion in suggestions" :key="suggestion.id" @click="selectSuggestion(suggestion)">
          {{ suggestion.name }}
          <img :src="suggestion.image_uris?.small" :alt="suggestion.name" v-if="suggestion.image_uris?.small" />
        </li>
      </ul>
    </div>
    <div class="lists-container">
      <div class="list-column">
        <h3>My Collection</h3>
        <ul>
          <li v-for="card in myCollection" :key="card.id">
            <div class="tooltip">
              {{ card.name }} - {{ card.set_name }}
              <span class="tooltiptext">
                <img :src="card.image_uris?.normal" :alt="card.name" v-if="card.image_uris?.normal" />
              </span>
            </div>
            <input type="number" v-model.number="card.amount" min="1" max="999" style="width: 50px;" />
          </li>
        </ul>
        <textarea v-model="myCollectionList" placeholder="Enter card list here" rows="10" cols="50"></textarea>
        <button @click="addCardsFromList('myCollection', myCollectionList)">Add Cards</button>
      </div>
      <div class="list-column">
        <h3>Looking For</h3>
        <ul>
          <li v-for="card in lookingFor" :key="card.id">
            <div class="tooltip">
              {{ card.name }} - {{ card.set_name }}
              <span class="tooltiptext">
                <img :src="card.image_uris?.normal" :alt="card.name" v-if="card.image_uris?.normal" />
              </span>
            </div>
            <input type="number" v-model.number="card.amount" min="1" max="999" style="width: 50px;" />
          </li>
        </ul>
        <textarea v-model="lookingForList" placeholder="Enter card list here" rows="10" cols="50"></textarea>
        <button @click="addCardsFromList('lookingFor', lookingForList)">Add Cards</button>
      </div>
      <div class="list-column">
        <h3>Friends List</h3>
        <ul>
          <li v-for="card in friendsList" :key="card.id">
            <div class="tooltip">
              {{ card.name }} - {{ card.set_name }}
              <span class="tooltiptext">
                <img :src="card.image_uris?.normal" :alt="card.name" v-if="card.image_uris?.normal" />
              </span>
            </div>
            <input type="number" v-model.number="card.amount" min="1" max="999" style="width: 50px;" />
          </li>
        </ul>
        <textarea v-model="friendsListList" placeholder="Enter card list here" rows="10" cols="50"></textarea>
        <button @click="addCardsFromList('friendsList', friendsListList)">Add Cards</button>
      </div>
    </div>
    <CompareLists :lookingFor="lookingFor" :friendsList="friendsList" />
  </div>
</template>

<script>
import { debounce } from 'lodash';
import CardService from '../services/CardService';
import CompareLists from './CompareLists.vue';

export default {
  components: {
    CompareLists,
  },
  data() {
    return {
      query: '',
      cards: [],
      suggestions: [],
      myCollection: [],
      lookingFor: [],
      friendsList: [],
      myCollectionList: '',
      lookingForList: '',
      friendsListList: '',
    };
  },
  methods: {
    async search() {
      try {
        const response = await CardService.searchCards(this.query);
        this.cards = response.data.data;
      } catch (error) {
        console.error('Error searching for cards:', error);
      }
    },
    fetchSuggestions: debounce(async function () {
      if (this.query.length < 3) {
        this.suggestions = [];
        return;
      }
      try {
        const response = await CardService.searchCards(this.query);
        this.suggestions = response.data.data;
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      }
    }, 300),
    selectSuggestion(suggestion) {
      this.query = suggestion.name;
      this.suggestions = [];
      this.search();
    },
    async addCardsFromList(listName, cardList) {
      this[listName] = []; // Clear the list before adding new cards
      const lines = cardList.split('\n');
      for (const line of lines) {
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (match) {
          const amount = parseInt(match[1], 10);
          const name = match[2];
          try {
            const response = await CardService.searchCards(name);
            const cardData = response.data.data[0];
            if (cardData) {
              this[listName].push({
                name: cardData.name,
                amount,
                image_uris: cardData.image_uris,
                set_name: cardData.set_name,
              });
            }
          } catch (error) {
            console.error('Error fetching card details:', error);
          }
        }
      }
    }
  }
};
</script>

<style>
.lists-container {
  display: flex;
  justify-content: space-between;
}

.list-column {
  flex: 1;
  margin: 0 10px;
}

.tooltip {
  position: relative;
  display: inline-block;
}

.tooltip .tooltiptext {
  visibility: hidden;
  width: 75px;
  height: auto;
  background-color: #fff;
  border: 1px solid #ccc;
  padding: 5px;
  position: absolute;
  z-index: 1;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
}

.tooltip:hover .tooltiptext {
  visibility: visible;
}
</style>