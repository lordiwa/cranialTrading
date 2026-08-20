// SOLO LECTURA. Cuenta usuarios en el proyecto indicado por FIREBASE_PROJECT.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const projectId = process.env.FIREBASE_PROJECT;
if (!projectId) { console.error('falta FIREBASE_PROJECT'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const c = await db.collection('users').count().get();
console.log(JSON.stringify({ projectId, users: c.data().count }));
process.exit(0);
