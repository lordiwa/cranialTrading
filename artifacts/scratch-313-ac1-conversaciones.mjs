// TASK-313 AC1 + caso 7 — medir el estado real de /conversations para la
// cuenta qa_mtg (unica cuenta de dev, TASK-267) antes de decidir si hace
// falta limpiar datos. Solo lectura.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const UID = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 't313ac1');
const db = getFirestore(app);

const snap = await db.collection('conversations')
  .where('participantIds', 'array-contains', UID)
  .get();

console.log(`Total conversaciones donde participa qa_mtg: ${snap.size}`);
for (const d of snap.docs) {
  const data = d.data();
  const hasLastMessage = typeof data.lastMessage === 'string' && data.lastMessage !== '';
  console.log(`- ${d.id}: participantIds=${JSON.stringify(data.participantIds)} lastMessage=${JSON.stringify(data.lastMessage)} -> ${hasLastMessage ? 'TIENE mensaje' : 'VACIA (candidata al defecto WG4-O3B2-04)'}`);
  const msgs = await d.ref.collection('messages').get();
  console.log(`  mensajes reales en la subcoleccion: ${msgs.size}`);
}
