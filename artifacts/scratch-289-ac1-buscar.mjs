// TASK-289 AC1 — buscar en dev una carta de tipo MULTIPLE ya publicada,
// para medir el control negativo SIN sembrar nada (regla del 2026-08-27).
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'ac1');
const db = getFirestore(app);
const WORDS = ['creature','instant','sorcery','enchantment','artifact','planeswalker','land'];
const users = await db.collection('users').get();
for (const u of users.docs) {
  const chunks = await u.ref.collection('public_card_index').get();
  let entries = [];
  for (const c of chunks.docs) {
    const d = c.data();
    if (Array.isArray(d.entries)) entries = entries.concat(d.entries);
  }
  console.log('users/' + u.id + ' -> chunks:', chunks.size, 'entries:', entries.length);
  const multi = entries.filter(e => {
    const t = String(e.t || '').toLowerCase();
    return WORDS.filter(w => t.includes(w)).length > 1;
  });
  console.log('   tipo MULTIPLE:', multi.length);
  for (const m of multi.slice(0, 8)) {
    const t = String(m.t || '').toLowerCase();
    console.log('     -', JSON.stringify(m.n), '| t=', JSON.stringify(m.t), '| cats=', WORDS.filter(w => t.includes(w)).join('+'));
  }
  const sinT = entries.filter(e => !e.t).length;
  console.log('   sin type_line:', sinT);
}
process.exit(0);
