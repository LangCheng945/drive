import type { RequestHandler } from './$types';
import { handle } from '#lib/server/api.ts';
import { env } from 'cloudflare:workers';
const handler: RequestHandler = ({ request }) => {
  if (!env.DB || !env.BUCKET) return Response.json({ message: '請先設定 Cloudflare D1 與 R2 綁定。' }, { status: 503 });
  return handle(request, env);
};
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
