import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.development' });

const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'audit');
const uid = (await getAuth(app).getUserByEmail(process.env.TEST_USER_A_EMAIL)).uid;
const db = getFirestore(app);

const [cards, idx, marker] = await Promise.all([
  db.collection(`users/${uid}/cards`).select('quantity', 'name').get(),
  db.collection(`users/${uid}/card_index`).get(),
  db.collection(`users/${uid}/e2e_teardown_state`).get(),
]);

const docQ = {}, docN = {};
cards.docs.forEach((d) => { docQ[d.id] = Number(d.get('quantity') ?? 0); docN[d.id] = String(d.get('name') ?? ''); });

const idxQ = {}, seen = new Set(), dup = new Set();
let entries = 0, countSum = 0;
idx.forEach((c) => {
  countSum += Number(c.data().count ?? 0);
  for (const e of c.data().cards ?? []) {
    entries++;
    if (seen.has(e.i)) dup.add(e.i); else seen.add(e.i);
    idxQ[e.i] = Number(e.q ?? 0);
  }
});

const divergent = Object.keys(idxQ).filter((id) => id in docQ && idxQ[id] !== docQ[id]);
const phantoms = Object.keys(idxQ).filter((id) => !(id in docQ));
const watch = ['fbnYzD8hkYHDZk4Y0maa', 't5lRJt27vmvh2gbj4KHe', '0kajFWujShPA7iaQuBer', '1hLdVUWmXyIlPljBcv48'];

console.log(`docs=${cards.size} entries=${entries} chunks=${idx.size} countSum=${countSum} divergent=${divergent.length} phantoms=${phantoms.length} duplicates=${dup.size} markers=${marker.size}`);
if (divergent.length) console.log('DIVERGENT:', divergent.map((id) => `${id} ${docN[id]} doc=${docQ[id]} idx=${idxQ[id]}`).join(' | '));
if (phantoms.length) console.log('PHANTOMS:', phantoms.join(', '));
for (const id of watch) console.log(`  ${id} name="${docN[id] ?? '<no doc>'}" doc=${docQ[id] ?? '-'} idx=${idxQ[id] ?? '<none>'}`);
const fixtures = Object.keys(docN).filter((id) => docN[id].startsWith('ZZZ E2E Teardown'));
console.log('fixture docs left:', fixtures.length ? fixtures.join(', ') : 'none');
process.exit(0);
