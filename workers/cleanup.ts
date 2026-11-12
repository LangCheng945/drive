import { cleanup } from '../src/lib/server/storage';
import type { Env } from '../src/lib/server/types';
import type { ScheduledController } from '@cloudflare/workers-types';
export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const result = await cleanup(env);
    console.log(JSON.stringify({ event: 'cleanup', ...result }));
  }
};
