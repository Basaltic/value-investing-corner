CREATE TABLE judgment_versions (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 document TEXT NOT NULL,
 text TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL,
 version INTEGER NOT NULL CHECK (version > 0),
 base_id TEXT REFERENCES judgment_versions(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(company_id, version)
);
CREATE TABLE judgment_drafts (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL UNIQUE REFERENCES companies(id),
 document TEXT NOT NULL,
 text TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0,
 base_id TEXT REFERENCES judgment_versions(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER official_judgment_no_update BEFORE UPDATE ON judgment_versions
 BEGIN SELECT RAISE(ABORT,'正式判断只能追加，不允许修改'); END;
CREATE TRIGGER official_judgment_no_delete BEFORE DELETE ON judgment_versions
 BEGIN SELECT RAISE(ABORT,'正式判断只能追加，不允许删除'); END;
UPDATE storage_metadata SET schema_version=4 WHERE singleton=1;
PRAGMA user_version=4;
