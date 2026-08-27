// Simula un CLIENTE VIEJO: manda la carta PELADA, sin type_line/colors/rarity/cmc
// y sin _cacheFields. Es exactamente lo que llego en produccion el 2026-08-26.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });
dotenv.config({ path: '.env.local' });

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const cred = await signInWithEmailAndPassword(getAuth(app), process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
console.log('logueado como', cred.user.email, '| proyecto', process.env.VITE_FIREBASE_PROJECT_ID);

const bulk = httpsCallable(getFunctions(app), 'bulkImportCards');
// Sin type_line, sin colors, sin rarity, sin cmc, sin _cacheFields. Pelada.
const carta = {
  scryfallId: '7673784e-db4b-43a1-8d55-1bb9fc1e284f', // Lightning Bolt MSC
  name: 'Lightning Bolt', edition: 'MSC', setCode: 'MSC',
  quantity: 1, condition: 'NM', foil: false, price: 1.5,
  status: 'collection', public: false, language: 'en',
};
const t0 = Date.now();
const res = await bulk({ cards: [carta] });
console.log('respuesta en', Date.now()-t0, 'ms:', JSON.stringify(res.data));
process.exit(0);
