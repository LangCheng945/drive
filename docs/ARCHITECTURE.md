# Architecture and invariants

## Data path

1. `POST /api/uploads`: validate JSON bounds, type/name/size, rate limit and Turnstile hostname/action. A replay ledger prevents a converging Siteverify replay from creating two reservations.
2. A single `INSERT … SELECT … WHERE occupied + size <= limit` reserves the file on D1's primary. An INSERT trigger increments `storage.occupied` within the same statement. D1 read replication is not enabled; authorization reads use the primary binding.
3. Client receives independent 256-bit upload, share and management tokens. D1 stores their hashes. Public files additionally receive a separate random `public_id` for intentionally public URLs. Share access is unavailable while reserved/uploading.
4. `PUT /api/uploads/:upload`: a conditional update changes reserved → uploading exactly once. The raw body pipes to FixedLengthStream(size), then private R2. Underflow, overflow, timeout and Content-Length mismatch fail. No full-file arrayBuffer/FormData is used. R2's returned actual size must equal the reservation before uploading → ready.
5. The share page GET returns minimal metadata. Explicit POST streams an attachment. For one-time mode, after opening the R2 object, a conditional ready → claimed UPDATE grants one winner. All losers cancel their already-open read. Claims are never refunded. Ranges/resume are not supported.
6. The claim schedules deletion after five minutes. Expiry always denies new download authorization immediately; deletion may wait for Cron.

## Capacity

Visibility defaults to `public` and mode to `day` for new API reservations. `visibility=unlisted` excludes a file from the public list and public lookup/download/report routes; its private share capability remains usable. `GET /api/public` returns only ready, unexpired public files, 20 at a time with a stable timestamp/UUID cursor. `/p/:publicId` and `/s/:shareToken` use the same attachment and atomic claim logic. A one-time file cannot be claimed once through each route. Migration 0002 gives all old records `unlisted` visibility and no public identifier, preserving their privacy.

Every non-deleted row counts its immutable reserved size, including deleting rows. A successfully stored object's size must equal that reservation, so actual and reserved bytes coincide. Failed/incomplete uploads cannot become ready. R2 deletion happens before the conditional deleting → deleted state transition; the release trigger runs exactly once even under concurrent cleanup/manual deletion. A failed delete keeps the reservation and schedules retry.

States: `reserved → uploading → ready → claimed/deleting → deleted`. Abandoned reservations/uploads become deleting after a 15-minute lease. Upload streams time out after 120 seconds. Ready rows expire according to retention from reservation creation (never later than 24 hours). Deleted rows cannot resurrect. Management and share tokens cannot be used as upload tokens.

R2 and D1 do not share a distributed transaction. Worker termination between operations may leave a reservation or an object; this is why stale-state cleanup, retained tombstones and cursor-based orphan scans exist. The system prefers under-utilization to unsafe capacity release. Even after a late R2 write to a deleted row, the retained tombstone makes the object eligible for the next cursor scan. In a pathological runtime termination race, temporary physical orphan bytes can exist until cleanup; the strict guarantee is the atomic logical reservation budget, not instantaneous distributed deletion across failures. Do not restore a D1 backup alone without pausing uploads and reconciling R2.

## Cleanup and reconciliation

The dedicated Scheduled Worker uses the same source and bindings as Pages. Every invocation transitions expired rows, deletes at most six pending objects, expires rate/replay records/reports, and scans three R2 keys using a persisted cursor. Untracked objects younger than one hour are left untouched. Deleted metadata remains as a tombstone for replay prevention and late-write repair.

Missing active objects or wrong-size objects can be repaired through authenticated, bounded `/api/admin/repair` while uploads are disabled and all live reservations have drained. Each page inspects five D1 rows with R2 HEAD, deletes inconsistent entries through the normal lifecycle, then atomically recomputes the ledger from live rows. Iterate the returned cursor until `done`. See OPERATIONS.md. Repair never makes an expired or deleted share usable again.

## Retained data

- R2: content until claim/expiry/deletion cleanup; failures retry.
- D1: filename, immutable size, state, timestamps, token hashes and opaque UUID tombstone retained by default. No raw IP or uploaded MIME stored. Operators may implement a reviewed metadata-retention migration; deleting tombstones prematurely weakens late-write diagnostics.
- Rate buckets: salted hash of IP, scope and time window, expired by Cron. A shared NAT can share a limit. Requests without Cloudflare's trusted IP header share a conservative local bucket.
- Turnstile ledger: token hash for ten minutes.
- Reports: reason, file UUID and time for 30 days. No raw IP collected.
- Infrastructure may keep access/security logs under the operator's Cloudflare policies. Capability paths must be redacted before exporting logs.

## Security boundaries

The bucket is private. Downloads always use application/octet-stream, attachment, encoded filename, nosniff, sandbox CSP and no-store. File names are normalized and stripped of path separators/controls. Active web/executable extensions, including double extensions, are rejected. This is not MIME scanning or malware detection.

Same-origin write checks reject foreign Origin and cross-site Sec-Fetch-Site; JSON and raw PUT endpoints are not CORS enabled. Server/admin secrets never enter client bundles. The management page uses a fragment so the browser does not send its token in the initial page URL; its API request still carries it and must not be logged. Theme preference is the only localStorage state. QR generation is entirely local.
