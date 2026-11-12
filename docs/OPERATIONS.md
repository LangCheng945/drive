# Administration and recovery

All admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`, checked on the server. Do not put the token in a query parameter, public UI or shell history. The examples below assume you have safely loaded it into `$ADMIN_TOKEN` and the origin into `$DRIVE_ORIGIN` in a POSIX shell. PowerShell users can use `Invoke-RestMethod` and an in-memory header hashtable instead.

## Pause/resume uploads

```sh
curl -X POST "$DRIVE_ORIGIN/api/admin/uploads" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  --data '{"disabled":true}'
```

`false` resumes the D1 switch. Environment `ENABLE_UPLOADS=false` always overrides it. New reservations and new PUTs stop; a PUT that has already started can finish. Existing shares can still download. Public status is `/api/status` (no secrets). A shutdown racing with a reservation may return the generic capacity/disabled 507 response; no capacity is reserved after the D1 disabled flag commits.

## Reports and takedowns

```sh
curl "$DRIVE_ORIGIN/api/admin/reports" -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X DELETE "$DRIVE_ORIGIN/api/admin/files/FILE_UUID" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json'
```

Reports are bounded to the latest 50. Review their `file_id` and reason privately; submissions are untrusted plain text. File UUIDs are administrative identifiers, not share tokens. Delete revokes ready/claimed/reserved files before removing objects. For an actively uploading object, pause uploads and wait for its lease or run cleanup once expired before retrying; the current stream is bounded to 120 seconds. A takedown cannot revoke copies or an already authorized transfer.

## Retry cleanup

```sh
curl -X POST "$DRIVE_ORIGIN/api/admin/cleanup" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json'
npx wrangler tail langcheng-drive-cleanup
```

Repeat bounded calls if necessary; a failed deletion retains its bytes and retries after five minutes. Do not decrement the ledger by hand. Cron progress only logs counts, never filenames or capabilities.

## Reconcile D1 and R2

1. Disable uploads via D1 switch above and keep the environment switch off during restoration. Wait until live reserved/uploading rows' 15-minute leases expire.
2. Run cleanup until expired upload records have drained.
3. Call repair with `{}`; supply the returned `after` in subsequent calls. Stop when `done` is true.
4. Cleanup's persisted R2 cursor automatically removes orphan objects older than one hour and writes to deleted tombstones. Inspect logs and account metrics; complete a full scan before judging physical usage.
5. Confirm capacity, remaining ready objects and shares; resume only after investigation.

```sh
curl -X POST "$DRIVE_ORIGIN/api/admin/repair" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' --data '{}'
# next page:
curl -X POST "$DRIVE_ORIGIN/api/admin/repair" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' --data '{"after":"RETURNED_UUID"}'
```

Repair returns 409 if uploads are enabled or a live upload lease remains. It never silently links unknown objects to share tokens. Missing/wrong-size objects are removed through the normal deletion path; capacity is released once. The occupied ledger is recomputed in a single SQL statement from live reservations. Concurrent cleanup remains safe because each mutation is serialized on the primary.

## Rollback and secrets

Keep D1 and R2 backups consistent; D1 Time Travel alone can restore metadata for objects already deleted. Pause before restore, reconcile afterward, and do not resurrect expired capabilities. Rotate ADMIN_TOKEN and RATE_LIMIT_SALT independently. R2 is accessed through bindings and needs no public S3 keys.

Do not share this deployment's resource IDs or credentials with Fork users; give them the public configuration examples. Monitor database growth from retained tombstones and review a retention policy before the beta becomes a long-running public service.
