// Local test entry only. Never referenced by either production Wrangler config.
import { handle } from '../src/lib/server/api';
import { cleanup } from '../src/lib/server/storage';
import type { Env } from '../src/lib/server/types';
const upstream = globalThis.fetch;
let failDelete = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    const token = (init?.body as URLSearchParams)?.get('response');
    if (token === 'unreachable') throw new Error('Injected Siteverify outage');
    return Response.json({ success: token !== 'invalid', hostname: token === 'wronghost' ? 'evil.example' : 'localhost', action: token === 'wrongaction' ? 'download' : 'upload' });
  }
  return upstream(input, init);
}) as typeof fetch;
export default {
  async fetch(req: Request, env: Env) {
    if (new URL(req.url).pathname === '/__fault/delete') { failDelete = req.method === 'POST'; return Response.json({ ok: true }); }
    if (failDelete) {
      env = { ...env, BUCKET: new Proxy(env.BUCKET, { get(target, key) {
        if (key === 'delete') return async () => { throw new Error('Injected R2 outage'); };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } }) };
    }
    if (new URL(req.url).pathname === '/__cleanup') return Response.json(await cleanup(env));
    return handle(req, env);
  }
};
