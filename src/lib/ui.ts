export const formatBytes = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`;
export const formatDate = (seconds: number) => new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(seconds * 1000));
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.method && !['GET', 'HEAD'].includes(init.method) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const r = await fetch(url, { ...init, headers }); const body: unknown = await r.json();
  if (!r.ok) throw new Error((body as {message?: string}).message || '操作失敗，請稍後再試。');
  return body as T;
}
export const messages = { 'zh-Hant': { upload: '上傳檔案', once: '下載一次', day: '限時分享' }, en: { upload: 'Share file', once: 'One-time transfer', day: '24-hour link' } };
