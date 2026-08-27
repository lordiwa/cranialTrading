import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'vig');
const db = getFirestore(app);
const SELLER = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const meta = await db.collection('users').doc(SELLER).collection('public_card_index').doc('_meta').get();
const m = meta.data() || {};
const pub = await db.collection('users').doc(SELLER).collection('cards').where('public','==',true).count().get();
console.log(JSON.stringify({ count: m.count, totalChunks: m.totalChunks, docs: pub.data().count }));
