import type { Env } from './types';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function fail(status: number, code: string, message: string): never { throw new ApiError(status, code, message); }
export const now = () => Math.floor(Date.now() / 1000);
export function token(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export const validToken = (s: string) => /^[A-Za-z0-9_-]{43}$/.test(s);
export async function hash(s: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function equal(a: string, b: string): Promise<boolean> { return (await hash(a)) === (await hash(b)); }
export function settings(e: Env) {
  const number = (s: string | undefined, fallback: number, max: number) => {
    if (!s) return fallback;
    const n = Number(s);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) fail(503, 'CONFIG', '服務設定不正確，請聯絡管理員。');
    return n;
  };
  return {
    capacity: number(e.TOTAL_CAPACITY_BYTES, 1_000_000_000, 10_000_000_000),
    maxFile: number(e.MAX_FILE_BYTES, 50_000_000, 90_000_000),
    retention: number(e.RETENTION_SECONDS, 86400, 86400)
  };
}
export function safeName(input: unknown): string {
  if (typeof input !== 'string') fail(400, 'NAME', '請提供檔案名稱。');
  // Intentional removal of control characters from untrusted attachment filenames.
  // eslint-disable-next-line no-control-regex
  const name = input.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069/\\:]/g, '_').trim();
  if (!name || name === '.' || name === '..' || new TextEncoder().encode(name).length > 180) fail(400, 'NAME', '檔名過長或無效。');
  // Block active web content and executables, including disguised double extensions.
  if (/(?:^|\.)(?:html?|xhtml|svg|xml|js|mjs|cjs|exe|dll|com|bat|cmd|ps1|sh|msi|scr|jar|hta|vbs|lnk|url|app|apk)(?:\.|$)/i.test(name)) fail(415, 'FILE_TYPE', 'Beta 期間不接受可執行檔、腳本或主動網頁內容。');
  return name;
}
export async function smallJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON', '需要 JSON 格式。');
  const reader = req.body?.getReader();
  if (!reader) fail(400, 'JSON', '缺少資料。');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); fail(413, 'JSON', '請求資料過大。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  try { const v = JSON.parse(new TextDecoder().decode(bytes)); if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(); return v; }
  catch { fail(400, 'JSON', '資料格式錯誤。'); }
}
export async function rate(e: Env, req: Request, scope: string, limit: number, seconds = 60) {
  if (!e.RATE_LIMIT_SALT || e.RATE_LIMIT_SALT.length < 32) fail(503, 'CONFIG', '服務尚未完成安全設定。');
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  const bucket = Math.floor(now() / seconds);
  const key = await hash(`${e.RATE_LIMIT_SALT}:${ip}:${scope}:${bucket}`);
  const row = await e.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key, (bucket + 2) * seconds).first<{count: number}>();
  if (!row || row.count > limit) fail(429, 'RATE_LIMIT', '操作太頻繁，請稍後再試。');
}
export async function turnstile(e: Env, req: Request, value: unknown) {
  if (!e.TURNSTILE_SECRET_KEY || !e.TURNSTILE_HOSTNAMES) fail(503, 'CONFIG', '驗證服務尚未設定。');
  if (typeof value !== 'string' || !value || value.length > 2048) fail(403, 'TURNSTILE', '請先完成人機驗證。');
  let result: { success?: boolean; hostname?: string; action?: string };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ secret: e.TURNSTILE_SECRET_KEY, response: value, remoteip: req.headers.get('CF-Connecting-IP') || '' })
    });
    if (!res.ok) throw Error(); result = await res.json();
  } catch { fail(503, 'TURNSTILE_UNAVAILABLE', '驗證服務暫時無法使用，請重試。'); }
  if (!result.success || !e.TURNSTILE_HOSTNAMES.split(',').map(s => s.trim()).includes(result.hostname || '') || result.action !== 'upload') fail(403, 'TURNSTILE', '驗證已失效，請重新驗證。');
  // Siteverify replay convergence is eventual; our UNIQUE ledger closes that window.
  const used = await e.DB.prepare('INSERT OR IGNORE INTO turnstile_used(hash,expires_at) VALUES(?,?)').bind(await hash(value), now() + 600).run();
  if (used.meta.changes !== 1) fail(403, 'TURNSTILE', '驗證已使用，請重新驗證。');
}
export async function admin(e: Env, req: Request) {
  await rate(e, req, 'admin', 15);
  const supplied = req.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!e.ADMIN_TOKEN || e.ADMIN_TOKEN.length < 32 || !await equal(supplied, e.ADMIN_TOKEN)) fail(401, 'UNAUTHORIZED', '需要管理員驗證。');
}
