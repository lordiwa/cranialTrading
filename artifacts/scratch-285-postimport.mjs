import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'pi'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1');
const snap = await ref.collection('cards').get();
let total=0, conTipo=0, conColor=0, conRareza=0, conCmc=0, sinId=0;
const buckets = new Map();
for (const d of snap.docs) {
  const c = d.data(); total++;
  if (c.type_line) conTipo++;
  if (Array.isArray(c.colors)) conColor++;
  if (c.rarity) conRareza++;
  if (typeof c.cmc === 'number') conCmc++;
  if (!c.scryfallId) sinId++;
  const ms = c.createdAt?.toMillis?.() ?? 0;
  const k = new Date(Math.floor(ms/60000)*60000).toISOString().slice(11,16);
  const b = buckets.get(k) ?? {n:0, t:0}; b.n++; if (c.type_line) b.t++; buckets.set(k,b);
}
console.log('DOCS DE CARTA:', total);
console.log('  con type_line:', conTipo, '| con colors:', conColor, '| con rarity:', conRareza, '| con cmc:', conCmc, '| SIN scryfallId:', sinId);
console.log('\nPOR MINUTO DE CREACION (n = creadas, t = con type_line):');
for (const [k,v] of [...buckets.entries()].sort()) console.log(`  ${k}  n=${v.n}  t=${v.t}`);
