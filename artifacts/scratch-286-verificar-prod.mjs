import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'vp'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('DzcVxjNKI9VbeZv8NNnCYyPfBfO2');
const d = await ref.collection('cards').doc('8rnoy0kLuFDI4qW0zJh1').get();
const c = d.data();
console.log('EN PRODUCCION, carta escrita por el servidor desde un payload PELADO:');
console.log('  type_line:', JSON.stringify(c.type_line), '| colors:', JSON.stringify(c.colors), '| rarity:', JSON.stringify(c.rarity), '| cmc:', JSON.stringify(c.cmc));
console.log('  power presente?', 'power' in c, '| foil:', JSON.stringify(c.foil), '| price:', JSON.stringify(c.price));
// LIMPIEZA
await ref.collection('cards').doc('8rnoy0kLuFDI4qW0zJh1').delete();
const n = await ref.collection('cards').count().get();
console.log('\nborrada la carta de prueba. Cartas en la cuenta qa@ de prod:', n.data().count, '(tiene que quedar >= 1 para el gate de CI)');
