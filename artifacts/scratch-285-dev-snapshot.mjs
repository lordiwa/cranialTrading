import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'dev'+Date.now());
const db = getFirestore(app);
const u = await getAuth(app).getUserByEmail('qa@cranialtrading.com');
console.log('uid qa@ en dev:', u.uid);
const ref = db.collection('users').doc(u.uid);
const cards = await ref.collection('cards').get();
console.log('DOCS de carta:', cards.size);
const idx = await ref.collection('card_index').get();
let total=0, conTipo=0, conColor=0, conRareza=0;
const detalle=[];
for (const c of idx.docs) for (const e of (c.data().cards ?? [])) {
  total++; if (e.t) conTipo++; if (Array.isArray(e.co) && e.co.length) conColor++; if (e.r) conRareza++;
  detalle.push({n:e.n, t:e.t, co:e.co, r:e.r, cm:e.cm, sc:e.sc});
}
console.log('ENTRADAS de indice:', total, '| con type_line:', conTipo, '| con colors:', conColor, '| con rarity:', conRareza);
console.log(JSON.stringify(detalle.slice(0,12), null, 1));
process.exit(0);
