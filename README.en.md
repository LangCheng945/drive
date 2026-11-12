# LangCheng Drive

**Temporary file sharing, no account required.** A working file exchange built with SvelteKit, TypeScript, Tailwind CSS, Cloudflare Pages, private R2, D1 and Turnstile. **v0.1.0 · Limited Beta**

[繁體中文](README.md) · [Deployment](docs/DEPLOYMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Operations](docs/OPERATIONS.md)

Planned domain: <https://drive.langcheng.uk>. Repository: <https://github.com/LangCheng945/drive>.

## What works

- Real streamed file storage, downloads and private deletion; no public object URLs or file listing.
- One-time transfer: a conditional D1 write grants exactly one claim. Interrupted downloads still consume the claim. GET previews never claim.
- 24-hour sharing: repeated downloads until expiry, immediate authorization expiry and eventual background object deletion.
- Global 1,000,000,000-byte capacity, 50,000,000-byte files, configurable retention up to 86,400 seconds.
- Atomic reservations, FixedLengthStream enforcement, stale-upload cleanup, retryable deletion, orphan scans and admin repair.
- Server-verified Turnstile, invitation code, persistent rate limits, administrator upload switch and abuse reports.
- Responsive Traditional Chinese UI, light/dark themes, centered/compact uploader layouts, real progress and retry, in-memory recent transfers, QR codes and separate management capabilities. English message infrastructure is reserved; a complete language switcher is not included.

## Run locally

Use Node.js 22.17 or newer and npm:

```sh
git clone https://github.com/LangCheng945/drive.git
cd drive
npm ci
cp .env.example .dev.vars
npm run db:local
npm run dev
```

Set independent 32+ character `ADMIN_TOKEN` and `RATE_LIMIT_SALT` secrets. Create a separate Managed Turnstile development widget permitting `localhost` and `127.0.0.1`; put its real site key and secret in `.dev.vars`. Enter the configured `BETA_INVITE_CODE` in the upload form. Official dummy keys omit action and return example.com, so they cannot pass this app's strict validation. Offline integration tests mock Siteverify and need no real keys. Local D1/R2 are emulated, not production resources. Use `npm run build && npm run preview` for the Pages runtime.

```sh
npm run lint
npm run check
npm test
npm run build
```

Integration tests run in local workerd with real D1 SQLite and R2 emulation; only Turnstile's external response is mocked. The test entry is never deployed.

## Deploy your own instance

Fork and follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). Create **your own** private R2 bucket, D1 database, Pages project, Turnstile widget and Cron Worker. Bind both applications to your database and bucket. Never reuse the maintainer's resource IDs or secrets. All credentials live in Cloudflare secrets, not the repository.

The environment hard switch defaults to `ENABLE_UPLOADS=false`. Production requires `TURNSTILE_SITE_KEY`, `TURNSTILE_HOSTNAMES`, secret `TURNSTILE_SECRET_KEY`, `BETA_INVITE_CODE`, `ADMIN_TOKEN` and `RATE_LIMIT_SALT`. Defaults for `TOTAL_CAPACITY_BYTES`, `MAX_FILE_BYTES` and `RETENTION_SECONDS` are listed above. D1 provides a second immediately changeable upload switch. See the Chinese README's configuration table and the bilingual CLI commands in the deployment guide.

Free-plan-compatible does not mean unlimited or guaranteed zero cost. R2 account activation may require billing details. Monitor storage/operation, request/CPU and D1 quotas; disable uploads during abuse.

## Privacy and boundaries

There are no accounts, analytics or public file listings. D1 stores file metadata and SHA-256 capability hashes. Raw IP addresses are not saved; short-lived salted hashes support rate limiting. A share URL grants access to its bearer, and a separate private management URL grants deletion. Lost capabilities cannot be recovered.

This is **not end-to-end encrypted** and does not scan for malware. The operator and Cloudflare can access contents. Do not upload confidential information. Extension blocking does not establish safety. Authorization ends at expiry; physical deletion follows asynchronously. Existing transfers and recipient copies cannot be recalled. Metadata tombstones remain for replay prevention and repair; reports expire after 30 days.

See [SECURITY.md](SECURITY.md) for responsible disclosure and [CONTRIBUTING.md](CONTRIBUTING.md) for contributions. Project code is MIT; third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
