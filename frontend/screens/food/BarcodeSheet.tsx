import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft} from 'lucide-react';
import {isValidBarcode} from '../../adapters/barcode';
// Full-screen camera scanner. It only reads the barcode and hands it back (onScanned); the food picker does the lookup and
// shows the results, so typing a barcode in the search bar and scanning one behave the same.
// Scanning uses zxing-cpp compiled to WebAssembly: it reads EAN/UPC barcodes held sideways or upside down and copes with
// blur and glare better than the JavaScript reader. The engine is copied next to the bundle at build time
// (scripts-build-react.cjs) and precached by the service worker, so it never comes from a CDN.
// Module-level constant so the engine is prepared only once.
const ZXING_OVERRIDES={locateFile:(file:string,prefix:string)=>file.endsWith('.wasm')?'/react/zxing_reader.wasm':prefix+file};
const READ_OPTIONS={formats:['EAN/UPC' as const],tryHarder:true,tryRotate:true,tryInvert:false,maxNumberOfSymbols:1};
const MAX_FRAME_SIDE=1024,FRAME_GAP_MS=120;

export function BarcodeSheet({open,onClose,onScanned}:{open:boolean;onClose:()=>void;onScanned:(code:string)=>void}){
  const video=useRef<HTMLVideoElement>(null),back=useRef<HTMLButtonElement>(null),[error,setError]=useState('');
  const latest=useRef({onClose,onScanned});latest.current={onClose,onScanned};
  useEffect(()=>{
    if(!open)return;
    let disposed=false,stream:MediaStream|null=null,timer=0;
    setError('');
    const stop=()=>{disposed=true;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());if(video.current)video.current.srcObject=null};
    // Escape closes only the scanner, not the food picker sheet underneath (capture phase runs before its listener).
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();latest.current.onClose()}};
    window.addEventListener('keydown',onKey,true);
    requestAnimationFrame(()=>back.current?.focus({preventScroll:true}));
    (async()=>{
      const zxing=await import('zxing-wasm/reader');
      await zxing.prepareZXingModule({overrides:ZXING_OVERRIDES,fireImmediately:true});
      if(disposed)return;
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(disposed){stop();return}
      const v=video.current!,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
      v.srcObject=stream;await v.play();
      const tick=async()=>{
        if(disposed)return;
        if(v.videoWidth){
          // Read only the centred square the viewfinder shows (the video is object-fit: cover), so what you see is what is scanned.
          const side=Math.min(v.videoWidth,v.videoHeight),out=Math.min(side,MAX_FRAME_SIDE);
          canvas.width=out;canvas.height=out;
          ctx.drawImage(v,(v.videoWidth-side)/2,(v.videoHeight-side)/2,side,side,0,0,out,out);
          try{
            const [hit]=await zxing.readBarcodes(ctx.getImageData(0,0,out,out),READ_OPTIONS);
            if(hit?.isValid&&isValidBarcode(hit.text)&&!disposed){stop();latest.current.onScanned(hit.text);return}
          }catch{/* unreadable frame: try the next one */}
        }
        if(!disposed)timer=window.setTimeout(tick,FRAME_GAP_MS);
      };
      tick();
    })().catch(()=>{if(!disposed)setError('Camera unavailable. Go back and type the barcode in the search bar.')});
    return()=>{stop();window.removeEventListener('keydown',onKey,true)};
  },[open]);
  if(!open)return null;
  return createPortal(
    <div className="scan-screen" role="dialog" aria-modal="true" aria-label="Scan barcode">
      <button ref={back} className="scan-back" aria-label="Back" onClick={onClose}><ChevronLeft/></button>
      <div className="scan-window"><video ref={video} playsInline muted/><span className="scan-line" aria-hidden="true"/></div>
      <p className="scan-hint" role={error?'alert':undefined}>{error||'Point the camera at a barcode'}</p>
    </div>,
    document.body,
  );
}
