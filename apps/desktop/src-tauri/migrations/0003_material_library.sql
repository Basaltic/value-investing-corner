CREATE TABLE materials (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    kind TEXT NOT NULL CHECK (kind IN ('note','link','file')),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    file_mode TEXT NOT NULL DEFAULT '' CHECK (file_mode IN ('','copy','reference')),
    stored_path TEXT NOT NULL DEFAULT '',
    external_path TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    file_hash TEXT NOT NULL DEFAULT '',
    extension TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
    csv_mapping TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE material_tags (
    material_id TEXT NOT NULL REFERENCES materials(id),
    tag TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (material_id,tag)
);
CREATE INDEX materials_company_archive ON materials(company_id,archived);
CREATE INDEX material_tags_label ON material_tags(tag);
UPDATE storage_metadata SET schema_version=3 WHERE singleton=1;
PRAGMA user_version=3;
