import { createRequire } from 'module';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const require = createRequire(import.meta.url);
const { buildPublicEntry } = require('./functions/lib/publicCardEntry.js');
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();
const UID = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const all = await db.collection('public_cards').where('userId','==',UID).limit(3).get();
const d = all.docs[0].data();
console.log('DOC REAL de public_cards -> tiene .name?', 'name' in d, '| .cardName =', JSON.stringify(d.cardName), '| .cardNameLower =', JSON.stringify(d.cardNameLower));
const e = buildPublicEntry(d, null);
console.log('ENTRADA construida -> n =', JSON.stringify(e.n), '| nl =', JSON.stringify(e.nl), '| x =', e.x);

// cuantas cartas tienen colors=[] (incoloras legitimas) pero color_identity con color
const ids=[...new Set((await db.collection('public_cards').where('userId','==',UID).get()).docs.map(x=>x.data().scryfallId))];
const cache=new Map();
for(let i=0;i<ids.length;i+=300){const docs=await db.getAll(...ids.slice(i,i+300).map(id=>db.collection('scryfall_cache').doc(id)));for(const x of docs) if(x.exists) cache.set(x.id,x.data().card||x.data());}
let vacioPeroCI=0, ejemplos=[];
for(const [id,c] of cache){
  if(Array.isArray(c.colors)&&c.colors.length===0&&Array.isArray(c.color_identity)&&c.color_identity.length>0){
    vacioPeroCI++; if(ejemplos.length<6) ejemplos.push(`${c.name} (colors=[] ci=[${c.color_identity}] ${c.type_line||''})`);
  }
}
console.log('cartas INCOLORAS (colors=[]) con color_identity no vacio = %d', vacioPeroCI);
console.log('ejemplos:\n  ' + ejemplos.join('\n  '));
