use std::{
    collections::BTreeSet,
    path::{Component, Path, PathBuf},
};

use sha2::{Digest, Sha256};
use sqlx::{Connection, SqliteConnection};

use crate::storage::initialize_database;

const BACKUP_FORMAT_VERSION: u32 = 1;
const DATABASE_FILE: &str = "research.sqlite3";

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct BackupManifest {
    pub format_version: u32,
    pub schema_version: i64,
    pub files: Vec<BackupFile>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct BackupFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

pub async fn create_backup(data_dir: &Path, backup_dir: &Path) -> Result<BackupManifest, String> {
    if backup_dir.exists() {
        return Err(format!(
            "备份目标已存在，拒绝覆盖：{}",
            backup_dir.display()
        ));
    }
    let database_path = data_dir.join(DATABASE_FILE);
    if !database_path.is_file() {
        return Err(format!("数据库不存在：{}", database_path.display()));
    }

    let temporary = sibling_path(backup_dir, "partial")?;
    remove_if_exists(&temporary)?;
    let payload = temporary.join("payload");
    std::fs::create_dir_all(&payload).map_err(|error| format!("无法创建备份暂存目录：{error}"))?;

    let result = create_backup_in_staging(data_dir, &database_path, &temporary, &payload).await;
    if let Err(error) = result {
        let _ = remove_if_exists(&temporary);
        return Err(error);
    }
    let manifest = result.expect("checked above");
    std::fs::rename(&temporary, backup_dir)
        .map_err(|error| format!("无法完成备份目录切换：{error}"))?;
    Ok(manifest)
}

async fn create_backup_in_staging(
    data_dir: &Path,
    database_path: &Path,
    temporary: &Path,
    payload: &Path,
) -> Result<BackupManifest, String> {
    let status = initialize_database(database_path).await?;
    let snapshot_path = payload.join(DATABASE_FILE);
    let mut connection =
        SqliteConnection::connect(&format!("sqlite://{}", database_path.display()))
            .await
            .map_err(|error| format!("无法打开待备份数据库：{error}"))?;
    let escaped = snapshot_path.display().to_string().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(&mut connection)
        .await
        .map_err(|error| format!("无法生成一致数据库快照：{error}"))?;
    drop(connection);

    let attachments = data_dir.join("attachments");
    if attachments.exists() {
        copy_directory(&attachments, &payload.join("attachments"))?;
    }

    let files = collect_manifest_files(payload, temporary)?;
    let manifest = BackupManifest {
        format_version: BACKUP_FORMAT_VERSION,
        schema_version: status.schema_version,
        files,
    };
    std::fs::write(
        temporary.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)
            .map_err(|error| format!("无法序列化备份清单：{error}"))?,
    )
    .map_err(|error| format!("无法写入备份清单：{error}"))?;
    Ok(manifest)
}

pub async fn restore_backup(backup_dir: &Path, data_dir: &Path) -> Result<(), String> {
    let manifest: BackupManifest = serde_json::from_slice(
        &std::fs::read(backup_dir.join("manifest.json"))
            .map_err(|error| format!("无法读取备份清单：{error}"))?,
    )
    .map_err(|error| format!("无法解析备份清单：{error}"))?;
    validate_manifest(backup_dir, &manifest)?;

    let staging = sibling_path(data_dir, "restore-staging")?;
    let rollback = data_dir.with_extension("rollback");
    remove_if_exists(&staging)?;
    std::fs::create_dir_all(&staging).map_err(|error| format!("无法创建恢复暂存目录：{error}"))?;

    let restore_result = restore_into_staging(backup_dir, &manifest, &staging).await;
    if let Err(error) = restore_result {
        let _ = remove_if_exists(&staging);
        return Err(error);
    }

    remove_if_exists(&rollback)?;
    let had_current = data_dir.exists();
    if had_current {
        std::fs::rename(data_dir, &rollback)
            .map_err(|error| format!("无法保留原数据回滚副本：{error}"))?;
    }
    if let Err(error) = std::fs::rename(&staging, data_dir) {
        if had_current {
            let _ = std::fs::rename(&rollback, data_dir);
        }
        return Err(format!(
            "无法切换恢复后的数据目录，已尝试恢复原目录：{error}"
        ));
    }
    Ok(())
}

async fn restore_into_staging(
    backup_dir: &Path,
    manifest: &BackupManifest,
    staging: &Path,
) -> Result<(), String> {
    for file in &manifest.files {
        let relative = Path::new(&file.path)
            .strip_prefix("payload")
            .map_err(|_| format!("备份路径不在 payload 下：{}", file.path))?;
        let destination = staging.join(relative);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建恢复目录：{error}"))?;
        }
        std::fs::copy(backup_dir.join(&file.path), &destination)
            .map_err(|error| format!("无法复制恢复负载 {}：{error}", file.path))?;
    }

    let status = initialize_database(&staging.join(DATABASE_FILE)).await?;
    if status.schema_version != manifest.schema_version {
        return Err(format!(
            "恢复数据库版本与清单不一致：database={}，manifest={}",
            status.schema_version, manifest.schema_version
        ));
    }
    Ok(())
}

