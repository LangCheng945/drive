// Pages requires the literal wrangler.jsonc path. Restore the public example
// even when deployment fails. Never run concurrently with another deploy/build.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const privateConfig = 'wrangler.production.jsonc';
if (!fs.existsSync(privateConfig)) throw new Error('Create wrangler.production.jsonc first; see docs/DEPLOYMENT.md');
const original = fs.readFileSync('wrangler.jsonc');
let code;
try {
  fs.copyFileSync(privateConfig, 'wrangler.jsonc');
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'pages', 'deploy', '.svelte-kit/cloudflare', '--project-name', JSON.parse(fs.readFileSync(privateConfig)).name, '--branch', 'main'], { stdio: 'inherit', env: process.env });
  code = result.status ?? 1;
} finally { fs.writeFileSync('wrangler.jsonc', original); }
process.exitCode = code;
