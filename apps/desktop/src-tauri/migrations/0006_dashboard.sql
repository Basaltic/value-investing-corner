CREATE TABLE dashboard_config (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 revision INTEGER NOT NULL CHECK(revision>=1),
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE research_items (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 kind TEXT NOT NULL CHECK(kind IN ('reading','supplement')),
 material_id TEXT REFERENCES materials(id),
 text TEXT NOT NULL,
 done INTEGER NOT NULL CHECK(done IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((kind='reading' AND material_id IS NOT NULL) OR (kind='supplement' AND material_id IS NULL)),
 UNIQUE(company_id,material_id)
);
UPDATE storage_metadata SET schema_version=6 WHERE singleton=1;
PRAGMA user_version=6;
