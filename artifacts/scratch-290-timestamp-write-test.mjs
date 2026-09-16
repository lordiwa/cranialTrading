import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadBuildPublicCardDoc } from '../scripts/lib/loadBuildPublicCardDoc.mjs'

const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'tswrite');
const db = getFirestore(app);
const buildPublicCardDoc = await loadBuildPublicCardDoc()
const card = { id: 'scratchid', scryfallId: 's1', name: 'Test', edition: 'X', setCode: 'X', quantity: 1, condition: 'NM', foil: false, price: 0, image: '', status: 'sale', public: true, updatedAt: new Date() }
const doc = buildPublicCardDoc(card, 'uidscratch', 'qa_mtg', 'Quito, Ecuador', null)
try {
  await db.collection('_scratch_task290').doc('probe').set(doc)
  console.log('write with raw client Timestamp: SUCCEEDED (unexpected? verify content)')
  const readback = await db.collection('_scratch_task290').doc('probe').get()
  console.log('readback updatedAt:', JSON.stringify(readback.data().updatedAt))
} catch (e) {
  console.log('write with raw client Timestamp FAILED as expected:', e.message)
} finally {
  await db.collection('_scratch_task290').doc('probe').delete().catch(()=>{})
}
process.exit(0)
