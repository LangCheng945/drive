import type { Env, FileRow } from './types';
import type { ReadableStream as WorkerReadableStream } from '@cloudflare/workers-types';
import { admin, ApiError, equal, fail, hash, now, rate, safeName, settings, smallJson, token, turnstile, validToken } from './security';
import { cleanup, publicFile, removeFile } from './storage';
import { decodePreviewText, previewKind, previewMime, validPreviewHeader } from './preview';

const json = (v: unknown, status = 200) => Response.json(v, { status });
declare const FixedLengthStream: { new (size: number): { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> } };
function unavailable(): never { return fail(404, 'UNAVAILABLE', '連結不存在、已到期或已被領取。'); }
async function enabled(e: Env) {
  const s = await e.DB.prepare('SELECT uploads_disabled FROM storage WHERE id=1').first<{uploads_disabled: number}>();
  return e.ENABLE_UPLOADS === 'true' && s?.uploads_disabled === 0;
}
async function reserve(req: Request, e: Env) {
  await rate(e, req, 'upload', 5);
  if (!await enabled(e)) fail(503, 'UPLOADS_DISABLED', '管理員暫時關閉了上傳，現有分享仍可使用。');
  const b = await smallJson(req), cfg = settings(e);
  if (!e.BETA_INVITE_CODE || typeof b.invite !== 'string' || !await equal(b.invite, e.BETA_INVITE_CODE)) fail(403, 'INVITE', 'Limited Beta：請輸入有效邀請碼。');
  const name = safeName(b.name), size = b.size;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) fail(400, 'SIZE', '請選擇非空白檔案。');
  if (size > cfg.maxFile) fail(413, 'TOO_LARGE', '檔案超過單檔大小上限。');
  if (b.mode !== 'once' && b.mode !== 'day') fail(400, 'MODE', '請選擇分享模式。');
  await turnstile(e, req, b.turnstile);
  const share = token(), manage = token(), upload = token(), id = crypto.randomUUID(), t = now();
  const [sh, mh, uh] = await Promise.all([hash(share), hash(manage), hash(upload)]);
  // Predicate and insertion are one statement on D1's primary. The INSERT trigger
  // updates the singleton ledger before any competing INSERT can run.
  const result = await e.DB.prepare(`INSERT INTO files(id,share_hash,manage_hash,upload_hash,name,size,mode,state,created_at,expires_at,lease_until,delete_after)
    SELECT ?,?,?,?,?,?,?,'reserved',?,?,?,? FROM storage WHERE id=1 AND uploads_disabled=0 AND occupied+?<=? RETURNING id`)
    .bind(id, sh, mh, uh, name, size, b.mode, t, t + cfg.retention, t + 900, t + 900, size, cfg.capacity).first();
  if (!result) fail(507, 'CAPACITY', '目前共用空間不足或上傳已關閉，請稍後再試。');
  return json({ upload, share, manage, expiresAt: t + cfg.retention }, 201);
}
async function upload(req: Request, e: Env, secret: string) {
  if (!validToken(secret)) unavailable();
  if (!await enabled(e)) fail(503, 'UPLOADS_DISABLED', '上傳暫停，預留空間將自動釋放。');
  const row = await e.DB.prepare("UPDATE files SET state='uploading' WHERE upload_hash=? AND state='reserved' AND lease_until>? AND expires_at>? RETURNING *").bind(await hash(secret), now(), now()).first<FileRow>();
  if (!row) unavailable();
  const length = req.headers.get('content-length');
  try {
    if (!req.body || (length !== null && (!/^\d+$/.test(length) || Number(length) !== row.size))) fail(400, 'LENGTH', '檔案長度不符。');
    const fixed = new FixedLengthStream(row.size);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      // Attach both handlers immediately. FixedLengthStream rejects under/overflow;
      // Promise.allSettled waits for R2 to stop before attempting deletion.
      const results = await Promise.allSettled([
        req.body.pipeTo(fixed.writable, { signal: controller.signal }),
        e.BUCKET.put(`files/${row.id}`, fixed.readable as unknown as WorkerReadableStream, { httpMetadata: { contentType: 'application/octet-stream' } })
      ]);
      const put = results[1];
      if (results[0].status !== 'fulfilled' || put.status !== 'fulfilled' || !put.value || put.value.size !== row.size) fail(400, 'LENGTH', '上傳中斷或實際大小不符，請重新選擇檔案。');
    } finally { clearTimeout(timer); }
    const result = await e.DB.prepare("UPDATE files SET state='ready',delete_after=expires_at WHERE id=? AND state='uploading' AND lease_until>? AND expires_at>?").bind(row.id, now(), now()).run();
    if (result.meta.changes !== 1) fail(410, 'EXPIRED', '上傳工作已到期，請重試。');
    return json({ ok: true, size: row.size, expiresAt: row.expires_at });
  } catch (err) {
    await e.DB.prepare("UPDATE files SET state='deleting',delete_after=? WHERE id=? AND state IN ('reserved','uploading','ready')").bind(now(), row.id).run();
    try { await removeFile(e, row.id); } catch { /* counted until cron retries */ }
    throw err;
  }
}
async function download(req: Request, e: Env, secret: string) {
  await rate(e, req, 'download', 30);
  if (!validToken(secret)) unavailable();
  const sh = await hash(secret), row = await publicFile(e, sh);
  if (!row) unavailable();
  const object = await e.BUCKET.get(`files/${row.id}`);
  if (!object || object.size !== row.size) {
    await removeFile(e, row.id); unavailable();
  }
  if (row.mode === 'once') {
    const won = await e.DB.prepare("UPDATE files SET state='claimed',delete_after=? WHERE id=? AND state='ready' AND expires_at>? RETURNING id").bind(now() + 300, row.id, now()).first();
    if (!won) { await object.body.cancel(); unavailable(); }
  } else {
    // Recheck after R2 read so expiry/admin deletion during the await denies access.
    if (!await publicFile(e, sh)) { await object.body.cancel(); unavailable(); }
  }
  const filename = encodeURIComponent(row.name).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(object.body as unknown as ReadableStream<Uint8Array>, { headers: {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${filename}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "sandbox; default-src 'none'", 'Accept-Ranges': 'none'
  } });
}
async function preview(req: Request, e: Env, secret: string) {
  await rate(e, req, 'preview', 20);
  if (!validToken(secret)) unavailable();
  const sh = await hash(secret), row = await publicFile(e, sh);
  // Once-only shares cannot expose file contents without consuming their claim.
  const kind = row ? previewKind(row.name, row.size, row.mode) : null;
  if (!row || !kind) unavailable();
  const mime = previewMime(row.name, kind);
  const key = `files/${row.id}`;
  let body: ReadableStream<Uint8Array> | string;
  let payloadSize = row.size;

  if (kind === 'text') {
    // Plain text is capped at 256 KB and decoded on the server with strict UTF-8.
    // It is NEVER interpreted as HTML, JavaScript or Markdown.
    const object = await e.BUCKET.get(key);
    if (!object || object.size !== row.size) {
      if (object) await object.body.cancel();
      unavailable();
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== row.size) unavailable();
    const decoded = decodePreviewText(bytes);
    if (decoded === null) unavailable();
    body = decoded;
    payloadSize = new TextEncoder().encode(decoded).length;
  } else {
    // Verify the actual header before streaming an image or a PDF.
    const prefix = await e.BUCKET.get(key, { range: { offset: 0, length: 16 } });
    if (!prefix || prefix.size !== row.size) unavailable();
    const bytes = new Uint8Array(await prefix.arrayBuffer());
    if (!validPreviewHeader(mime, bytes)) unavailable();
    const object = await e.BUCKET.get(key);
    if (!object || object.size !== row.size) {
      if (object) await object.body.cancel();
      unavailable();
    }
    body = object.body as unknown as ReadableStream<Uint8Array>;
  }

  // An expired, deleted or consumed link must never be reopened during R2 I/O.
  if (!await publicFile(e, sh)) {
    if (typeof body !== 'string') await body.cancel();
    unavailable();
  }
  const headers = new Headers({
    'Content-Type': mime,
    'Content-Length': String(payloadSize),
    'Content-Disposition': 'inline; filename="preview"',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "sandbox; default-src 'none'; object-src 'none'; frame-ancestors 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  // PDF must be frameable by the same-origin sandboxed iframe on the share page.
  // Every other preview type remains non-frameable.
  if (kind !== 'pdf') headers.set('X-Frame-Options', 'DENY');
  return new Response(body, { headers });
}
async function repair(e: Env, req: Request) {
  if (await enabled(e)) fail(409, 'PAUSE_FIRST', '請先關閉上傳再執行修復。');
  const active = await e.DB.prepare("SELECT id FROM files WHERE state IN ('reserved','uploading') AND lease_until>? LIMIT 1").bind(now()).first();
  if (active) fail(409, 'IN_FLIGHT', '請等待所有上傳預留到期（最多 15 分鐘）。');
  const b = await smallJson(req);
  const after = typeof b.after === 'string' ? b.after : '';
  const rows = await e.DB.prepare("SELECT * FROM files WHERE id>? AND state!='deleted' ORDER BY id LIMIT 5").bind(after).all<FileRow>();
  for (const row of rows.results) {
    const obj = await e.BUCKET.head(`files/${row.id}`);
    if (!obj || obj.size !== row.size || row.state === 'reserved' || row.state === 'uploading') {
      await e.DB.prepare("UPDATE files SET state='deleting',delete_after=? WHERE id=? AND state!='deleted'").bind(now(), row.id).run();
      await removeFile(e, row.id);
    }
  }
  await e.DB.prepare("UPDATE storage SET occupied=(SELECT COALESCE(SUM(size),0) FROM files WHERE state!='deleted') WHERE id=1").run();
  return json({ after: rows.results.at(-1)?.id ?? null, done: rows.results.length < 5 });
}
export async function handle(req: Request, e: Env): Promise<Response> {
  try {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.get('origin');
      if ((origin && origin !== url.origin) || req.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'ORIGIN', '不允許跨網站請求。');
    }
    let response: Response;
    if (path[0] === 'status' && req.method === 'GET') {
      const cfg = settings(e), s = await e.DB.prepare('SELECT occupied,uploads_disabled FROM storage WHERE id=1').first<{occupied: number; uploads_disabled: number}>();
      response = json({ ...cfg, occupied: s?.occupied ?? cfg.capacity, uploadsEnabled: await enabled(e), siteKey: e.TURNSTILE_SITE_KEY || '', beta: true });
    } else if (path[0] === 'uploads' && path.length === 1 && req.method === 'POST') response = await reserve(req, e);
    else if (path[0] === 'uploads' && path.length === 2 && req.method === 'PUT') response = await upload(req, e, path[1]);
    else if (path[0] === 'shares' && path.length === 2 && req.method === 'GET') {
      await rate(e, req, 'lookup', 60);
      const row = validToken(path[1]) ? await publicFile(e, await hash(path[1])) : null;
      if (!row) unavailable();
      response = json({ name: row.name, size: row.size, mode: row.mode, expiresAt: row.expires_at, previewable: previewKind(row.name, row.size, row.mode) !== null, previewKind: previewKind(row.name, row.size, row.mode) });
    } else if (path[0] === 'shares' && path[2] === 'preview' && path.length === 3 && req.method === 'GET') response = await preview(req, e, path[1]);
    else if (path[0] === 'shares' && path[2] === 'download' && path.length === 3 && req.method === 'POST') response = await download(req, e, path[1]);
    else if (path[0] === 'shares' && path[2] === 'report' && path.length === 3 && req.method === 'POST') {
      await rate(e, req, 'report', 3, 3600);
      // Recipients can report a once-only file after claiming it; this never
      // restores download authorization or reveals another file's metadata.
      const row = validToken(path[1]) ? await e.DB.prepare("SELECT id FROM files WHERE share_hash=? AND state IN ('ready','claimed') AND expires_at>?").bind(await hash(path[1]), now()).first<{id: string}>() : null;
      if (!row) unavailable();
      const b = await smallJson(req);
      if (typeof b.reason !== 'string' || b.reason.trim().length < 5 || b.reason.length > 1000) fail(400, 'REASON', '請輸入 5–1000 字的檢舉原因。');
      await e.DB.prepare('INSERT INTO reports(id,file_id,reason,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), row.id, b.reason.trim(), now()).run();
      response = json({ ok: true });
    } else if (path[0] === 'manage' && path.length === 2 && ['GET','DELETE'].includes(req.method)) {
      await rate(e, req, 'manage', 30);
      const row = validToken(path[1]) ? await e.DB.prepare('SELECT * FROM files WHERE manage_hash=? AND expires_at>?').bind(await hash(path[1]), now()).first<FileRow>() : null;
      if (!row) unavailable();
      if (req.method === 'DELETE') { if (row.state === 'uploading') fail(409, 'IN_FLIGHT', '上傳仍在進行，請稍後再試。'); await removeFile(e, row.id); response = json({ ok: true }); }
      else response = json({ name: row.name, size: row.size, state: row.state, expiresAt: row.expires_at });
    } else if (path[0] === 'admin') {
      await admin(e, req);
      if (path[1] === 'uploads' && req.method === 'POST') {
        const b = await smallJson(req); if (typeof b.disabled !== 'boolean') fail(400, 'SETTING', 'disabled 必須為布林值。');
        await e.DB.prepare('UPDATE storage SET uploads_disabled=? WHERE id=1').bind(b.disabled ? 1 : 0).run(); response = json({ disabled: b.disabled });
      } else if (path[1] === 'reports' && req.method === 'GET') response = json((await e.DB.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 50').all()).results);
      else if (path[1] === 'files' && path[2] && req.method === 'DELETE') { await removeFile(e, path[2]); response = json({ ok: true }); }
      else if (path[1] === 'cleanup' && req.method === 'POST') response = json(await cleanup(e));
      else if (path[1] === 'repair' && req.method === 'POST') response = await repair(e, req);
      else unavailable();
    } else unavailable();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store'); headers.set('Referrer-Policy', 'no-referrer'); headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  } catch (err) {
    const known = err instanceof ApiError;
    if (!known) console.error('API operation failed', err instanceof Error ? err.name : 'unknown');
    return Response.json({ error: known ? err.code : 'INTERNAL', message: known ? err.message : '服務暫時無法完成操作，請稍後重試。' }, {
      status: known ? err.status : 503, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...(known && err.status === 429 ? { 'Retry-After': '60' } : {}) }
    });
  }
}
