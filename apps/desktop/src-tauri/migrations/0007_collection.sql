CREATE TABLE source_registrations (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision>0),
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE collection_runs (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 source_id TEXT NOT NULL,
 request_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','skipped')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(company_id,source_id,request_key)
);
CREATE TABLE collection_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 run_id TEXT NOT NULL REFERENCES collection_runs(id),
 state TEXT NOT NULL,
 attempt INTEGER NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE collection_quota (
 family TEXT NOT NULL,
 day TEXT NOT NULL,
 used INTEGER NOT NULL DEFAULT 0,
 last_started INTEGER NOT NULL,
 PRIMARY KEY(family,day)
);
CREATE TRIGGER collection_event_no_update BEFORE UPDATE ON collection_events BEGIN SELECT RAISE(ABORT,'任务事件不可改写'); END;
CREATE TRIGGER collection_event_no_delete BEFORE DELETE ON collection_events BEGIN SELECT RAISE(ABORT,'任务事件不可删除'); END;
UPDATE storage_metadata SET schema_version=7 WHERE singleton=1;
PRAGMA user_version=7;
