import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'ps');
const db = getFirestore(app);
for (const c of ['users','usernames','public_cards','contact_info','market_data','public_preferences','conversations']) {
  try { console.log(c + ':', (await db.collection(c).count().get()).data().count); } catch(e){ console.log(c + ': ERROR', e.code); }
}
for (const u of (await db.collection('users').get()).docs) {
  const cards = (await u.ref.collection('cards').count().get()).data().count;
  const decks = (await u.ref.collection('decks').count().get()).data().count;
  console.log('  user', u.id, '| username:', u.get('username'), '| cards:', cards, '| decks:', decks);
}
process.exit(0);
