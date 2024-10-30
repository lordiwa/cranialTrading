export default class Card {
  constructor(id, name, set, rarity, status) {
    this.id = id;
    this.name = name;
    this.set = set;
    this.rarity = rarity;
    this.status = status; // e.g., 'collection', 'trading', 'sharing', 'lookingFor'
  }
}