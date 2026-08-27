// Prueba en PRODUCCION contra la cuenta qa@ (la del CI), NO la de Rafael.
// Manda la carta PELADA: el escenario del cliente viejo.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });
dotenv.config({ path: '.env.local' });
const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
console.log('proyecto:', process.env.VITE_FIREBASE_PROJECT_ID);
const cred = await signInWithEmailAndPassword(getAuth(app), 'qa@cranialtrading.com', process.env.TEST_USER_A_PASSWORD);
console.log('logueado como', cred.user.email, '| uid', cred.user.uid);
const bulk = httpsCallable(getFunctions(app), 'bulkImportCards');
const carta = {
  scryfallId: '7673784e-db4b-43a1-8d55-1bb9fc1e284f',
  name: 'Lightning Bolt', edition: 'MSC', setCode: 'MSC',
  quantity: 1, condition: 'NM', foil: false, price: 1.5,
  status: 'collection', public: false, language: 'en',
};
const res = await bulk({ cards: [carta] });
console.log('RESULTADO:', JSON.stringify(res.data));
process.exit(0);
