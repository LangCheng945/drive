-- Existing files stay unlisted. Public listing requires an explicit new handle.
ALTER TABLE files ADD COLUMN visibility TEXT NOT NULL DEFAULT 'unlisted' CHECK(visibility IN ('public','unlisted'));
ALTER TABLE files ADD COLUMN public_id TEXT;
CREATE UNIQUE INDEX files_public_id ON files(public_id) WHERE public_id IS NOT NULL;
CREATE INDEX files_public_listing ON files(visibility,state,created_at DESC,id DESC);
