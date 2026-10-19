/* Three-way, entity-aware workspace reconciliation. No credentials or network access. */
(function(root){
 const equal=(a,b)=>{if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;if(Array.isArray(a)!==Array.isArray(b))return false;const ak=Object.keys(a).filter(k=>a[k]!==undefined),bk=Object.keys(b).filter(k=>b[k]!==undefined);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]))};
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 function identity(v){if(!object(v))return null;if(v.id!=null)return 'id:'+v.id;if(v.group!=null&&v.set!=null)return 'set:'+v.group+':'+v.set;if(v.name!=null)return 'name:'+String(v.name).trim().toLowerCase();if(v.date!=null)return 'date:'+v.date;return null}
 function reconcile(base,local,remote,choices={}){const conflicts=[];
  function merge(b,l,r,path){
   if(equal(l,r)||equal(b,r))return l;if(equal(b,l))return r;
   if(object(l)&&object(r)&&(object(b)||b===undefined)){const result={};for(const key of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){const v=merge(b?.[key],l[key],r[key],[...path,key]);if(v!==undefined)result[key]=v}return result}
   if(Array.isArray(l)&&Array.isArray(r)&&(Array.isArray(b)||b===undefined)){
    const lists=[b||[],l,r];const keyed=lists.every(list=>list.every(x=>identity(x)!==null)&&new Set(list.map(identity)).size===list.length);
    if(keyed){const maps=lists.map(list=>new Map(list.map(x=>[identity(x),x]))),keys=new Set([...l.map(identity),...r.map(identity),...(b||[]).map(identity)]),result=[];for(const key of keys){const v=merge(maps[0].get(key),maps[1].get(key),maps[2].get(key),[...path,key]);if(v!==undefined)result.push(v)}return result}
    if(l.every(v=>typeof v==='string')&&r.every(v=>typeof v==='string')&&(!b||b.every(v=>typeof v==='string'))){const old=new Set(b||[]),left=new Set(l),right=new Set(r);return [...new Set([...l,...r])].filter(v=>!old.has(v)||left.has(v)&&right.has(v))}
   }
   const key=JSON.stringify(path),choice=choices[key];if(choice==='cloud'||choice?.side==='cloud'&&equal(choice.remote,r))return r;if(choice==='local'||choice?.side==='local'&&equal(choice.remote,r))return l;
   conflicts.push({key,path,local:l,remote:r,base:b});return l;
  }
  return {document:merge(base,local,remote,[]),conflicts};
 }
 function delta(current,target){const changes=[];function visit(a,b,path){if(equal(a,b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){if(!Object.hasOwn(b,k))changes.push({path:[...path,k],remove:true});else visit(a[k],b[k],[...path,k])}if(Array.isArray(a)&&a.length!==b.length)changes.push({path,value:b.length,length:true});return}changes.push({path,value:b})}visit(current,target,[]);return changes}
 function applyDelta(document,changes){let result=structuredClone(document);for(const change of changes){if(!change.path.length){if(change.length)result.length=change.value;else result=structuredClone(change.value);continue}let parent=result;for(const key of change.path.slice(0,-1))parent=parent[key];const key=change.path.at(-1);if(change.remove)delete parent[key];else if(change.length)parent[key].length=change.value;else Object.defineProperty(parent,key,{value:structuredClone(change.value),enumerable:true,writable:true,configurable:true})}return result}
 root.MFDWorkspaceMerge={equal,reconcile,delta,applyDelta};
})(typeof window==='undefined'?globalThis:window);
