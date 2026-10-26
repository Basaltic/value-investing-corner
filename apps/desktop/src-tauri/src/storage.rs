use std::path::Path;

use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteJournalMode},
};

const SUPPORTED_SCHEMA_VERSION: i64 = 1;
const INITIAL_MIGRATION_SQL: &str = include_str!("../migrations/0001_storage_foundation.sql");

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

    if current_version == 0 {
        let mut transaction = connection
            .begin()
            .await
            .map_err(|error| format!("无法开始数据库迁移：{error}"))?;
        for statement in INITIAL_MIGRATION_SQL
            .split(';')
            .map(str::trim)
            .filter(|statement| !statement.is_empty())
        {
            sqlx::query(statement)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("数据库迁移失败，原库文件已保留：{error}"))?;
        }
        transaction
            .commit()
            .await
            .map_err(|error| format!("数据库迁移提交失败，原库文件已保留：{error}"))?;
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
    async fn initializes_and_reopens_the_same_schema() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("research.sqlite3");

        let first = initialize_database(&path).await.expect("first init");
        let second = initialize_database(&path).await.expect("second init");

        assert_eq!(first.schema_version, 1);
        assert_eq!(second.schema_version, 1);
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
