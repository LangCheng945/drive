import type { Env, FileRow } from './types';
import { now } from './security';
export async function removeFile(e: Env, id: string): Promise<void> {
  // Never free bytes before R2 confirms removal. Concurrent calls are idempotent.
  await e.DB.prepare("UPDATE files SET state='deleting',delete_after=? WHERE id=? AND state NOT IN ('deleted','uploading')").bind(now(), id).run();
  const row = await e.DB.prepare('SELECT state FROM files WHERE id=?').bind(id).first<{state: string}>();
  if (!row || !['deleting', 'deleted'].includes(row.state)) return;
  try {
    await e.BUCKET.delete(`files/${id}`);
    await e.DB.prepare("UPDATE files SET state='deleted',deleted_at=?,cleanup_error=0,thumbnail=NULL WHERE id=? AND state='deleting'").bind(now(), id).run();
  } catch {
    await e.DB.prepare('UPDATE files SET cleanup_error=cleanup_error+1,delete_after=? WHERE id=?').bind(now() + 300, id).run();
    throw new Error('Object deletion pending; capacity remains reserved');
  }
}
export async function cleanup(e: Env) {
  const t = now();
  // Uploads time out at 120s. Lease expiry is 15min; retain tombstones for late writes.
  await e.DB.prepare("UPDATE files SET state='deleting',delete_after=? WHERE (state IN ('reserved','uploading') AND lease_until<=?) OR (state='ready' AND expires_at<=?) OR (state='claimed' AND delete_after<=?)").bind(t, t, t, t).run();
  const rows = await e.DB.prepare("SELECT id FROM files WHERE state='deleting' AND delete_after<=? ORDER BY delete_after LIMIT 6").bind(t).all<{id: string}>();
  let removed = 0;
  for (const r of rows.results) { try { await removeFile(e, r.id); removed++; } catch { /* retry next cron */ } }
  await e.DB.batch([
    e.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(t),
    e.DB.prepare('DELETE FROM turnstile_used WHERE expires_at<?').bind(t),
    e.DB.prepare('DELETE FROM reports WHERE created_at<?').bind(t - 30 * 86400)
  ]);
  // Bounded cursor walk also removes orphan objects and late writes to tombstones.
  // Never remove an untracked fresh object; allow an hour for diagnostics/recovery.
  const scan = await e.DB.prepare('SELECT cursor FROM maintenance WHERE id=1').first<{cursor: string}>();
  const objects = await e.BUCKET.list({ prefix: 'files/', limit: 3, ...(scan?.cursor ? { cursor: scan.cursor } : {}) });
  for (const obj of objects.objects) {
    const record = await e.DB.prepare('SELECT state FROM files WHERE id=?').bind(obj.key.slice(6)).first<{state: string}>();
    if (record?.state === 'deleted' || (!record && obj.uploaded.getTime() < (t - 3600) * 1000)) await e.BUCKET.delete(obj.key);
  }
  await e.DB.prepare('UPDATE maintenance SET cursor=? WHERE id=1').bind(objects.truncated ? objects.cursor : '').run();
  return { removed, scanned: rows.results.length };
}
export async function publicFile(e: Env, hash: string) {
  return e.DB.prepare("SELECT * FROM files WHERE share_hash=? AND state='ready' AND expires_at>?").bind(hash, now()).first<FileRow>();
}
export async function listedFile(e: Env, handle: string) {
  return e.DB.prepare("SELECT * FROM files WHERE public_id=? AND visibility='public' AND state='ready' AND expires_at>?").bind(handle, now()).first<FileRow>();
}
