ALTER TABLE files ADD COLUMN thumbnail_size INTEGER NOT NULL DEFAULT 0 CHECK(thumbnail_size BETWEEN 0 AND 4096);
ALTER TABLE files ADD COLUMN thumbnail TEXT;
DROP TRIGGER files_reserve;
CREATE TRIGGER files_reserve AFTER INSERT ON files WHEN NEW.state != 'deleted'
BEGIN UPDATE storage SET occupied = occupied + NEW.size + NEW.thumbnail_size WHERE id = 1; END;
DROP TRIGGER files_release;
CREATE TRIGGER files_release AFTER UPDATE OF state ON files
WHEN OLD.state != 'deleted' AND NEW.state = 'deleted'
BEGIN UPDATE storage SET occupied = occupied - OLD.size - OLD.thumbnail_size WHERE id = 1; END;
CREATE TRIGGER immutable_thumbnail BEFORE UPDATE OF thumbnail,thumbnail_size ON files
WHEN NEW.thumbnail_size != OLD.thumbnail_size OR (NEW.thumbnail IS NOT OLD.thumbnail AND NOT(NEW.state='deleted' AND NEW.thumbnail IS NULL))
BEGIN SELECT RAISE(ABORT, 'thumbnail payload is immutable except confirmed deletion'); END;