fn validate_manifest(backup_dir: &Path, manifest: &BackupManifest) -> Result<(), String> {
    if manifest.format_version != BACKUP_FORMAT_VERSION {
        return Err(format!("不支持的备份格式版本：{}", manifest.format_version));
    }
    if manifest.schema_version != 1 {
        return Err(format!(
            "不支持的数据库 schema 版本：{}",
            manifest.schema_version
        ));
    }

    let mut declared = BTreeSet::new();
    for file in &manifest.files {
        validate_backup_path(&file.path)?;
        if !declared.insert(file.path.clone()) {
            return Err(format!("备份清单包含重复路径：{}", file.path));
        }
        let source = backup_dir.join(&file.path);
        let metadata = std::fs::symlink_metadata(&source)
            .map_err(|error| format!("备份负载缺失 {}：{error}", file.path))?;
        if !metadata.file_type().is_file() {
            return Err(format!("备份负载不是普通文件：{}", file.path));
        }
        if metadata.len() != file.size || sha256_file(&source)? != file.sha256 {
            return Err(format!("备份负载校验失败：{}", file.path));
        }
    }
    if !declared.contains("payload/research.sqlite3") {
        return Err("备份清单缺少数据库负载".to_string());
    }

    let actual = collect_relative_files(&backup_dir.join("payload"), backup_dir)?;
    if actual != declared {
        return Err("备份负载与清单不一致，存在未声明或缺失文件".to_string());
    }
    Ok(())
}

fn validate_backup_path(path: &str) -> Result<(), String> {
    let parsed = Path::new(path);
    if parsed.is_absolute() || path.contains('\\') {
        return Err(format!("备份清单包含非法路径：{path}"));
    }
    if parsed
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("备份清单包含路径穿越：{path}"));
    }
    if path != "payload/research.sqlite3" && !path.starts_with("payload/attachments/") {
        return Err(format!("备份清单包含越界负载：{path}"));
    }
    Ok(())
}

fn collect_manifest_files(payload: &Path, backup_root: &Path) -> Result<Vec<BackupFile>, String> {
    let paths = collect_relative_files(payload, backup_root)?;
    paths
        .into_iter()
        .map(|relative| {
            let path = backup_root.join(&relative);
            let size = std::fs::metadata(&path)
                .map_err(|error| format!("无法读取备份文件属性：{error}"))?
                .len();
            Ok(BackupFile {
                path: relative,
                size,
                sha256: sha256_file(&path)?,
            })
        })
        .collect()
}

fn collect_relative_files(directory: &Path, root: &Path) -> Result<BTreeSet<String>, String> {
    let mut files = BTreeSet::new();
    collect_relative_files_into(directory, root, &mut files)?;
    Ok(files)
}

