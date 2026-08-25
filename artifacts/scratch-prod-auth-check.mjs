import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'pa');
const auth = getAuth(app);
let total = 0; const sample = [];
let res = await auth.listUsers(1000);
while (true) {
  total += res.users.length;
  for (const u of res.users) sample.push(u.email);
  if (!res.pageToken) break;
  res = await auth.listUsers(1000, res.pageToken);
}
console.log('cuentas en Auth de PROD:', total);
const target = process.argv[2];
if (target) {
  const hit = sample.filter(e => e && e.toLowerCase() === target.toLowerCase());
  console.log('la cuenta del CI (' + target + ') existe en prod:', hit.length > 0 ? 'SI' : 'NO');
}
process.exit(0);
