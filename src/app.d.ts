import type { Env } from './lib/server/types';
import type { ExecutionContext } from '@cloudflare/workers-types';
declare global {
  namespace App {
    interface Platform { env: Env; context: ExecutionContext }
  }
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}
export {};