fn collect_relative_files_into(
    directory: &Path,
    root: &Path,
    files: &mut BTreeSet<String>,
) -> Result<(), String> {
    for entry in std::fs::read_dir(directory)
        .map_err(|error| format!("无法读取目录 {}：{error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("无法读取目录条目：{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取文件类型：{error}"))?;
        if file_type.is_symlink() {
            return Err(format!("备份不接受符号链接：{}", entry.path().display()));
        }
        if file_type.is_dir() {
            collect_relative_files_into(&entry.path(), root, files)?;
        } else if file_type.is_file() {
            let relative = entry
                .path()
                .strip_prefix(root)
                .map_err(|_| "无法计算备份相对路径".to_string())?
                .to_string_lossy()
                .replace(std::path::MAIN_SEPARATOR, "/");
            files.insert(relative);
        }
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    std::fs::create_dir_all(destination)
        .map_err(|error| format!("无法创建附件备份目录：{error}"))?;
    for entry in std::fs::read_dir(source).map_err(|error| format!("无法读取附件目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取附件条目：{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取附件类型：{error}"))?;
        let target = destination.join(entry.file_name());
        if file_type.is_symlink() {
            return Err(format!(
                "附件目录不接受符号链接：{}",
                entry.path().display()
            ));
        }
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), target)
                .map_err(|error| format!("无法复制附件：{error}"))?;
        }
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path)
        .map_err(|error| format!("无法读取待校验文件 {}：{error}", path.display()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn sibling_path(path: &Path, suffix: &str) -> Result<PathBuf, String> {
    let name = path
        .file_name()
        .ok_or_else(|| format!("路径没有可用文件名：{}", path.display()))?
        .to_string_lossy();
    Ok(path.with_file_name(format!("{name}.{suffix}")))
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        std::fs::remove_dir_all(path)
            .map_err(|error| format!("无法清理目录 {}：{error}", path.display()))
    } else {
        std::fs::remove_file(path)
            .map_err(|error| format!("无法清理文件 {}：{error}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{BackupManifest, create_backup, restore_backup};
    use crate::storage::initialize_database;
    use sqlx::{Connection, Row, SqliteConnection};
    use tempfile::tempdir;

    async fn build_fixture(root: &Path, marker: &str) {
        std::fs::create_dir_all(root.join("attachments")).expect("attachments dir");
        std::fs::write(root.join("attachments/note.txt"), marker).expect("attachment");
        let database = root.join("research.sqlite3");
        initialize_database(&database).await.expect("initialize db");
        let mut connection = SqliteConnection::connect(&format!("sqlite://{}", database.display()))
            .await
            .expect("connect db");
        sqlx::query("CREATE TABLE fixture (value TEXT NOT NULL)")
            .execute(&mut connection)
            .await
            .expect("create fixture table");
        sqlx::query("INSERT INTO fixture (value) VALUES (?)")
            .bind(marker)
            .execute(&mut connection)
            .await
            .expect("insert fixture");
    }

    async fn read_marker(data_dir: &Path) -> String {
        let mut connection = SqliteConnection::connect(&format!(
            "sqlite://{}",
            data_dir.join("research.sqlite3").display()
        ))
        .await
        .expect("connect restored db");
        sqlx::query("SELECT value FROM fixture")
            .fetch_one(&mut connection)
            .await
            .expect("read fixture")
            .get(0)
    }

    #[tokio::test]
    async fn round_trips_database_and_attachments_and_keeps_rollback() {
        let temp = tempdir().expect("temp dir");
        let data = temp.path().join("data");
        let backup = temp.path().join("backup");
        build_fixture(&data, "before").await;

        let manifest = create_backup(&data, &backup).await.expect("create backup");
        assert_eq!(manifest.format_version, 1);
        assert!(
            manifest
                .files
                .iter()
                .any(|file| file.path == "payload/research.sqlite3")
        );
        assert!(
            manifest
                .files
                .iter()
                .any(|file| file.path == "payload/attachments/note.txt")
        );

        std::fs::remove_dir_all(&data).expect("remove original");
        build_fixture(&data, "after").await;
        restore_backup(&backup, &data)
            .await
            .expect("restore backup");

        assert_eq!(read_marker(&data).await, "before");
        assert_eq!(
            std::fs::read_to_string(data.join("attachments/note.txt"))
                .expect("restored attachment"),
            "before"
        );
        let rollback = data.with_extension("rollback");
        assert_eq!(read_marker(&rollback).await, "after");

        restore_backup(&backup, &data)
            .await
            .expect("idempotent restore");
        assert_eq!(read_marker(&data).await, "before");
    }

    #[tokio::test]
    async fn rejects_tampered_payload_without_changing_current_data() {
        let temp = tempdir().expect("temp dir");
        let data = temp.path().join("data");
        let backup = temp.path().join("backup");
        build_fixture(&data, "safe").await;
        create_backup(&data, &backup).await.expect("create backup");
        std::fs::write(backup.join("payload/attachments/note.txt"), "tampered")
            .expect("tamper payload");

        let error = restore_backup(&backup, &data)
            .await
            .expect_err("tampered backup must fail");
        assert!(error.contains("校验"));
        assert_eq!(read_marker(&data).await, "safe");
    }

    #[tokio::test]
    async fn includes_committed_wal_data_and_rejects_path_traversal() {
        let temp = tempdir().expect("temp dir");
        let data = temp.path().join("data");
        let backup = temp.path().join("backup");
        build_fixture(&data, "wal").await;
        create_backup(&data, &backup).await.expect("create backup");
        assert_eq!(
            read_marker(&backup.join("payload")).await,
            "wal",
            "database snapshot must include committed WAL content"
        );

        let manifest_path = backup.join("manifest.json");
        let mut manifest: BackupManifest =
            serde_json::from_slice(&std::fs::read(&manifest_path).expect("read manifest"))
                .expect("parse manifest");
        manifest.files[0].path = "payload/../outside".to_string();
        std::fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest).expect("serialize manifest"),
        )
        .expect("write manifest");

        let error = restore_backup(&backup, &data)
            .await
            .expect_err("path traversal must fail");
        assert!(error.contains("路径穿越") || error.contains("非法路径"));
        assert_eq!(read_marker(&data).await, "wal");
    }

    #[tokio::test]
    async fn rejects_unknown_format_and_future_schema_without_changing_current_data() {
        let temp = tempdir().expect("temp dir");
        let data = temp.path().join("data");
        let backup = temp.path().join("backup");
        build_fixture(&data, "safe").await;
        create_backup(&data, &backup).await.expect("create backup");

        let manifest_path = backup.join("manifest.json");
        let mut manifest: BackupManifest =
            serde_json::from_slice(&std::fs::read(&manifest_path).expect("read manifest"))
                .expect("parse manifest");
        manifest.format_version = 99;
        std::fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest).expect("serialize manifest"),
        )
        .expect("write manifest");
        assert!(restore_backup(&backup, &data).await.is_err());
        assert_eq!(read_marker(&data).await, "safe");

        manifest.format_version = 1;
        manifest.schema_version = 99;
        std::fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest).expect("serialize manifest"),
        )
        .expect("write manifest");
        assert!(restore_backup(&backup, &data).await.is_err());
        assert_eq!(read_marker(&data).await, "safe");
    }
}
