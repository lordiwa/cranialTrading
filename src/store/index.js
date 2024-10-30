import { reactive } from 'vue';
import Card from '../models/Card';

const state = reactive({
  cards: [],
});

const addCard = (card) => {
  state.cards.push(card);
};

export default {
  state,
  addCard,
};