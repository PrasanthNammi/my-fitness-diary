// Check bytes before handing a file to the image decoder; MIME labels can be forged.
// Uploads are always re-encoded as JPEG, so source metadata and active formats
// such as SVG never reach storage through these upload flows.
export async function validateImageFile(file: Blob) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw Error('Choose an image smaller than 20 MB.');
  const b = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  const png = [137,80,78,71,13,10,26,10].every((n,i) => b[i] === n);
  const webp = ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP';
  const gif = ['GIF87a','GIF89a'].includes(ascii(0,6));
  const heif = ascii(4,8) === 'ftyp' && ['avif','avis','heic','heix','hevc','hevx','mif1','msf1'].includes(ascii(8,12));
  if (!(jpeg || png || webp || gif || heif)) throw Error('Choose a JPEG, PNG, WebP, GIF, or supported HEIF image.');
}

export function assertImageDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > 50_000_000)
    throw Error('Image dimensions are too large or invalid. Choose a smaller image.');
}
