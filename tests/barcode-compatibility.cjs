const assert=require('node:assert/strict');
const {BrowserMultiFormatReader}=require('@zxing/browser');
const {BinaryBitmap,HybridBinarizer,RGBLuminanceSource,BarcodeFormat}=require('@zxing/library');
// Independently constructed EAN-13 fixture, including its check digit.
const digits='5901234123457';
const left=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
const complement=bits=>bits.replace(/[01]/g,b=>b==='0'?'1':'0');
let bits='101';
for(let i=1;i<7;i++){const pattern=left[Number(digits[i])];bits+=parity[Number(digits[0])][i-1]==='L'?pattern:complement(pattern).split('').reverse().join('')}
bits+='01010';for(let i=7;i<13;i++)bits+=complement(left[Number(digits[i])]);bits+='101';
assert.equal(bits.length,95);
const scale=3,margin=12,width=(bits.length+margin*2)*scale,height=100;
const pixels=new Int32Array(width*height).fill(0xffffff);
for(let y=10;y<90;y++)for(let x=0;x<bits.length*scale;x++)if(bits[Math.floor(x/scale)]==='1')pixels[y*width+margin*scale+x]=0;
const reader=new BrowserMultiFormatReader();
assert.equal(typeof reader.decodeFromConstraints,'function');
const result=reader.decodeBitmap(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,width,height))));
assert.equal(result.getText(),digits);assert.equal(result.getBarcodeFormat(),BarcodeFormat.EAN_13);
console.log('PASS Node 22 barcode browser API and EAN-13 decoding from synthetic image');
