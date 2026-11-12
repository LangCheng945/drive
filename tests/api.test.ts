import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let bucket: Awaited<ReturnType<Miniflare['getR2Bucket']>>;
let ip = 0;
const admin = 'test-administrator-token-with-at-least-32-characters';
const request = (path: string, init?: RequestInit) => mf.dispatchFetch(`http://localhost/api/${path}`, { ...init, headers: { 'CF-Connecting-IP': `192.0.2.${++ip % 250}`, ...init?.headers } });
const post = (path: string, body: unknown) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function reserve(size = 4, mode = 'day', overrides: Record<string, unknown> = {}) {
  const res = await post('uploads', { name: 'hello.txt', size, mode, turnstile: crypto.randomUUID(), ...overrides });
  return { res, data: await res.json() as {upload: string; share: string; manage: string; publicId: string | null; mode: string; visibility: string; error?: string} };
}
async function ready(mode = 'day') {
  const r = await reserve(4, mode);
  expect(r.res.status).toBe(201);
  const up = await request(`uploads/${r.data.upload}`, { method: 'PUT', body: 'test' });
  expect(up.status, await up.text()).toBe(200);
  return r.data;
}
async function occupied() { return (await db.prepare('SELECT occupied FROM storage').first<{occupied: number}>())!.occupied; }
beforeAll(async () => {
  const bundle = await build({ entryPoints: ['tests/fixture-worker.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-11-12', d1Databases: ['DB'], r2Buckets: ['BUCKET'], bindings: {
    ENABLE_UPLOADS: 'true', TOTAL_CAPACITY_BYTES: '1000000000', MAX_FILE_BYTES: '50000000', RETENTION_SECONDS: '86400',
    ADMIN_TOKEN: admin, RATE_LIMIT_SALT: 'test-rate-limit-salt-more-than-32-characters', TURNSTILE_SECRET_KEY: 'test-secret', TURNSTILE_HOSTNAMES: 'localhost'
  } }));
  db = await mf.getD1Database('DB'); bucket = await mf.getR2Bucket('BUCKET');
  for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = (await readFile(`migrations/${file}`, 'utf8')).replace(/--[^\n]*/g, '');
    for (const statement of sql.split(/;\s*(?=CREATE|INSERT|PRAGMA|ALTER|DROP|$)/i).map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
}, 60000);
afterAll(async () => { await mf?.dispose(); });
beforeEach(async () => {
  await mf.dispatchFetch('http://localhost/__fault/delete', { method: 'DELETE' });
  await db.batch(['DELETE FROM reports', 'DELETE FROM files', 'DELETE FROM rate_limits', 'DELETE FROM turnstile_used', 'UPDATE storage SET occupied=0,uploads_disabled=0', "UPDATE maintenance SET cursor=''"].map(sql => db.prepare(sql)));
  const objs = await bucket.list(); for (const o of objs.objects) await bucket.delete(o.key);
});
describe('real workerd + D1 + R2 integration', () => {
  const thumbnail = 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  it('budgets thumbnails, exposes only ready previews and releases them on deletion', async () => {
    const r = await reserve(4, 'day', { thumbnail });
    expect(r.res.status).toBe(201);
    expect(await occupied()).toBe(4 + thumbnail.length);
    expect((await (await request('public')).json() as {files: unknown[]}).files).toHaveLength(0);
    expect((await request(`uploads/${r.data.upload}`, {method:'PUT',body:'test'})).status).toBe(200);
    const list = await (await request('public')).json() as {files: {thumbnail: string}[]};
    expect(list.files[0].thumbnail).toBe(`data:image/webp;base64,${thumbnail}`);
    expect((await request(`manage/${r.data.manage}`, {method:'DELETE'})).status).toBe(200);
    expect(await occupied()).toBe(0);
    expect((await db.prepare('SELECT thumbnail FROM files').first<{thumbnail: string | null}>())!.thumbnail).toBeNull();
  });
  it('includes thumbnail storage in atomic capacity checks', async () => {
    await db.prepare('UPDATE storage SET occupied=?').bind(1000000000 - thumbnail.length - 4).run();
    const results = await Promise.all([reserve(4,'day',{thumbnail}),reserve(4,'day',{thumbnail})]);
    expect(results.map(r => r.res.status).sort()).toEqual([201,507]);
    expect(await occupied()).toBe(1000000000);
  });
  it.each(['not an image','A'.repeat(4100),btoa('<svg/>')])('rejects malformed or oversized thumbnail (%#)', async thumbnail => {
    expect((await reserve(4,'day',{thumbnail})).res.status).toBe(400);
    expect(await occupied()).toBe(0);
  });
  it('uploads, downloads exact bytes with safe headers, privately deletes', async () => {
    const f = await ready(); expect(await occupied()).toBe(4);
    const res = await request(`shares/${f.share}/download`, { method: 'POST' });
    expect(res.status).toBe(200); expect(await res.text()).toBe('test');
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toContain('attachment;');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect((await request(`shares/${f.share}/download`, { method: 'POST' })).status).toBe(200);
    expect((await request(`manage/${f.manage}`, { method: 'DELETE' })).status).toBe(200);
    expect(await occupied()).toBe(0); expect((await bucket.list()).objects.length).toBe(0);
    expect((await request(`shares/${f.share}`)).status).toBe(404);
  });
  it('rejects >50MB on server without reserving', async () => { expect((await reserve(50000001)).res.status).toBe(413); expect(await occupied()).toBe(0); });
  it('rejects when full', async () => { await db.prepare('UPDATE storage SET occupied=1000000000').run(); expect((await reserve()).res.status).toBe(507); });
  it('atomically arbitrates competing capacity reservations', async () => {
    await db.prepare('UPDATE storage SET occupied=999999994').run();
    const res = await Promise.all([reserve(), reserve()]);
    expect(res.map(r => r.res.status).sort()).toEqual([201,507]); expect(await occupied()).toBe(999999998);
  });
  it.each(['te', 'test-too-long'])('rejects actual length mismatch (%s) and releases space', async body => {
    const r = await reserve(); const up = await request(`uploads/${r.data.upload}`, { method: 'PUT', body });
    expect(up.status).toBe(400); expect(await occupied()).toBe(0); expect((await bucket.list()).objects).toHaveLength(0);
  });
  it('rejects unknown-length overflow through FixedLengthStream', async () => {
    const r = await reserve();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('toolong')); c.close(); } });
    const res = await request(`uploads/${r.data.upload}`, { method: 'PUT', body: stream, duplex: 'half' } as RequestInit);
    expect(res.status).toBe(400); expect(await occupied()).toBe(0);
  });
  it('expires immediately before background cleanup', async () => {
    const f = await ready(); await db.prepare('UPDATE files SET expires_at=1').run();
    expect((await request(`shares/${f.share}/download`, { method: 'POST' })).status).toBe(404);
    await mf.dispatchFetch('http://localhost/__cleanup'); expect(await occupied()).toBe(0);
  });
  it('grants exactly one concurrent claim; GET cannot consume it', async () => {
    const f = await ready('once');
    expect((await request(`shares/${f.share}`)).status).toBe(200);
    expect((await request(`shares/${f.share}/download`)).status).toBe(404);
    const responses = await Promise.all(Array.from({length: 8}, () => request(`shares/${f.share}/download`, { method: 'POST' })));
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    for (const r of responses) await r.text();
    expect((await request(`shares/${f.share}`)).status).toBe(404);
    expect((await post(`shares/${f.share}/report`,{reason:'report after once-only claim'})).status).toBe(200);
    await db.prepare('UPDATE files SET delete_after=1').run(); await mf.dispatchFetch('http://localhost/__cleanup'); expect(await occupied()).toBe(0);
  });
  it('cleans abandoned reservations and is idempotent', async () => {
    await reserve(); await db.prepare('UPDATE files SET lease_until=1').run();
    await mf.dispatchFetch('http://localhost/__cleanup'); await mf.dispatchFetch('http://localhost/__cleanup'); expect(await occupied()).toBe(0);
  });
  it('never reuses upload capability', async () => { const f = await ready(); expect((await request(`uploads/${f.upload}`, {method:'PUT', body:'test'})).status).toBe(404); });
  it('blocks invalid challenges, replay and active file types without requiring an invitation', async () => {
    expect((await reserve(4,'day',{turnstile:'invalid'})).res.status).toBe(403);
    expect((await reserve(4,'day',{turnstile:'wronghost'})).res.status).toBe(403);
    expect((await reserve(4,'day',{turnstile:'wrongaction'})).res.status).toBe(403);
    expect((await reserve(4,'day',{turnstile:'unreachable'})).res.status).toBe(503);
    expect((await reserve(4,'day',{name:'payload.html.txt'})).res.status).toBe(415);
    const t = crypto.randomUUID(); expect((await reserve(4,'day',{turnstile:t})).res.status).toBe(201); expect((await reserve(4,'day',{turnstile:t})).res.status).toBe(403);
  });
  it('limits requests and rejects cross origin writes', async () => {
    const responses = [];
    for (let i=0; i<6; i++) responses.push(await request('uploads', { method:'POST', headers:{'CF-Connecting-IP':'198.51.100.1','Content-Type':'application/json'},body:'{}' }));
    expect(responses.at(-1)?.status).toBe(429);
    expect((await request('uploads',{method:'POST',headers:{Origin:'https://evil.example'}})).status).toBe(403);
  });
  it('authenticates admin and kill switch preserves downloads', async () => {
    const f = await ready();
    expect((await post('admin/uploads',{disabled:true})).status).toBe(401);
    expect((await request('admin/uploads',{method:'POST',headers:{Authorization:`Bearer ${admin}`,'Content-Type':'application/json'},body:'{"disabled":true}'})).status).toBe(200);
    expect((await reserve()).res.status).toBe(503); expect((await request(`shares/${f.share}/download`,{method:'POST'})).status).toBe(200);
  });
  it('repairs missing R2 objects only while paused; releases exactly once', async () => {
    await ready(); const obj = (await bucket.list()).objects[0]; await bucket.delete(obj.key);
    const call = () => request('admin/repair',{method:'POST',headers:{Authorization:`Bearer ${admin}`,'Content-Type':'application/json'},body:'{}'});
    expect((await call()).status).toBe(409); await db.prepare('UPDATE storage SET uploads_disabled=1').run();
    expect((await call()).status).toBe(200); expect(await occupied()).toBe(0); await call(); expect(await occupied()).toBe(0);
  });
  it('accepts reports and exposes them only to admin', async () => {
    const f = await ready(); expect((await post(`shares/${f.share}/report`,{reason:'suspected malicious content'})).status).toBe(200);
    expect((await request('admin/reports')).status).toBe(401);
    const res = await request('admin/reports',{headers:{Authorization:`Bearer ${admin}`}}); expect((await res.json() as unknown[])).toHaveLength(1);
  });
  it('retains occupied bytes on R2 delete failure then retries safely', async () => {
    const f = await ready();
    await mf.dispatchFetch('http://localhost/__fault/delete', { method:'POST' });
    expect((await request(`manage/${f.manage}`, {method:'DELETE'})).status).toBe(503);
    expect(await occupied()).toBe(4); expect((await request(`shares/${f.share}`)).status).toBe(404);
    await mf.dispatchFetch('http://localhost/__fault/delete', {method:'DELETE'});
    await db.prepare('UPDATE files SET delete_after=1').run();
    await mf.dispatchFetch('http://localhost/__cleanup'); expect(await occupied()).toBe(0);
    await mf.dispatchFetch('http://localhost/__cleanup'); expect(await occupied()).toBe(0);
  });
  it('removes late objects for tombstoned uploads without double release', async () => {
    const f = await ready(); const row = await db.prepare('SELECT id FROM files').first<{id:string}>();
    await request(`manage/${f.manage}`,{method:'DELETE'});
    await bucket.put(`files/${row!.id}`, 'late');
    await mf.dispatchFetch('http://localhost/__cleanup'); expect(await occupied()).toBe(0); expect((await bucket.list()).objects).toHaveLength(0);
  });
  it('accepts a full 50 MB file and checks stored bytes without buffering in Worker', async () => {
    const r = await reserve(50000000); expect(r.res.status).toBe(201);
    const res = await request(`uploads/${r.data.upload}`, {method:'PUT',body:new Uint8Array(50000000)});
    expect(res.status,await res.text()).toBe(200); expect(await occupied()).toBe(50000000);
    expect((await bucket.list()).objects[0].size).toBe(50000000);
  });
  it('expires upload and management tokens, including short retention', async () => {
    const r = await reserve(); await db.prepare('UPDATE files SET expires_at=1').run();
    expect((await request(`uploads/${r.data.upload}`,{method:'PUT',body:'test'})).status).toBe(404);
    expect((await request(`manage/${r.data.manage}`)).status).toBe(404);
    await db.prepare('UPDATE files SET lease_until=1').run(); await mf.dispatchFetch('http://localhost/__cleanup'); expect(await occupied()).toBe(0);
  });
  it('rejects unknown-length truncated uploads and frees reservation', async () => {
    const r=await reserve();
    const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('te'));c.close();}});
    expect((await request(`uploads/${r.data.upload}`,{method:'PUT',body:stream,duplex:'half'} as RequestInit)).status).toBe(400);
    expect(await occupied()).toBe(0);
  });
  it('allows exactly one concurrent replayed Turnstile reservation', async () => {
    const t=crypto.randomUUID();const results=await Promise.all(Array.from({length:5},()=>reserve(4,'day',{turnstile:t})));
    expect(results.filter(r=>r.res.status===201)).toHaveLength(1);expect(await occupied()).toBe(4);
  });
  it('defaults to public and 24h without an invitation; lists only completed uploads', async () => {
    const r = await reserve(4, 'day', { mode: undefined, visibility: undefined });
    expect(r.res.status).toBe(201); expect(r.data.mode).toBe('day'); expect(r.data.visibility).toBe('public');
    expect((await (await request('public')).json() as {files: unknown[]}).files).toHaveLength(0);
    expect((await request(`uploads/${r.data.upload}`, {method:'PUT',body:'test'})).status).toBe(200);
    const listing = await (await request('public')).json() as {files: {publicId: string}[]};
    expect(listing.files.map(f=>f.publicId)).toEqual([r.data.publicId]);
    for (const secret of [r.data.share,r.data.manage,r.data.upload]) expect(JSON.stringify(listing)).not.toContain(secret);
    expect((await request(`public/${r.data.publicId}`)).status).toBe(200);
  });
  it('keeps explicit unlisted files out of public metadata and downloads', async () => {
    const r=await reserve(4,'day',{visibility:'unlisted'}); expect(r.data.publicId).toBeNull();
    await request(`uploads/${r.data.upload}`,{method:'PUT',body:'test'});
    expect((await (await request('public')).json() as {files: unknown[]}).files).toHaveLength(0);
    expect((await request(`public/${r.data.share}`)).status).toBe(404);
    expect((await request(`public/${r.data.share}/download`,{method:'POST'})).status).toBe(404);
    const download=await request(`shares/${r.data.share}/download`,{method:'POST'});expect(await download.text()).toBe('test');
  });
  it('removes expired and deleted files from public access immediately', async () => {
    const f=await ready(); await db.prepare('UPDATE files SET expires_at=1').run();
    expect((await (await request('public')).json() as {files: unknown[]}).files).toHaveLength(0);
    expect((await request(`public/${f.publicId}/download`,{method:'POST'})).status).toBe(404);
    await db.prepare('UPDATE files SET expires_at=?').bind(Math.floor(Date.now()/1000)+100).run();
    await request(`manage/${f.manage}`,{method:'DELETE'});
    expect((await request(`public/${f.publicId}`)).status).toBe(404);
    expect((await (await request('public')).json() as {files: unknown[]}).files).toHaveLength(0);
  });
  it('arbitrates a once-only claim across public and private download paths', async () => {
    const f=await ready('once');
    const responses=await Promise.all(Array.from({length:8},(_,i)=>request(`${i%2?'public/'+f.publicId:'shares/'+f.share}/download`,{method:'POST'})));
    expect(responses.filter(r=>r.status===200)).toHaveLength(1);for(const r of responses)await r.text();
    expect((await (await request('public')).json() as {files: unknown[]}).files).toHaveLength(0);
    expect((await post(`public/${f.publicId}/report`,{reason:'report public claimed file'})).status).toBe(200);
  });
  it('validates public-list cursors and visibility values', async () => {
    expect((await reserve(4,'day',{visibility:'invalid'})).res.status).toBe(400);
    expect((await request('public?before=not-a-cursor')).status).toBe(400);
  });
  it('paginates public files without duplicate or missing handles', async () => {
    const uploaded=await Promise.all(Array.from({length:23},()=>ready()));
    const first=await (await request('public')).json() as {files:{publicId:string}[];nextCursor:string};
    expect(first.files).toHaveLength(20);expect(first.nextCursor).toBeTruthy();
    const second=await (await request(`public?before=${encodeURIComponent(first.nextCursor)}`)).json() as {files:{publicId:string}[];nextCursor:null};
    expect(second.files).toHaveLength(3);expect(second.nextCursor).toBeNull();
    const ids=[...first.files,...second.files].map(f=>f.publicId);
    expect(new Set(ids).size).toBe(23);expect(ids.sort()).toEqual(uploaded.map(f=>f.publicId).sort());
  });
  it('preserves the unlisted database default for legacy-format records', async () => {
    const t=Math.floor(Date.now()/1000);
    await db.prepare("INSERT INTO files(id,share_hash,manage_hash,upload_hash,name,size,mode,state,created_at,expires_at,lease_until,delete_after) VALUES('legacy','old-share','old-manage','old-upload','legacy.txt',4,'day','ready',?,?,?,?)").bind(t,t+100,t+100,t+100).run();
    const row=await db.prepare("SELECT visibility,public_id FROM files WHERE id='legacy'").first<{visibility:string;public_id:null}>();
    expect(row).toEqual({visibility:'unlisted',public_id:null});
    expect((await (await request('public')).json() as {files:unknown[]}).files).toHaveLength(0);
  });
});
