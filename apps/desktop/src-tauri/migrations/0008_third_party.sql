CREATE TABLE third_party_payloads (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 source_id TEXT NOT NULL,
 url_hash TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 storage_mode TEXT NOT NULL CHECK(storage_mode IN ('full','metadata_only')),
 mode TEXT NOT NULL CHECK(mode IN ('full','metadata_only','restricted')),
 metadata TEXT,
 body BLOB,
 license_fingerprint TEXT NOT NULL,
 source_revision INTEGER NOT NULL,
 first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 restricted_event TEXT,
 UNIQUE(company_id,source_id,url_hash,content_hash,storage_mode),
 CHECK(mode!='restricted' OR (metadata IS NULL AND body IS NULL AND restricted_event IS NOT NULL)),
 CHECK(storage_mode='full' OR body IS NULL)
);
CREATE TABLE takedown_events (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 reason TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 license_status TEXT NOT NULL
);
CREATE TRIGGER takedown_no_update BEFORE UPDATE ON takedown_events BEGIN SELECT RAISE(ABORT,'撤销事件只追加'); END;
CREATE TRIGGER takedown_no_delete BEFORE DELETE ON takedown_events BEGIN SELECT RAISE(ABORT,'撤销事件只追加'); END;
UPDATE storage_metadata SET schema_version=8 WHERE singleton=1;
PRAGMA user_version=8;
