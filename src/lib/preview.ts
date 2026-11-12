export type PreviewItem = { name: string; mode: string; endpoint: string; thumbnail?: string | null };
export function previewType(name: string): { kind: 'image' | 'video' | 'audio' | 'text'; mime: string } | null {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const images: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp' };
  if (images[ext]) return { kind: 'image', mime: images[ext] };
  const video: Record<string,string> = { mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime' };
  if (video[ext]) return { kind:'video',mime:video[ext] };
  const audio: Record<string,string> = { mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', m4a:'audio/mp4' };
  if (audio[ext]) return { kind:'audio',mime:audio[ext] };
  if (['txt','md','csv','tsv','json','log'].includes(ext)) return { kind:'text',mime:'text/plain' };
  return null;
}
export async function makeThumbnail(file: File): Promise<string | null> {
  if (previewType(file.name)?.kind !== 'image') return null;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    for (const edge of [192,128,96]) {
      const ratio = Math.min(1, edge / Math.max(bitmap.width,bitmap.height));
      canvas.width = Math.max(1,Math.round(bitmap.width*ratio));
      canvas.height = Math.max(1,Math.round(bitmap.height*ratio));
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const data = canvas.toDataURL('image/webp',.35);
      if (data.startsWith('data:image/webp;base64,') && data.length-23 <= 4096) return data.slice(23);
    }
  } catch { /* Unsupported images still upload without a thumbnail. */ }
  finally { bitmap?.close(); }
  return null;
}
