/* CSP-safe handlers: templates register functions, never executable source. */
const mfdPendingEvents=new Map();let mfdPendingCleanup;
function mfdOn(handler){if(typeof handler!=='function')throw Error('Event handler must be a function');const id=crypto.randomUUID();mfdPendingEvents.set(id,handler);if(!mfdPendingCleanup)mfdPendingCleanup=setTimeout(()=>{mfdPendingEvents.clear();mfdPendingCleanup=null},10000);return id}
function mfdHydrate(root){
 const nodes=root.nodeType===1?[root,...root.querySelectorAll('*')]:root.querySelectorAll('*');
 for(const node of nodes)for(const attr of [...node.attributes]){
  if(!attr.name.startsWith('data-mfd-on'))continue;
  const type=attr.name.slice('data-mfd-on'.length),fn=mfdPendingEvents.get(attr.value);node.removeAttribute(attr.name);if(!fn)continue;mfdPendingEvents.delete(attr.value);
  node.addEventListener(type,function(event){if(fn.call(this,event)===false){event.preventDefault();event.stopPropagation()}});
 }
}
const mfdEventObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)mfdHydrate(node)});
mfdEventObserver.observe(document.documentElement,{subtree:true,childList:true});
document.querySelectorAll('[data-mfd-settings]').forEach(node=>node.addEventListener('click',()=>go('settings')));
