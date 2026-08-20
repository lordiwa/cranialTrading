// MEDIUM-1: chunk id negativo / malformado -> converge la reparacion?
import { createRequire } from 'module';
const require = createRequire('C:/Users/srpar/WebstormProjects/cranialTrading/x.js');
const { buildPublicIndex:build, diagnosePublicIndex:diag, planPublicIndexReconciliation:plan } =
  require('C:/Users/srpar/WebstormProjects/cranialTrading/functions/lib/publicCardIndex.js');
const uuid=(n)=>`${String(n).padStart(8,'0')}-1111-2222-3333-444444444444`;
const card=(n)=>({scryfallId:uuid(n),cardId:`c${n}`,cardName:`C${n}`,cardNameLower:`c${n}`,quantity:1,price:1,
  status:'sale',foil:false,condition:'NM',setCode:'x',edition:'S',userId:'u',updatedAt:null});
const docs=[...Array(5)].map((_,i)=>card(i));
const cache=new Map();
const res=build(docs,cache,{chunkTargetSize:400});
for (const [etiqueta, malo] of [['id -1',{id:-1,entries:[]}],['id string',{id:'abc',entries:[]}],['id 2.5',{id:2.5,entries:[]}]]) {
  const chunks={...res.chunks}; chunks[String(malo.id)]=malo;
  const d=diag(chunks,res.meta,docs,cache,{chunkTargetSize:400});
  let p; try { p=plan(d,build(docs,cache,{chunkTargetSize:400})); } catch(e){ console.log('%-10s -> plan TIRA: %s',etiqueta,e.message.slice(0,60)); continue; }
  const ok={...chunks}; for(const [k,v] of Object.entries(p.chunksToWrite||{})) ok[k]=v;
  for(const id of (p.chunksToDelete||[])) delete ok[String(id)];
  const d2=diag(ok,p.meta,docs,cache,{chunkTargetSize:400});
  console.log('%-10s -> mismatch=%s rebuild=%s borra=%j | tras aplicar: isDivergent=%s  %s',
    etiqueta, d.totalChunksMismatch, p.rebuildRequired, p.chunksToDelete, d2.isDivergent, d2.isDivergent?'<-- NO CONVERGE':'converge');
}
