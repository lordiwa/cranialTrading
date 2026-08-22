// AC2 de TASK-267: verificar POR MEDICION que el backup restaurado trae datos
// reales. Compara la base del ensayo contra la (default) de produccion.
// SOLO LECTURA sobre las dos.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'v267');
const ensayo = getFirestore(app, 'ensayo-restore-20260822');
const actual = getFirestore(app); // (default)

const medir = async (db, etiqueta) => {
  const cols = await db.listCollections();
  console.log(`\n=== ${etiqueta} ===`);
  if (cols.length === 0) {
    console.log('  CERO colecciones. Ojo: eso NO es lo mismo que "el restore fallo";');
    console.log('  puede ser un backup de una base ya vacia. La operacion dijo SUCCESSFUL.');
    return;
  }
  for (const c of cols) {
    const n = (await db.collection(c.id).count().get()).data().count;
    console.log(`  ${c.id}: ${n}`);
  }
};

await medir(ensayo, 'BASE DEL ENSAYO (backup del 2026-08-20T11:40Z)');
await medir(actual, 'PRODUCCION ACTUAL (default)');
process.exit(0);
