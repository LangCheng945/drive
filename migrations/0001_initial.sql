PRAGMA foreign_keys = ON;
CREATE TABLE storage (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  occupied INTEGER NOT NULL DEFAULT 0 CHECK(occupied >= 0),
  uploads_disabled INTEGER NOT NULL DEFAULT 0 CHECK(uploads_disabled IN (0,1))
);
INSERT INTO storage(id) VALUES(1);
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  share_hash TEXT NOT NULL UNIQUE,
  manage_hash TEXT NOT NULL UNIQUE,
  upload_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0),
  mode TEXT NOT NULL CHECK(mode IN ('once','day')),
  state TEXT NOT NULL CHECK(state IN ('reserved','uploading','ready','claimed','deleting','deleted')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL,
  delete_after INTEGER NOT NULL,
  deleted_at INTEGER,
  cleanup_error INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX files_cleanup ON files(state, delete_after);
CREATE INDEX files_expiry ON files(state, expires_at);
-- Capacity includes reservations and objects awaiting confirmed R2 deletion.
CREATE TRIGGER files_reserve AFTER INSERT ON files WHEN NEW.state != 'deleted'
BEGIN UPDATE storage SET occupied = occupied + NEW.size WHERE id = 1; END;
CREATE TRIGGER files_release AFTER UPDATE OF state ON files
WHEN OLD.state != 'deleted' AND NEW.state = 'deleted'
BEGIN UPDATE storage SET occupied = occupied - OLD.size WHERE id = 1; END;
CREATE TRIGGER no_resurrection BEFORE UPDATE OF state ON files
WHEN OLD.state = 'deleted' AND NEW.state != 'deleted'
BEGIN SELECT RAISE(ABORT, 'deleted files cannot be revived'); END;
CREATE TRIGGER immutable_size BEFORE UPDATE OF size ON files
BEGIN SELECT RAISE(ABORT, 'reservation size is immutable'); END;
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE TABLE turnstile_used (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX turnstile_expiry ON turnstile_used(expires_at);
CREATE TABLE maintenance (id INTEGER PRIMARY KEY CHECK(id=1), cursor TEXT NOT NULL DEFAULT '');
INSERT INTO maintenance(id) VALUES(1);
CREATE TABLE reports (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES files(id),
  reason TEXT NOT NULL, created_at INTEGER NOT NULL
);
