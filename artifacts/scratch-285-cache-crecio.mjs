import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'cc'+Date.now());
const db = getFirestore(app);
const total = await db.collection('scryfall_cache').count().get();
console.log('scryfall_cache AHORA:', total.data().count, '(antes del import: 1501)');
const recientes = await db.collection('scryfall_cache').where('_cachedAt','>=', new Date(Date.now()-3*3600*1000)).count().get();
console.log('escritos en las ultimas 3 horas:', recientes.data().count);
