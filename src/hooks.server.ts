import type { Handle } from '@sveltejs/kit/hooks';
export const handle: Handle = async ({ event, resolve }) => {
  const res = await resolve(event);
  // no-referrer can give navigation form POSTs an opaque/null Origin in Chromium,
  // triggering SvelteKit's CSRF guard. strict-origin never leaks capability paths.
  res.headers.set('Referrer-Policy', event.url.pathname.startsWith('/api/') ? 'no-referrer' : 'strict-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Cache-Control', 'no-store');
  return res;
};

