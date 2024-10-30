import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL + '/cards/search';

export default {
  searchCards(query) {
    return axios.get(API_URL, {
      params: {
        q: query,
      },
    });
  },
};