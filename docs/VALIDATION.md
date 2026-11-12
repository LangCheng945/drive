# v0.1.0 validation record

Validated on 2026-11-12 (Asia/Taipei). See package-lock.json for exact versions.

## Automated release gates

- ESLint: passed.
- svelte-check / TypeScript: passed, zero errors and warnings.
- Vite + Cloudflare adapter production build: passed.
- Integration tests: **22 passed**, running real local workerd with D1 SQLite and R2. Turnstile's outbound HTTP response is mocked in the isolated test entry only.
- npm audit production dependency check: no reported vulnerabilities at verification time. Development toolchain audit reported 4 low and 10 moderate advisories; these are not claimed resolved. Re-audit the lockfile before future releases.

Coverage includes normal upload/download/delete, exact downloaded bytes and safe headers, 50 MB success and >50 MB rejection, full capacity, concurrent capacity reservations, declared and streamed length mismatch (underflow and overflow), immediate expiry before cleanup, eight concurrent one-time claims with one winner, harmless GET previews, abandoned reservations, non-reusable upload tokens, invitation/type/Turnstile checks, hostname/action failures, Siteverify outage, local replay ledger and concurrent replay, rate limits, foreign Origin rejection, authenticated kill switch, report authorization, missing-object repair, deletion failure/retry, late tombstone writes and expired management/upload capabilities.

## Production verification

- Dedicated D1 and private R2 resources created through Wrangler; migration applied successfully.
- Pages deployed at `https://langcheng-drive.pages.dev`, custom domain active at `https://drive.langcheng.uk` with HTTPS.
- Real domain-restricted Managed Turnstile automatically verified in browser; an 81-byte disposable fixture uploaded successfully to production R2.
- UI displayed share URL, QR code, expiry and separate private management URL.
- Browser one-time POST download was accepted after the referrer-policy correction. Subsequent lookup returned 404, confirming claim consumption. Byte-for-byte response verification is covered by automated runtime tests; the browser's download event API did not return a saved local file for inspection.
- Private management DELETE returned 200; occupied capacity returned to 0 bytes. Invalid invitation returned 403; authenticated administrator request returned 200.
- Desktop light/dark and 375px mobile layout visually inspected; mobile had no horizontal overflow. Screenshots are separate delivery artifacts, not repository secrets.
- Cleanup Worker deployed with `*/5 * * * *` Cron trigger. Idempotent deletion/retry/expiry behavior tested locally; production deletion and capacity recovery verified through management API.

## Limits of verification

Free-plan production CPU and bandwidth under all chunking/concurrency patterns have not been load-tested. The real 50 MB test ran in local workerd, not the live public account. No malware scanning, end-to-end encryption, penetration audit or accessibility certification is claimed. Physical distributed orphan cleanup is eventual; see ARCHITECTURE.md. GitHub publication is separate from this prepared source release and Cloudflare deployment.
