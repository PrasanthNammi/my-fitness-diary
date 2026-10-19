export const engine=():any=>(document.getElementById('mfd-engine') as HTMLIFrameElement)?.contentWindow && (document.getElementById('mfd-engine') as any).contentWindow.MFDBridge;
export const client=():any=>engine()?.client();
export function openTool(name:string,id?:string){if(name==='backup'){engine()?.tool(name,id);return;}window.dispatchEvent(new CustomEvent('mfd-tool',{detail:{name,id}}));}
