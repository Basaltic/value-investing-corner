CREATE TABLE financial_versions (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 series_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(series_id,version)
);
CREATE INDEX financial_company ON financial_versions(company_id,series_id,version);
CREATE TABLE metric_definitions (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 payload TEXT NOT NULL
);
CREATE TABLE observation_versions (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 series_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 payload TEXT NOT NULL,
 definition_id TEXT NOT NULL REFERENCES metric_definitions(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(series_id,version)
);
CREATE INDEX observation_company ON observation_versions(company_id,series_id,version);
CREATE TABLE derived_snapshots (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 fingerprint TEXT NOT NULL,
 payload TEXT NOT NULL,
 UNIQUE(company_id,fingerprint)
);
CREATE TRIGGER financial_no_update BEFORE UPDATE ON financial_versions BEGIN SELECT RAISE(ABORT,'财务事实只追加修订'); END;
CREATE TRIGGER financial_no_delete BEFORE DELETE ON financial_versions BEGIN SELECT RAISE(ABORT,'财务事实不可删除历史'); END;
CREATE TRIGGER observation_no_update BEFORE UPDATE ON observation_versions BEGIN SELECT RAISE(ABORT,'观测只追加修订'); END;
CREATE TRIGGER observation_no_delete BEFORE DELETE ON observation_versions BEGIN SELECT RAISE(ABORT,'观测不可删除历史'); END;
CREATE TRIGGER definition_no_update BEFORE UPDATE ON metric_definitions BEGIN SELECT RAISE(ABORT,'指标定义不可改写，创建新定义'); END;
CREATE TRIGGER definition_no_delete BEFORE DELETE ON metric_definitions BEGIN SELECT RAISE(ABORT,'指标定义不可删除'); END;
CREATE TRIGGER derived_no_update BEFORE UPDATE ON derived_snapshots BEGIN SELECT RAISE(ABORT,'派生快照不可改写'); END;
CREATE TRIGGER derived_no_delete BEFORE DELETE ON derived_snapshots BEGIN SELECT RAISE(ABORT,'派生快照不可删除'); END;
UPDATE storage_metadata SET schema_version=5 WHERE singleton=1;
PRAGMA user_version=5;
