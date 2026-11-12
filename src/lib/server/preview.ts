// Keep file previews conservative: never execute uploaded content as code.
// Only repeatable (24-hour) shares are eligible; one-time shares cannot be previewed.
export const MAX_IMAGE_PREVIEW_BYTES = 5_000_000;
export const MAX_PDF_PREVIEW_BYTES = 8_000_000;
export const MAX_TEXT_PREVIEW_BYTES = 256_000;
export type PreviewKind = 'image' | 'pdf' | 'text';
export type PreviewMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  | 'application/pdf' | 'text/plain; charset=utf-8';

export function previewKind(name: string, size: number, mode: string): PreviewKind | null {
  if (mode !== 'day' || size <= 0) return null;
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (size <= MAX_IMAGE_PREVIEW_BYTES && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (size <= MAX_PDF_PREVIEW_BYTES && ext === 'pdf') return 'pdf';
  // Markdown, JSON, HTML-like strings etc. remain literal text, never rendered as markup.
  if (size <= MAX_TEXT_PREVIEW_BYTES && ['txt', 'md', 'csv', 'tsv', 'json', 'log', 'yaml', 'yml', 'ini'].includes(ext)) return 'text';
  return null;
}

export function previewMime(name: string, kind: PreviewKind): PreviewMime {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'text') return 'text/plain; charset=utf-8';
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    default: return 'image/webp';
  }
}

export function validPreviewHeader(mime: PreviewMime, bytes: Uint8Array): boolean {
  const begins = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  switch (mime) {
    case 'image/png': return bytes.length >= 8 && begins([137, 80, 78, 71, 13, 10, 26, 10]);
    case 'image/jpeg': return bytes.length >= 3 && begins([255, 216, 255]);
    case 'image/gif': return bytes.length >= 6 && (begins([71, 73, 70, 56, 55, 97]) || begins([71, 73, 70, 56, 57, 97]));
    case 'image/webp': return bytes.length >= 12 && begins([82, 73, 70, 70])
      && [87, 69, 66, 80].every((value, index) => bytes[8 + index] === value);
    case 'application/pdf':
      return bytes.length >= 8 && begins([37, 80, 68, 70, 45])
        && bytes[5] >= 48 && bytes[5] <= 57 && bytes[6] === 46
        && bytes[7] >= 48 && bytes[7] <= 57;
    case 'text/plain; charset=utf-8': return true;
  }
}

export function decodePreviewText(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.length > MAX_TEXT_PREVIEW_BYTES) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Reject binary-like payloads that happen to have a text file extension.
    // No HTML, Markdown or JSON parsing is performed.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
    return text;
  } catch { return null; }
}
