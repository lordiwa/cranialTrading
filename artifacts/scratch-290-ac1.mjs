// TASK-290 AC1 — control negativo: estado de dev ANTES de reponer nada.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'ac1');
const db = getFirestore(app);

// 1. public_cards RAIZ total
const pcTotal = await db.collection('public_cards').count().get();
console.log('public_cards (RAIZ) total:', pcTotal.data().count);

// 2. resolver qa_mtg
const uSnap = await db.collection('usernames').doc('qa_mtg').get();
console.log('/usernames/qa_mtg existe:', uSnap.exists, uSnap.exists ? JSON.stringify(uSnap.data()) : '');
const uid = uSnap.exists ? (uSnap.data().uid || uSnap.data().userId) : null;
console.log('uid resuelto:', uid);

// 3. todos los /usernames y /users
const allU = await db.collection('usernames').get();
console.log('/usernames docs:', allU.docs.map(d => `${d.id}->${JSON.stringify(d.data())}`).join(' | '));
const allUsers = await db.collection('users').get();
console.log('/users docs:', allUsers.docs.map(d => `${d.id}(username=${d.data().username})`).join(' | '));

for (const target of [uid, '90PkdmyFKrVm1RLDXjInJdlYXy73'].filter(Boolean)) {
  const cardsPub = await db.collection('users').doc(target).collection('cards').where('public','==',true).count().get();
  const cardsAll = await db.collection('users').doc(target).collection('cards').count().get();
  const pcUser = await db.collection('public_cards').where('userId','==',target).count().get();
  const idxChunks = await db.collection('users').doc(target).collection('public_card_index').get();
  let entries = 0; for (const c of idxChunks.docs) { const d = c.data(); if (Array.isArray(d.entries)) entries += d.entries.length; }
  const meta = idxChunks.docs.find(d => d.id === '_meta');
  console.log(`\nuid=${target}: cards total=${cardsAll.data().count} public=true=${cardsPub.data().count} | public_cards(raiz,userId)=${pcUser.data().count} | public_card_index chunks=${idxChunks.size} entradas=${entries} _meta.count=${meta?.data()?.count}`);
}

// 4. Auth
const list = await getAuth(app).listUsers(1000);
console.log('\nAuth cuentas dev:', list.users.length);
for (const u of list.users) console.log('  ', u.uid, u.email);
process.exit(0);
