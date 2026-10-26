CREATE TABLE storage_metadata (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO storage_metadata (singleton, schema_version) VALUES (1, 1);

PRAGMA user_version = 1;
