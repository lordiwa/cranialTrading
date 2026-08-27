import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'vd'+Date.now());
const db = getFirestore(app);
const id = process.argv[2];
const d = await db.collection('users').doc('90PkdmyFKrVm1RLDXjInJdlYXy73').collection('cards').doc(id).get();
if (!d.exists) { console.log('NO EXISTE'); process.exit(1); }
const c = d.data();
console.log('DOCUMENTO ESCRITO POR EL SERVIDOR (cliente mando la carta PELADA):');
console.log('  name      :', c.name);
console.log('  type_line :', JSON.stringify(c.type_line));
console.log('  colors    :', JSON.stringify(c.colors));
console.log('  rarity    :', JSON.stringify(c.rarity));
console.log('  cmc       :', JSON.stringify(c.cmc));
console.log('  power     :', 'power' in c ? JSON.stringify(c.power) : '(ausente, correcto)');
console.log('  toughness :', 'toughness' in c ? JSON.stringify(c.toughness) : '(ausente, correcto)');
console.log('  foil      :', JSON.stringify(c.foil), '| price:', JSON.stringify(c.price), '| quantity:', JSON.stringify(c.quantity));
console.log('  claves    :', Object.keys(c).sort().join(', '));
