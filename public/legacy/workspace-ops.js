// Workspace change operations and compaction (see database/DELTA_SYNC.md).
// The SQL twins live in database/workspace-delta.sql; tests/workspace-ops-equivalence.cjs proves
// that both produce identical documents.
(function(root){
 const has=Object.hasOwn,present=(o,k)=>!!o&&has(o,k)&&o[k]!==undefined;
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 function equal(a,b){if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!equal(a[i],b[i]))return false;return true}
  const ak=Object.keys(a).filter(k=>a[k]!==undefined),bk=Object.keys(b).filter(k=>b[k]!==undefined);return ak.length===bk.length&&ak.every(k=>has(b,k)&&equal(a[k],b[k]))}
 const idKey=id=>JSON.stringify(id);
 /** A list that can change item by item: objects with unique, non-null ids. */
 function keyed(list){if(!Array.isArray(list))return false;const seen=new Set();for(const item of list){if(!object(item)||item.id===null||item.id===undefined||typeof item.id==='object')return false;const k=idKey(item.id);if(seen.has(k))return false;seen.add(k)}return true}

 /** Operations that turn document `a` into document `b` (top-level objects). */
 function diff(a,b){const ops=[];
  for(const k of [...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].sort()){
   const inA=present(a,k),inB=present(b,k);
   if(!inB){if(inA)ops.push({k,d:true});continue}
   if(!inA){ops.push({k,v:b[k]});continue}
   const x=a[k],y=b[k];if(equal(x,y))continue;
   if(keyed(x)&&keyed(y)){
    const old=new Map(x.map(item=>[idKey(item.id),item])),next=new Map(y.map(item=>[idKey(item.id),item]));
    const order=x.map(item=>idKey(item.id));
    for(const item of x)if(!next.has(idKey(item.id))){ops.push({k,i:item.id,d:true});order.splice(order.indexOf(idKey(item.id)),1)}
    for(const item of y){const id=idKey(item.id),before=old.get(id);if(!before){ops.push({k,i:item.id,v:item});order.push(id)}else if(!equal(before,item))ops.push({k,i:item.id,v:item})}
    const target=y.map(item=>idKey(item.id));
    if(order.some((id,n)=>id!==target[n]))ops.push({k,o:y.map(item=>item.id)});
   }else ops.push({k,v:y});
  }
  return ops}

 /** Applies operations without changing `doc`. Throws when an operation doesn't fit. */
 function apply(doc,ops){if(!object(doc))throw Error('Workspace is not an object');if(!Array.isArray(ops))throw Error('Changes must be a list');
  const out={...doc},copied=new Set();
  const list=k=>{if(!Array.isArray(out[k]))throw Error('Not a list: '+k);if(!copied.has(k)){out[k]=out[k].slice();copied.add(k)}return out[k]};
  for(const op of ops){
   if(!object(op)||typeof op.k!=='string')throw Error('Invalid change');const k=op.k;
   if(has(op,'o')){const items=list(k);if(!Array.isArray(op.o)||op.o.length!==items.length)throw Error('Order does not match '+k);
    const map=new Map(items.map(item=>[idKey(item?.id),item]));if(map.size!==items.length)throw Error('Duplicate ids in '+k);
    const sorted=op.o.map(id=>map.get(idKey(id)));if(sorted.some(v=>v===undefined)||new Set(op.o.map(idKey)).size!==op.o.length)throw Error('Order does not match '+k);
    out[k]=sorted;continue}
   if(has(op,'i')){const items=list(k),n=items.findIndex(item=>object(item)&&idKey(item.id)===idKey(op.i));
    if(op.d===true){if(n<0)throw Error('Missing item in '+k);items.splice(n,1)}
    else if(has(op,'v')){if(!object(op.v)||idKey(op.v.id)!==idKey(op.i))throw Error('Item id mismatch in '+k);if(n<0)items.push(op.v);else items[n]=op.v}
    else throw Error('Invalid change');continue}
   if(op.d===true){delete out[k];copied.delete(k);continue}
   if(has(op,'v')){out[k]=op.v;copied.delete(k);continue}
   throw Error('Invalid change');
  }
  return out}

 // ---- Compaction v1 -------------------------------------------------------------------------
 const NULL_FIELDS=['floors','steps','custom_metric','rpe','distance_meters','duration_seconds','superset_id'];
 function compactSet(s){if(!object(s)||!NULL_FIELDS.some(f=>has(s,f)&&s[f]===null))return s;const out={...s};for(const f of NULL_FIELDS)if(has(out,f)&&out[f]===null)delete out[f];return out}
 function compactSets(sets){if(!Array.isArray(sets))return sets;let changed=false;const out=sets.map(s=>{const c=compactSet(s);if(c!==s)changed=true;return c});return changed?out:sets}
 /** Compact form of a document. Returns the same objects where nothing changed, and the raw
  *  import rows that were moved out ({sessionId: rows}). `keys` limits the work to those keys.
  *  The phone passes moveImports=false: it uploads import rows with the workout and the server
  *  moves them in the same transaction, so they are never held in only one unconfirmed place. */
 function compact(doc,keys,moveImports=true){if(!object(doc))return {document:doc,imports:{}};const imports={};let out=doc;const want=k=>!keys||keys.includes(k);
  const set=(k,v)=>{if(v!==doc[k]){if(out===doc)out={...doc};out[k]=v}};
  if(want('sessions')&&Array.isArray(doc.sessions)){let changed=false;const sessions=doc.sessions.map(s=>{if(!object(s))return s;let t=s;const sets=compactSets(s.sets);if(sets!==s.sets)t={...t,sets};
    // Rows move out only from workouts with an id to file them under; otherwise they stay put.
    const noRows=s.hevyRows===null||s.hevyRows===undefined,canMove=s.id!==undefined&&s.id!==null&&typeof s.id!=='object';
    if(moveImports&&has(s,'hevyRows')&&(noRows||canMove)){if(!noRows)imports[String(s.id)]=s.hevyRows;if(t===s)t={...t};delete t.hevyRows}
    if(t!==s)changed=true;return t});if(changed)set('sessions',sessions)}
  if(want('routines')&&Array.isArray(doc.routines)){let changed=false;const routines=doc.routines.map(r=>{if(!object(r)||!Array.isArray(r.exercises))return r;let ec=false;const exercises=r.exercises.map(e=>{if(!object(e))return e;const d=compactSets(e.setDetails);if(d===e.setDetails)return e;ec=true;return {...e,setDetails:d}});if(!ec)return r;changed=true;return {...r,exercises}});if(changed)set('routines',routines)}
  if(want('active')&&object(doc.active)){const sets=compactSets(doc.active.sets);if(sets!==doc.active.sets)set('active',{...doc.active,sets})}
  return {document:out,imports}}

 root.MFDWorkspaceOps={equal,keyed,diff,apply,compact,NULL_FIELDS};
})(typeof window==='undefined'?globalThis:window);
