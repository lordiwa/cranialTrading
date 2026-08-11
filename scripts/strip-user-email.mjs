#!/usr/bin/env node
/**
 * TASK-188 — saca el campo `email` de los documentos de la coleccion /users.
 *
 * POR QUE. firestore.rules tiene `match /users/{userId} { allow read: if true }`
 * porque el perfil publico de otro usuario se abre SIN sesion (requisito de
 * producto). Las reglas de Firestore no filtran por campo: si el documento es
 * legible, se leen TODOS sus campos. Medido el 2026-08-11 con una peticion REST
 * anonima: HTTP 200 con 134 documentos en produccion y 232 en dev, cada uno con
 * `email` poblado. Es la tercera aparicion de la misma clase de fuga
 * (TASK-087 sobre users/{uid}/cards, TASK-169 sobre public_cards).
 *
 * El email sigue existiendo en dos lugares legitimos y este script no los toca:
 * Firebase Auth (fuente de verdad para el propio dueño) y contact_info/{uid}
 * (para que otro usuario logueado pueda contactarlo).
 *
 * ORDEN OBLIGATORIO, aprendido en TASK-169: el CODIGO SE DESPLIEGA PRIMERO y
 * esta limpieza va DESPUES. Al reves, el codigo viejo vuelve a escribir el campo
 * en el siguiente login de cada usuario y la fuga se reabre sola.
 *
 * Uso (lo corre un operador a mano, primero dev y despues prod):
 *   gcloud auth application-default login
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/strip-user-email.mjs --dry-run
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/strip-user-email.mjs --apply
 *
 * Sin --apply no escribe nada. --dry-run informa cuantos documentos tienen el
 * campo, SIN imprimir un solo valor: este script nunca muestra un email.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT || 'cranial-trading-dev';
const apply = process.argv.includes('--apply');

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

// Firestore acepta hasta 500 operaciones por batch.
const BATCH_LIMIT = 400;

async function main() {
  console.log(`Proyecto: ${projectId}`);
  console.log(apply ? 'MODO: --apply (escribe)' : 'MODO: dry-run (no escribe nada)');

  const snap = await db.collection('users').get();
  const withEmail = snap.docs.filter(d => d.get('email') !== undefined);

  console.log(`Usuarios totales: ${snap.size}`);
  console.log(`Con campo email: ${withEmail.length}`);

  if (!apply) {
    console.log('\nDry-run: no se escribio nada. Volve a correr con --apply para limpiar.');
    return;
  }
  if (withEmail.length === 0) {
    console.log('\nNada que hacer.');
    return;
  }

  let done = 0;
  for (let i = 0; i < withEmail.length; i += BATCH_LIMIT) {
    const slice = withEmail.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const d of slice) {
      batch.update(d.ref, { email: FieldValue.delete() });
    }
    await batch.commit();
    done += slice.length;
    console.log(`  ${done}/${withEmail.length}`);
  }

  // Verificacion en la misma corrida: releer y contar.
  const after = await db.collection('users').get();
  const remaining = after.docs.filter(d => d.get('email') !== undefined).length;
  console.log(`\nListo. Documentos que todavia tienen email: ${remaining}`);
  if (remaining > 0) {
    console.error('ATENCION: quedaron documentos con el campo. Revisar antes de dar el ticket por cerrado.');
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Fallo la migracion:', err.message);
  process.exitCode = 1;
});
