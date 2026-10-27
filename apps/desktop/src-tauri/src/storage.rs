use std::path::Path;

use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteJournalMode},
};

pub(crate) const SUPPORTED_SCHEMA_VERSION: i64 = 4;
const INITIAL_MIGRATION_SQL: &str = include_str!("../migrations/0001_storage_foundation.sql");
const COMPANY_MIGRATION_SQL: &str = include_str!("../migrations/0002_company_archives.sql");
const MATERIAL_MIGRATION_SQL: &str = include_str!("../migrations/0003_material_library.sql");
const JUDGMENT_MIGRATION_SQL: &str = include_str!("../migrations/0004_judgment_history.sql");

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
pub struct StorageStatus {
    pub schema_version: i64,
    pub database_path: String,
}

pub async fn initialize_database(path: &Path) -> Result<StorageStatus, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建数据目录 {}：{error}", parent.display()))?;
    }

    // Validate existing files read-only before opening a writer or changing WAL mode.
    if path.exists() {
        let mut existing = SqliteConnection::connect_with(
            &SqliteConnectOptions::new().filename(path).read_only(true),
        )
        .await
        .map_err(|error| format!("无法读取旧数据库：{error}"))?;
        let version: i64 = sqlx::query_scalar("PRAGMA user_version")
            .fetch_one(&mut existing)
            .await
            .map_err(|error| format!("无法读取数据库版本：{error}"))?;
        if version > SUPPORTED_SCHEMA_VERSION {
            return Err(format!(
                "数据库版本 {version} 高于当前支持版本 {SUPPORTED_SCHEMA_VERSION}，已拒绝启动且未修改原库"
            ));
        }
        if version > 0 {
            let metadata: i64 = sqlx::query_scalar(
                "SELECT schema_version FROM storage_metadata WHERE singleton = 1",
            )
            .fetch_one(&mut existing)
            .await
            .map_err(|error| format!("数据库元数据校验失败：{error}"))?;
            if metadata != version {
                return Err("数据库迁移校验不一致，旧库未修改".into());
            }
        }
        existing
            .close()
            .await
            .map_err(|error| format!("关闭旧数据库失败：{error}"))?;
    }

    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("无法打开数据库 {}：{error}", path.display()))?;

    let current_version: i64 = sqlx::query("PRAGMA user_version")
        .fetch_one(&mut connection)
        .await
        .map_err(|error| format!("无法读取数据库版本：{error}"))?
        .get(0);
    if current_version > SUPPORTED_SCHEMA_VERSION {
        return Err(format!(
            "数据库版本 {current_version} 高于当前支持版本 {SUPPORTED_SCHEMA_VERSION}，已拒绝启动且未修改原库"
        ));
    }

    if current_version < SUPPORTED_SCHEMA_VERSION {
        if current_version > 0 {
            let snapshot = path.with_extension(format!("v{current_version}-backup.sqlite3"));
            if snapshot.exists() {
                return Err(format!(
                    "升级前备份已存在，拒绝覆盖：{}",
                    snapshot.display()
                ));
            }
            sqlx::query("VACUUM INTO ?")
                .bind(snapshot.to_string_lossy().as_ref())
                .execute(&mut connection)
                .await
                .map_err(|error| format!("升级前备份失败，拒绝迁移：{error}"))?;
        }
        let mut transaction = connection
            .begin()
            .await
            .map_err(|error| format!("无法开始数据库迁移：{error}"))?;
        if current_version == 0 {
            sqlx::raw_sql(INITIAL_MIGRATION_SQL)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("数据库初始化失败：{error}"))?;
        }
        if current_version < 2 {
            sqlx::raw_sql(COMPANY_MIGRATION_SQL)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("公司档案迁移失败，原库已保留：{error}"))?;
        }
        if current_version < 3 {
            sqlx::raw_sql(MATERIAL_MIGRATION_SQL)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("资料库迁移失败，原库已保留：{error}"))?;
        }
        sqlx::raw_sql(JUDGMENT_MIGRATION_SQL)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("判断历史迁移失败，原库已保留：{error}"))?;
        transaction
            .commit()
            .await
            .map_err(|error| format!("数据库迁移提交失败：{error}"))?;
    }

    let schema_version: i64 = sqlx::query("PRAGMA user_version")
        .fetch_one(&mut connection)
        .await
        .map_err(|error| format!("无法校验数据库版本：{error}"))?
        .get(0);
    let metadata_version: i64 =
        sqlx::query_scalar("SELECT schema_version FROM storage_metadata WHERE singleton = 1")
            .fetch_one(&mut connection)
            .await
            .map_err(|error| format!("数据库元数据校验失败：{error}"))?;
    if schema_version != SUPPORTED_SCHEMA_VERSION || metadata_version != schema_version {
        return Err(format!(
            "数据库迁移校验不一致：user_version={schema_version}，metadata={metadata_version}"
        ));
    }

    Ok(StorageStatus {
        schema_version,
        database_path: path.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::initialize_database;
    use sqlx::{
        Connection, Row, SqliteConnection,
        sqlite::{SqliteConnectOptions, SqliteJournalMode},
    };
    use tempfile::tempdir;

    #[tokio::test]
    async fn upgrades_v1_with_data_and_keeps_pre_upgrade_snapshot() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("research.sqlite3");
        let mut connection = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true),
        )
        .await
        .unwrap();
        sqlx::raw_sql(super::INITIAL_MIGRATION_SQL)
            .execute(&mut connection)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE legacy_fixture (value TEXT)")
            .execute(&mut connection)
            .await
            .unwrap();
        sqlx::query("INSERT INTO legacy_fixture VALUES ('keep')")
            .execute(&mut connection)
            .await
            .unwrap();
        drop(connection);
        let status = initialize_database(&path).await.unwrap();
        assert_eq!(status.schema_version, 4);
        let mut current =
            SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
                .await
                .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT value FROM legacy_fixture")
                .fetch_one(&mut current)
                .await
                .unwrap(),
            "keep"
        );
        let snapshot = path.with_extension("v1-backup.sqlite3");
        assert!(snapshot.is_file());
        let mut old = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(snapshot)
                .read_only(true),
        )
        .await
        .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("PRAGMA user_version")
                .fetch_one(&mut old)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT value FROM legacy_fixture")
                .fetch_one(&mut old)
                .await
                .unwrap(),
            "keep"
        );
    }

    #[tokio::test]
    async fn conflicting_v1_schema_rolls_back_migration_and_preserves_data() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("research.sqlite3");
        let mut connection = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true),
        )
        .await
        .unwrap();
        sqlx::raw_sql(super::INITIAL_MIGRATION_SQL)
            .execute(&mut connection)
            .await
            .unwrap();
        sqlx::raw_sql(
            "CREATE TABLE companies (legacy TEXT); INSERT INTO companies VALUES ('untouched');",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        drop(connection);
        assert!(initialize_database(&path).await.is_err());
        let mut current =
            SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
                .await
                .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("PRAGMA user_version")
                .fetch_one(&mut current)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT schema_version FROM storage_metadata")
                .fetch_one(&mut current)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT legacy FROM companies")
                .fetch_one(&mut current)
                .await
                .unwrap(),
            "untouched"
        );
        assert!(path.with_extension("v1-backup.sqlite3").is_file());
    }

    #[tokio::test]
    async fn upgrades_v2_and_preserves_snapshot_and_company_ids() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("research.sqlite3");
        let mut db = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true),
        )
        .await
        .unwrap();
        sqlx::raw_sql(super::INITIAL_MIGRATION_SQL)
            .execute(&mut db)
            .await
            .unwrap();
        sqlx::raw_sql(super::COMPANY_MIGRATION_SQL)
            .execute(&mut db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO companies (id,name,market,registration) VALUES ('same-id','keep','private','')").execute(&mut db).await.unwrap();
        drop(db);
        assert_eq!(initialize_database(&path).await.unwrap().schema_version, 4);
        assert!(path.with_extension("v2-backup.sqlite3").exists());
        let mut db = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT id FROM companies")
                .fetch_one(&mut db)
                .await
                .unwrap(),
            "same-id"
        );
        assert_eq!(initialize_database(&path).await.unwrap().schema_version, 4);
    }

    #[tokio::test]
    async fn upgrades_v3_and_preserves_pre_upgrade_data() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("research.sqlite3");
        let mut db = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true),
        )
        .await
        .unwrap();
        sqlx::raw_sql(super::INITIAL_MIGRATION_SQL)
            .execute(&mut db)
            .await
            .unwrap();
        sqlx::raw_sql(super::COMPANY_MIGRATION_SQL)
            .execute(&mut db)
            .await
            .unwrap();
        sqlx::raw_sql(super::MATERIAL_MIGRATION_SQL)
            .execute(&mut db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO companies(id,name,market) VALUES('keep-id','keep','private')")
            .execute(&mut db)
            .await
            .unwrap();
        drop(db);
        assert_eq!(initialize_database(&path).await.unwrap().schema_version, 4);
        assert!(path.with_extension("v3-backup.sqlite3").exists());
        let mut db = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&path))
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT id FROM companies")
                .fetch_one(&mut db)
                .await
                .unwrap(),
            "keep-id"
        );
        assert_eq!(initialize_database(&path).await.unwrap().schema_version, 4);
    }

    #[tokio::test]
    async fn initializes_and_reopens_the_same_schema() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("research.sqlite3");

        let first = initialize_database(&path).await.expect("first init");
        let second = initialize_database(&path).await.expect("second init");

        assert_eq!(first.schema_version, 4);
        assert_eq!(second.schema_version, 4);
        assert_eq!(first.database_path, path.display().to_string());
        assert_eq!(first, second);

        let mut connection = SqliteConnection::connect(&format!("sqlite://{}", path.display()))
            .await
            .expect("open database");
        let journal_mode: String = sqlx::query("PRAGMA journal_mode")
            .fetch_one(&mut connection)
            .await
            .expect("journal mode")
            .get(0);
        assert_eq!(journal_mode.to_lowercase(), "wal");
    }

    #[tokio::test]
    async fn refuses_an_inconsistent_schema_without_repairing_it() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("research.sqlite3");
        let mut connection = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal),
        )
        .await
        .expect("create database");
        sqlx::query("PRAGMA user_version = 1")
            .execute(&mut connection)
            .await
            .expect("set current version without metadata");
        drop(connection);

        let error = initialize_database(&path)
            .await
            .expect_err("inconsistent schema must be rejected");
        assert!(error.contains("元数据校验失败"));

        let mut connection = SqliteConnection::connect(&format!("sqlite://{}", path.display()))
            .await
            .expect("reopen database");
        let version: i64 = sqlx::query("PRAGMA user_version")
            .fetch_one(&mut connection)
            .await
            .expect("read version")
            .get(0);
        assert_eq!(version, 1);
        let metadata_table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'storage_metadata'",
        )
        .fetch_one(&mut connection)
        .await
        .expect("check metadata table absence");
        assert_eq!(metadata_table_count, 0);
    }

    #[tokio::test]
    async fn refuses_an_unknown_future_schema_without_modifying_it() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("research.sqlite3");
        let mut connection = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal),
        )
        .await
        .expect("create database");
        sqlx::query("PRAGMA user_version = 99")
            .execute(&mut connection)
            .await
            .expect("set future version");
        drop(connection);

        let error = initialize_database(&path)
            .await
            .expect_err("future schema must be rejected");
        assert!(error.contains("99"));

        let mut connection = SqliteConnection::connect(&format!("sqlite://{}", path.display()))
            .await
            .expect("reopen database");
        let version: i64 = sqlx::query("PRAGMA user_version")
            .fetch_one(&mut connection)
            .await
            .expect("read version")
            .get(0);
        assert_eq!(version, 99);
    }
}
