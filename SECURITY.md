# Security policy

Version 0.1.x is a Limited Beta, not a guarantee of confidentiality. Do not upload secrets, regulated data or irreplaceable files. The operator can access R2 objects; end-to-end encryption and malware scanning are outside Phase 1.

## Report vulnerabilities privately

Use GitHub **Security → Report a vulnerability** at <https://github.com/LangCheng945/drive/security/advisories/new> when enabled. The maintainer must enable private vulnerability reporting before publication. If unavailable, open an issue requesting a private contact **without disclosing exploit details**. Never post working production capability URLs, user files or credentials.

Include the affected version, a minimal reproduction against your own instance, impact and suggested mitigation. Do not test denial of service, token guessing or content access against other people's deployments. No bounty is promised.

## Security controls

- 256-bit random, independent upload/share/manage tokens; only SHA-256 hashes persisted.
- Conditional primary D1 writes for atomic capacity reservation and one-time claims.
- FixedLengthStream validates exact size; object metadata must match before finalization.
- Private R2, attachment-only octet-stream downloads, nosniff, no-store and no capability paths in referrers (HTML uses strict-origin; API uses no-referrer).
- Server Turnstile hostname/action verification plus a local replay ledger.
- Salted IP rate buckets, required Beta invitation, authenticated administrator endpoints and dual upload switches.
- Eventual, idempotent object cleanup. Bytes are released only after confirmed deletion.

## Operational requirements

Use HTTPS; keep R2 public access disabled. Configure secrets through Wrangler; use separate credentials and resources for preview and production. Never log API URLs containing tokens. Restrict Cloudflare dashboard access. Keep the lockfile and patched dependencies current. Verify free-tier usage and scheduled-cleanup logs. Rotate invitation/admin/salt secrets after suspected exposure. Disable uploads and investigate before repair.

Expiry blocks **new authorization**, not a transfer already in progress. One-time claims are not resumable. Link scanners that explicitly submit POST may consume a claim. Extension filters can be bypassed by renaming content; all downloaded files remain untrusted. A malicious user with a valid invitation can consume shared capacity until lease/retention expiry. Application rate limiting does not replace edge DDoS protection, and rate-limit database writes themselves consume D1 quota.
