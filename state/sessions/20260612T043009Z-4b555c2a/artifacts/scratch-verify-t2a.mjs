// SOLO LECTURA. Verifica el ensamblado y la reconciliacion de la tanda 2a con datos REALES.
import { createRequire } from 'module';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const require = createRequire(import.meta.url);
const idx = require('C:/Users/srpar/WebstormProjects/cranialTrading/functions/lib/publicCardIndex.js');
console.log('exporta:', Object.keys(idx).join(', '));
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();
const UID='Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const docs=(await db.collection('public_cards').where('userId','==',UID).get()).docs.map(d=>d.data());
const ids=[...new Set(docs.map(c=>c.scryfallId).filter(Boolean))];
const cache=new Map();
for(let i=0;i<ids.length;i+=300){const g=await db.getAll(...ids.slice(i,i+300).map(id=>db.collection('scryfall_cache').doc(id)));for(const x of g) if(x.exists) cache.set(x.id,x.data().card||x.data());}
console.log('cartas reales =',docs.length);

const build = idx.buildPublicIndex || idx.assemblePublicIndex || idx.buildIndex;
const res = build(docs, cache);
const chunks = Object.values(res.chunks);
const meta = res.meta || res.metadata;
console.log('chunks=%d  meta=%s', chunks.length, JSON.stringify(meta));
const total = chunks.reduce((a,c)=>a+(c.entries||c).length,0);
console.log('entradas totales=%d (esperado %d) %s', total, docs.length, total===docs.length?'IGUAL':'DIFIERE');
const sizes=chunks.map(c=>(c.entries||c).length).sort((a,b)=>a-b);
console.log('por chunk: min=%d max=%d | bytes chunk mas grande=%d (limite 1MiB=1048576)',
  sizes[0],sizes[sizes.length-1],Math.max(...chunks.map(c=>Buffer.byteLength(JSON.stringify(c),'utf8'))));

const diag = idx.diagnosePublicIndex;
console.log('\n--- CONTROL: indice sano ---');
const d0 = diag(res.chunks, meta, docs, cache);
console.log(JSON.stringify({missing:(d0.missing||[]).length,orphaned:(d0.orphaned||[]).length,misplaced:(d0.misplaced||[]).length,indexEmptied:d0.indexEmptied,rebuildRequired:d0.rebuildRequired}));

console.log('\n--- CASO AC10: indice VACIADO (chunks presentes, entradas en cero) ---');
const vaciado = {}; for (const [k,c] of Object.entries(res.chunks)) vaciado[k] = {...c, entries: []};
const d1 = diag(vaciado, meta, docs, cache);
console.log(JSON.stringify({missing:(d1.missing||[]).length,indexEmptied:d1.indexEmptied,rebuildRequired:d1.rebuildRequired}));

console.log('\n--- CASO: restos (cartas en el indice que ya no existen) ---');
const d2 = diag(res.chunks, meta, docs.slice(0, docs.length-50), cache);
console.log(JSON.stringify({orphaned:(d2.orphaned||[]).length,missing:(d2.missing||[]).length}));

console.log('\n--- CASO: un chunk perdido ---');
const menos = {...res.chunks}; delete menos[Object.keys(menos).pop()]; const d3 = diag(menos, meta, docs, cache);
console.log(JSON.stringify({missing:(d3.missing||[]).length,rebuildRequired:d3.rebuildRequired}));

console.log('\n--- PLAN: cuando repara incremental y cuando exige rebuild ---');
const plan = idx.planPublicIndexReconciliation;
const p1 = plan(diag(res.chunks, meta, docs, cache), docs, cache, meta);
console.log('sano        -> rebuild=%s chunks a escribir=%s', p1.rebuildRequired, Object.keys(p1.chunks||{}).length);
const p2 = plan(diag(vaciado, meta, docs, cache), docs, cache, meta);
console.log('vaciado     -> rebuild=%s chunks a escribir=%s', p2.rebuildRequired, Object.keys(p2.chunks||{}).length);
const p3 = plan(diag(menos, meta, docs, cache), docs, cache, meta);
console.log('chunk perdido-> rebuild=%s chunks a escribir=%s', p3.rebuildRequired, Object.keys(p3.chunks||{}).length);
const p4 = plan(diag(res.chunks, meta, docs.slice(0,-50), cache), docs.slice(0,-50), cache, meta);
console.log('50 restos   -> rebuild=%s chunks a escribir=%s', p4.rebuildRequired, Object.keys(p4.chunks||{}).length);
const docsGrandes = docs.concat(docs).concat(docs);       // 19.941 -> cruza borde de potencia de dos
const p5 = plan(diag(res.chunks, meta, docsGrandes, cache), docsGrandes, cache, meta);
console.log('cuenta creci -> rebuild=%s chunks a escribir=%s', p5.rebuildRequired, Object.keys(p5.chunks||{}).length);
