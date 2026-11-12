// Inline previews are restricted to small raster images. Executable web
// content, SVG, PDFs and arbitrary text never render in the site's origin.
export const MAX_PREVIEW_BYTES = 5_000_000;
export type PreviewMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export function previewMime(name: string): PreviewMime | null {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    default: return null;
  }
}

export function canPreview(name: string, size: number, mode: string): boolean {
  // Previewing once-only files would bypass their single-use download rule.
  return mode === 'day' && size > 0 && size <= MAX_PREVIEW_BYTES && previewMime(name) !== null;
}

export function validPreviewHeader(mime: PreviewMime, bytes: Uint8Array): boolean {
  const begins = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  switch (mime) {
    case 'image/png': return bytes.length >= 8 && begins([137, 80, 78, 71, 13, 10, 26, 10]);
    case 'image/jpeg': return bytes.length >= 3 && begins([255, 216, 255]);
    case 'image/gif': return bytes.length >= 6 && (begins([71, 73, 70, 56, 55, 97]) || begins([71, 73, 70, 56, 57, 97]));
    case 'image/webp': return bytes.length >= 12 && begins([82, 73, 70, 70])
      && [87, 69, 66, 80].every((value, index) => bytes[8 + index] === value);
  }
}
