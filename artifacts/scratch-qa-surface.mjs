import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'qs');
const db = getFirestore(app);
const QA = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const ref = db.collection('users').doc(QA);
console.log('subcolecciones de la cuenta de QA:');
for (const c of await ref.listCollections()) {
  console.log('  ' + c.id + ':', (await c.count().get()).data().count);
}
const wl = await ref.collection('cards').where('status','==','wishlist').get();
console.log('\nwishlist:');
for (const d of wl.docs) console.log('  ', d.id, '|', d.get('name'), '| qty', d.get('quantity'), '| createdAt', d.get('createdAt')?.toDate?.().toISOString());
const decks = await ref.collection('decks').get();
console.log('\nmazos:');
for (const d of decks.docs) console.log('  ', d.id, '|', JSON.stringify(d.get('name')), '| createdAt', d.get('createdAt')?.toDate?.().toISOString?.() ?? d.get('createdAt'));
const binders = await ref.collection('binders').get();
console.log('\ncarpetas:');
for (const d of binders.docs) console.log('  ', d.id, '|', JSON.stringify(d.get('name')));
process.exit(0);
