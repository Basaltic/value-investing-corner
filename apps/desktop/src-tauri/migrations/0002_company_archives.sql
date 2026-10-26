CREATE TABLE storage_metadata_next (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  created_at TEXT NOT NULL
);
INSERT INTO storage_metadata_next SELECT singleton, 2, created_at FROM storage_metadata;
DROP TABLE storage_metadata;
ALTER TABLE storage_metadata_next RENAME TO storage_metadata;

CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  market TEXT NOT NULL CHECK (market IN ('a', 'hk', 'us', 'private')),
  registration TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX companies_name ON companies(name COLLATE NOCASE);

CREATE TABLE listings (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  market TEXT NOT NULL CHECK (market IN ('a', 'hk', 'us')),
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  exchange TEXT NOT NULL DEFAULT '',
  security_type TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX listings_company ON listings(company_id);
CREATE INDEX listings_market_code ON listings(market, code COLLATE NOCASE);
PRAGMA user_version = 2;
