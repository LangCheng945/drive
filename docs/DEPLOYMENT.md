# Cloudflare deployment / 部署指南

Use your own Cloudflare account and resources. Commands below use Wrangler from the project's lockfile (`npx wrangler`); no external server or database is needed. Pages hosts SvelteKit's generated Worker; a second small Worker supplies the Cron trigger because Pages does not schedule Cron itself.

## 1. Install and authenticate

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

For a remote environment use `npx wrangler login --device`. Do not paste credentials into issue reports or commit them. CI deployment, if added, should use a scoped Cloudflare API token in GitHub Actions secrets. The included CI validates only; it never deploys a pull request with production credentials.

## 2. Create isolated resources

```sh
npx wrangler d1 create drive-db
npx wrangler r2 bucket create langcheng-drive-files
npx wrangler pages project create langcheng-drive --production-branch main
```

Wrangler 4.160 may delegate a **new** Pages project to Workers. If it reports that delegation failed and explicitly suggests the legacy Pages path, create with `--force` once. After creation, do not pass `--force`; existing projects use Pages directly. SvelteKit 3's current adapter uses `cloudflare:workers` env exports, rather than `event.platform.env`.

Use unique names if these already exist in your account. Copy the returned database UUID into **both** `wrangler.jsonc` and `wrangler.cleanup.jsonc`. Match `database_name` and `bucket_name` in both files. Keep the binding names `DB` and `BUCKET`. Do not enable R2 `r2.dev` public access or attach a public bucket domain. Do not attach an R2 lifecycle rule that removes active files independently of D1.

You may instead copy the configs to ignored `wrangler.production.jsonc` and `wrangler.cleanup.production.jsonc` so the public examples retain placeholders. D1 and Worker commands accept `--config`. Pages requires the literal `wrangler.jsonc` path: use `node scripts/deploy-production.mjs` to stage the private config for deployment and restore the public example afterward. Keep copies in the project root. Do not run this helper concurrently with a build/deployment.

```sh
npx wrangler d1 migrations apply drive-db --remote
```

This applies schema before serving requests. Back up existing deployments with D1 Time Travel/export before future schema changes.

## 3. Turnstile

Create a **Managed** Turnstile widget restricted to your real hostname, including your Pages production hostname if you want to use it. Dashboard or current Wrangler CLI:

```sh
npx wrangler turnstile widget create --help
```

Use the help output's current domain/mode options (the CLI is alpha). Save the public site key in `vars.TURNSTILE_SITE_KEY`. Set `TURNSTILE_HOSTNAMES` to comma-separated allowed hosts, e.g. `drive.langcheng.uk,langcheng-drive.pages.dev`. The server additionally requires action `upload`; the widget component sends it. Do not enable test/dummy keys on production. No bypass flag is provided.

## 4. Secrets

Generate independent cryptographically random values (32 bytes or more) with your password manager or a local cryptographic tool. Keep admin and rate-limit secrets distinct. Configure Pages secrets interactively; values are not command arguments:

```sh
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name langcheng-drive
npx wrangler pages secret put BETA_INVITE_CODE --project-name langcheng-drive
npx wrangler pages secret put ADMIN_TOKEN --project-name langcheng-drive
npx wrangler pages secret put RATE_LIMIT_SALT --project-name langcheng-drive
```

The cleanup Worker needs only DB/R2 bindings, no admin/Turnstile secrets. Keep `ENABLE_UPLOADS=false` for the first deployment. Ensure preview deployments use **separate** databases, buckets, invitations, Turnstile hosts and secrets; never give an untrusted pull request production bindings.

## 5. Validate and deploy

```sh
npm run lint
npm run check
npm test
npm run build
npx wrangler pages deploy .svelte-kit/cloudflare --project-name langcheng-drive --branch main
npx wrangler deploy --config wrangler.cleanup.jsonc
```

The Cron runs every five minutes, processes up to six eligible deletions per invocation, and walks three R2 objects for orphan/tombstone cleanup. Backlogs drain over later invocations. Check `npx wrangler tail langcheng-drive-cleanup` for results. When a backlog is unusually large, invoke authenticated cleanup in controlled batches; do not remove the capacity ledger manually.

## 6. Domain and launch

Attach `drive.langcheng.uk` in Pages → Custom domains and follow Cloudflare DNS/certificate setup. Do not point the domain at R2. Forks should use their own domain. Confirm HTTPS and the Turnstile hostname allowlist before enabling uploads.

Check `/api/status`, an upload, downloaded bytes, one-time concurrent claims, private deletion, expiry and cleanup in a dedicated staging deployment. Use the backend upload switch to pause during a problem. Then set `ENABLE_UPLOADS=true`, deploy Pages again and confirm the D1 switch is also enabled. Keep the invitation private.

## Free-plan boundaries

R2 free allowances and account billing activation are separate from Workers Free. The app's 1 GB logical budget does not cap operation fees, databases, logs, unrelated buckets or already-running physical transfers. Set usage notifications and monitor the account. D1 rate buckets themselves consume writes. Free limits may change; consult the linked official documentation rather than treating these notes as a billing guarantee.

The app streams 50 MB instead of buffering it. Files take one R2 PUT; each download takes a GET. Cron uses bounded work to stay below request/subrequest and CPU budgets. Local tests cannot prove production CPU use for every network/chunk pattern; benchmark 50 MB in staging and monitor actual Cloudflare metrics before widening beta.

Official references and verification date: [REFERENCES.md](REFERENCES.md).
