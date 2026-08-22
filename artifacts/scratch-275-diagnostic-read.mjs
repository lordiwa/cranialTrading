// Mide si el sensor de cardinalidad de TASK-275 escribio de verdad contra
// Firestore real. NO repara nada (AC6): solo lee.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'diag275');
const db = getFirestore(app);

const CUENTAS = {
  qa: '90PkdmyFKrVm1RLDXjInJdlYXy73',
};

for (const [nombre, uid] of Object.entries(CUENTAS)) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.collection('diagnostics').get();
  console.log(`\n=== ${nombre} (${uid}) ===`);
  if (snap.empty) {
    // Un vacio NO es lo mismo que "sano": puede ser que nunca se cargo la
    // coleccion con el codigo nuevo, o que la escritura rebotara.
    console.log('  SIN documento de diagnostico. Causas posibles y NO distinguibles desde aca:');
    console.log('   (a) nunca hubo divergencia, (b) nunca se cargo la coleccion con el sensor,');
    console.log('   (c) la escritura rebotó por reglas.');
  } else {
    for (const d of snap.docs) console.log(' ', d.id, JSON.stringify(d.data()));
  }
  // Contraste contra la divergencia real, medida en el momento.
  const cards = await ref.collection('cards').get();
  const idx = new Set();
  for (const c of (await ref.collection('card_index').get()).docs)
    for (const e of (c.data().cards ?? [])) idx.add(String(e?.i));
  console.log(`  divergencia REAL ahora: documentos=${cards.size} entradas=${idx.size} diferencia=${cards.size - idx.size}`);
}
process.exit(0);
