import { loadBuildPublicCardDoc } from '../scripts/lib/loadBuildPublicCardDoc.mjs'
const buildPublicCardDoc = await loadBuildPublicCardDoc()
const card = {
  id: 'abc123',
  scryfallId: 'scry-1',
  name: 'Lightning Bolt',
  edition: 'LEA',
  setCode: 'LEA',
  quantity: 1,
  condition: 'NM',
  foil: false,
  price: 0,
  image: '/img/thumb/front/scry-1.webp',
  status: 'sale',
  public: true,
  updatedAt: new Date(),
}
const doc = buildPublicCardDoc(card, 'uid1', 'qa_mtg', 'Quito, Ecuador', null)
console.log(JSON.stringify(doc, (k, v) => (v && v.toDate ? v.toDate().toISOString() : v), 2))
console.log('toDate works:', doc.updatedAt.toDate() instanceof Date, doc.updatedAt.toDate().toISOString())
