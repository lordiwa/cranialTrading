import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'pc');
const db = getFirestore(app);
const pc = await db.collection('public_cards').count().get();
console.log('/public_cards:', pc.data().count);
const users = await db.collection('users').get();
for (const u of users.docs) {
  const cards = u.ref.collection('cards');
  const total = (await cards.count().get()).data().count;
  console.log('users/' + u.id + '/cards:', total);
  for (const st of ['sale','trade','collection','wishlist']) {
    const n = (await cards.where('status','==',st).count().get()).data().count;
    console.log('   status=' + st + ':', n);
  }
  const sample = await cards.where('status','==','sale').limit(1).get();
  if (!sample.empty) {
    const d = sample.docs[0].data();
    console.log('   muestra sale -> campos:', Object.keys(d).sort().join(','));
  }
  const pci = (await u.ref.collection('public_card_index').count().get()).data().count;
  console.log('   public_card_index chunks:', pci);
}
process.exit(0);
