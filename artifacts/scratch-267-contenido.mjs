// Que trajo REALMENTE el backup: no conteos, contenido. Solo lectura.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'c267');
const db = getFirestore(app, 'ensayo-contenido-20260822');

const users = await db.collection('users').get();
console.log('=== USERS:', users.size, '===');

// Clasificar por pinta de cuenta de prueba, con el criterio dicho en voz alta.
const esPrueba = (e = '') => /e2etest\.com|test_|unique_|@example\.com|@ex\.com/i.test(e);
let prueba = 0; const reales = [];
for (const d of users.docs) {
  const u = d.data();
  const email = u.email ?? '(sin email en el doc)';
  if (esPrueba(email)) prueba++; else reales.push({ uid: d.id, email, username: u.username, createdAt: u.createdAt?.toDate?.().toISOString?.() });
}
console.log('  con pinta de E2E:', prueba, '| el resto:', reales.length);
console.log('\n=== LAS QUE NO PARECEN DE PRUEBA ===');
for (const r of reales) console.log(' ', (r.email||'').padEnd(34), '|', String(r.username||'').padEnd(16), '|', r.createdAt || 's/f');

// Cuanta data real cuelga de cada una: cartas propias y publicas.
console.log('\n=== CARTAS POR CUENTA (solo las que tienen algo) ===');
for (const d of users.docs) {
  const cards = await d.ref.collection('cards').count().get();
  const n = cards.data().count;
  if (n > 0) console.log('  ', d.id, '|', d.get('email') ?? '', '| cards:', n);
}

const pub = await db.collection('public_cards').count().get();
console.log('\npublic_cards total:', pub.data().count);
const porDuenio = {};
for (const p of (await db.collection('public_cards').limit(9000).get()).docs) {
  const uid = p.get('userId'); porDuenio[uid] = (porDuenio[uid] ?? 0) + 1;
}
console.log('public_cards por dueño:'); for (const [u, n] of Object.entries(porDuenio).sort((a,b)=>b[1]-a[1])) console.log('  ', u, n);

const conv = await db.collection('conversations').get();
console.log('\n=== CONVERSACIONES:', conv.size, '===');
for (const c of conv.docs) {
  const msgs = await c.ref.collection('messages').count().get();
  console.log('  ', c.id, '| participantes:', JSON.stringify(c.get('participants')), '| mensajes:', msgs.data().count);
}
process.exit(0);
