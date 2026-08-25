import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'cq');
const auth = getAuth(app);
const pass = process.env.QA_PASS;
if (!pass) { console.error('falta QA_PASS'); process.exit(1); }
for (const email of ['qa@cranialtrading.com', 'qa2@cranialtrading.com']) {
  try {
    const u = await auth.createUser({ email, password: pass, emailVerified: true });
    console.log('creada:', email, '| uid:', u.uid, '| emailVerified: true');
  } catch (e) {
    console.log('ERROR', email, e.code ?? e.message);
  }
}
process.exit(0);
