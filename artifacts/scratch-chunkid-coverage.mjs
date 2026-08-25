import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'ck');
const db = getFirestore(app);
const all = await db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1').collection('cards').get();
let con = 0, sin = 0; const porChunk = new Map();
for (const d of all.docs) {
  const c = d.get('chunkId');
  if (c === undefined || c === null) sin++; else { con++; porChunk.set(c, (porChunk.get(c) ?? 0) + 1); }
}
console.log('docs:', all.size, '| CON chunkId:', con, '| SIN chunkId:', sin, '=', (sin/all.size*100).toFixed(1) + '%');
console.log('distribucion por chunkId:', [...porChunk.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>k+':'+v).join(' '));
process.exit(0);
