// El caso que reporto Rafael: una tierra de tipo multiple bajo el chip `land`.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClient } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' }); dotenv.config({ path: '.env.local' });
const SELLER = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const P = ['creature','instant','sorcery','enchantment','artifact','planeswalker','land'];
const admin = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'tp');
const db = getFirestore(admin);
const chunks = await db.collection('users').doc(SELLER).collection('public_card_index').get();
let entries = [];
for (const c of chunks.docs) { const d = c.data(); if (Array.isArray(d.entries)) entries = entries.concat(d.entries); }
const tierrasMulti = entries.filter(e => { const t = String(e.t||'').toLowerCase(); return t.includes('land') && P.filter(w=>t.includes(w)).length > 1; });
console.log('tierras de tipo MULTIPLE en el indice:', tierrasMulti.length);
for (const t of tierrasMulti.slice(0,5)) console.log('  -', JSON.stringify(t.n), '|', JSON.stringify(t.t));
if (!tierrasMulti.length) { console.log('no hay ninguna publicada en dev; el caso queda cubierto por Prototype X-8 (artifact+creature)'); process.exit(0); }
const app = initClient({ apiKey: process.env.VITE_FIREBASE_API_KEY, authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: process.env.VITE_FIREBASE_PROJECT_ID, appId: process.env.VITE_FIREBASE_APP_ID });
await signInWithEmailAndPassword(getAuth(app), process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
const q = httpsCallable(getFunctions(app), 'queryPublicCardIndex');
const carta = tierrasMulti[0];
const t = String(carta.t||'').toLowerCase();
const cats = P.filter(w => t.includes(w));
for (const c of cats) {
  const r = await q({ userId: SELLER, filters: { type: [c], search: carta.n }, page: 0, pageSize: 50 });
  console.log('  type=[' + c + '] -> total=' + (r.data||{}).total);
}
console.log('ESPERADO: total=1 en TODAS sus categorias, incluida land.');
process.exit(0);
