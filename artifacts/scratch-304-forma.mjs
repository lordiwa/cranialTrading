// TASK-304 AC1 (cont.) — la FORMA real de un documento en cada una de las tres
// colecciones. Se descubre leyendo, no suponiendo: el paso anterior midio
// paridad de conteo perfecta (2202/2202/2202) pero CERO coincidencias por
// nombre entre cards y public_cards, lo que solo puede significar que los
// documentos no tienen la forma que se daba por sentada.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const UID = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 't304f');
const db = getFirestore(app);

const c = await db.collection('users').doc(UID).collection('cards').limit(2).get();
console.log('=== users/{uid}/cards — doc completo ===');
c.docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 1)));

const p = await db.collection('public_cards').where('userId','==',UID).limit(2).get();
console.log('\n=== public_cards (RAIZ) — doc completo ===');
p.docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 1)));

const i = await db.collection('users').doc(UID).collection('public_card_index').get();
console.log('\n=== public_card_index — ids de los docs ===');
console.log(i.docs.map(d => d.id).join(', '));
const chunk = i.docs.find(d => d.id !== '_meta');
const cd = chunk.data();
console.log('\nclaves del chunk:', Object.keys(cd).join(', '));
for (const [k,v] of Object.entries(cd)) {
  if (Array.isArray(v)) { console.log(`\nchunk.${k} es array de ${v.length}; primera entrada:`); console.log(JSON.stringify(v[0], null, 1)); }
  else console.log(`chunk.${k} =`, typeof v === 'object' ? JSON.stringify(v).slice(0,200) : v);
}
console.log('\n_meta:', JSON.stringify(i.docs.find(d=>d.id==='_meta')?.data(), null, 1));
