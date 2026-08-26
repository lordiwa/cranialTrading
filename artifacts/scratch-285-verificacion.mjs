import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'v'+Date.now());
const db = getFirestore(app);
const uid = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const ref = db.collection('users').doc(uid);
const objetivo = ['Lightning Bolt','Counterspell','Llanowar Elves'];

console.log('--- DOCUMENTOS DE CARTA recien creados ---');
for (const n of objetivo) {
  const q = await ref.collection('cards').where('name','==',n).get();
  for (const d of q.docs) {
    const c = d.data();
    console.log(`${n} [${d.id}] set=${c.setCode} | type_line=${JSON.stringify(c.type_line)} | colors=${JSON.stringify(c.colors)} | rarity=${JSON.stringify(c.rarity)} | cmc=${JSON.stringify(c.cmc)} | price=${c.price}`);
  }
}

console.log('\n--- ENTRADAS DE INDICE ---');
const idx = await ref.collection('card_index').get();
let total=0, vacias=0;
for (const c of idx.docs) for (const e of (c.data().cards ?? [])) {
  total++;
  if (!e.t) vacias++;
  if (objetivo.includes(e.n)) console.log(`${e.n} -> t=${JSON.stringify(e.t)} | co=${JSON.stringify(e.co)} | r=${JSON.stringify(e.r)} | cm=${e.cm} | sc=${e.sc} | p=${e.p}`);
}
console.log(`\nTOTAL entradas: ${total} | sin type_line: ${vacias}`);
console.log('SCRYFALL_CACHE de esos ids:');
for (const id of ['7673784e-db4b-43a1-8d55-1bb9fc1e284f','4f616706-ec97-4923-bb1e-11a69fbaa1f8','6a0b230b-d391-4998-a3f7-7b158a0ec2cd']) {
  const d = await db.collection('scryfall_cache').doc(id).get();
  console.log(' ', id, d.exists ? `EXISTE type_line=${JSON.stringify(d.get('type_line'))}` : 'NO EXISTE');
}
process.exit(0);
