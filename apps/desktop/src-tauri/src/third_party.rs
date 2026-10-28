use std::path::Path;
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Candidate {
    pub company_id: String,
    pub source_id: String,
    pub url: String,
    pub title: String,
    pub published_at: Option<String>,
    pub body: Option<Vec<u8>>,
}
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Payload {
    pub id: String,
    pub company_id: String,
    pub source_id: String,
    pub content_hash: String,
    pub mode: String,
    pub metadata: Option<String>,
    pub body: Option<Vec<u8>>,
    pub first_seen_at: String,
    pub restricted_event: Option<String>,
}
use sha2::{Digest, Sha256};
use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteRow},
};
fn err(e: impl std::fmt::Display) -> String {
    format!("第三方存储操作失败：{e}")
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn row(r: SqliteRow) -> Payload {
    Payload {
        id: r.get("id"),
        company_id: r.get("company_id"),
        source_id: r.get("source_id"),
        content_hash: r.get("content_hash"),
        mode: r.get("mode"),
        metadata: r.get("metadata"),
        body: r.get("body"),
        first_seen_at: r.get("first_seen_at"),
        restricted_event: r.get("restricted_event"),
    }
}
async fn connect(db: &Path) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db).foreign_keys(true))
        .await
        .map_err(err)
}
pub(crate) fn ledger_path(data: &Path) -> Result<std::path::PathBuf, String> {
    let name = data.file_name().ok_or("数据目录无名称")?.to_string_lossy();
    Ok(data.with_file_name(format!("{name}.restrictions.sqlite3")))
}
const LEDGER_SCHEMA: &str = "CREATE TABLE confirmed_licenses(source_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL); CREATE TABLE restrictions(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,content_hash TEXT NOT NULL,reason TEXT NOT NULL,occurred_at TEXT NOT NULL,license_status TEXT NOT NULL); CREATE TRIGGER restrictions_no_update BEFORE UPDATE ON restrictions BEGIN SELECT RAISE(ABORT,'撤销不可改写'); END; CREATE TRIGGER restrictions_no_delete BEFORE DELETE ON restrictions BEGIN SELECT RAISE(ABORT,'撤销不可删除'); END; PRAGMA user_version=1;";
async fn ledger(path: &Path, create: bool) -> Result<SqliteConnection, String> {
    if let Ok(m) = std::fs::symlink_metadata(path) {
        if !m.is_file() || m.file_type().is_symlink() {
            return Err("独立清单不是普通文件".into());
        }
    } else if !create {
        return Err("独立清单缺失".into());
    }
    let mut con = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(create),
    )
    .await
    .map_err(err)?;
    let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&mut con)
        .await
        .map_err(err)?;
    if version == 0 && create {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
                .fetch_one(&mut con)
                .await
                .map_err(err)?;
        if count != 0 {
            return Err("独立清单格式未知，不覆盖".into());
        }
        let mut tx = con.begin().await.map_err(err)?;
        sqlx::raw_sql(LEDGER_SCHEMA)
            .execute(&mut *tx)
            .await
            .map_err(err)?;
        tx.commit().await.map_err(err)?;
    } else if version != 1 {
        return Err("独立清单版本不兼容".into());
    }
    sqlx::query("SELECT source_id,fingerprint FROM confirmed_licenses LIMIT 0")
        .fetch_all(&mut con)
        .await
        .map_err(err)?;
    sqlx::query("SELECT id,source_id,content_hash,reason,occurred_at,license_status FROM restrictions LIMIT 0").fetch_all(&mut con).await.map_err(err)?;
    Ok(con)
}
#[derive(Clone)]
struct Restriction {
    id: String,
    source: String,
    hash: String,
    reason: String,
    time: String,
    status: String,
}
async fn restrictions(con: &mut SqliteConnection, table: &str) -> Result<Vec<Restriction>, String> {
    // Table is an internal static choice, never user SQL.
    let sql = match table {
        "restrictions" => "SELECT * FROM restrictions",
        _ => "SELECT * FROM takedown_events",
    };
    Ok(sqlx::query(sql)
        .fetch_all(con)
        .await
        .map_err(err)?
        .into_iter()
        .map(|r| Restriction {
            id: r.get("id"),
            source: r.get("source_id"),
            hash: r.get("content_hash"),
            reason: r.get("reason"),
            time: r.get("occurred_at"),
            status: r.get("license_status"),
        })
        .collect())
}
async fn record(con: &mut SqliteConnection, table: &str, r: &Restriction) -> Result<(), String> {
    let sql = match table {
        "restrictions" => "INSERT OR IGNORE INTO restrictions VALUES(?,?,?,?,?,?)",
        _ => "INSERT OR IGNORE INTO takedown_events VALUES(?,?,?,?,?,?)",
    };
    sqlx::query(sql)
        .bind(&r.id)
        .bind(&r.source)
        .bind(&r.hash)
        .bind(&r.reason)
        .bind(&r.time)
        .bind(&r.status)
        .execute(con)
        .await
        .map_err(err)?;
    Ok(())
}
fn fingerprint(s: &crate::collection::SourceInput) -> Result<String, String> {
    Ok(hash(&serde_json::to_vec(s).map_err(err)?))
}
fn allowed(s: &crate::collection::SourceInput) -> bool {
    s.enabled
        && matches!(s.level.as_str(), "full" | "metadata")
        && !s.evidence.trim().is_empty()
        && !s.evidence_url.trim().is_empty()
        && s.purpose_confirmed
        && !s.purpose.trim().is_empty()
}
pub async fn archive(db: &Path, mut candidate: Candidate) -> Result<Payload, String> {
    if candidate.title.trim().is_empty()
        || candidate.title.len() > 800
        || candidate.title.chars().any(char::is_control)
        || candidate
            .body
            .as_ref()
            .is_some_and(|b| b.len() > 20 * 1024 * 1024)
    {
        return Err("候选标题或负载无效，单项最多20MiB".into());
    }
    let u = tauri::Url::parse(&candidate.url).map_err(|_| "候选URL无效")?;
    if !matches!(u.scheme(), "https" | "http")
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return Err("候选URL不含凭据、参数或片段".into());
    }
    if candidate
        .published_at
        .as_ref()
        .is_some_and(|v| v.len() > 100 || v.chars().any(char::is_control))
    {
        return Err("发布时间标识无效".into());
    }
    crate::companies::get_company(db, &candidate.company_id).await?;
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(err)?;
    // A conditional no-op update obtains the writer lock while reading the current source, before any payload is written.
    let source = sqlx::query(
        "UPDATE source_registrations SET revision=revision WHERE id=? RETURNING revision,payload",
    )
    .bind(&candidate.source_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(err)?
    .ok_or("未登记许可，不存元数据")?;
    if !crate::collection::SOURCE_IDS.contains(&candidate.source_id.as_str()) {
        return Err("来源未支持".into());
    }
    let revision: i64 = source.get("revision");
    let s: crate::collection::SourceInput =
        serde_json::from_str(source.get("payload")).map_err(err)?;
    if !allowed(&s) {
        return Err("许可/用途不足，不存元数据".into());
    }
    if s.level != "full" {
        candidate.body = None;
    }
    let mode = if candidate.body.is_some() {
        "full"
    } else {
        "metadata_only"
    };
    let body = candidate.body.take();
    let metadata = serde_json::to_string(&candidate).map_err(err)?;
    let content_hash = hash(body.as_deref().unwrap_or(metadata.as_bytes()));
    let url_hash = hash(candidate.url.as_bytes());
    let fp = fingerprint(&s)?;
    let path = ledger_path(db.parent().ok_or("数据库目录无效")?)?;
    let main_restrictions = restrictions(&mut tx, "takedown_events").await?;
    if main_restrictions
        .iter()
        .any(|r| r.source == candidate.source_id && r.hash == content_hash)
    {
        return Err("该第三方负载有撤销/隔离记录，不可重新落盘".into());
    }
    let mut l = ledger(&path, true).await?;
    if restrictions(&mut l, "restrictions")
        .await?
        .iter()
        .any(|r| r.source == candidate.source_id && r.hash == content_hash)
    {
        return Err("该第三方负载已撤销，不可重新落盘".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT OR IGNORE INTO third_party_payloads(id,company_id,source_id,url_hash,content_hash,storage_mode,mode,metadata,body,license_fingerprint,source_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(&id).bind(&candidate.company_id).bind(&candidate.source_id).bind(&url_hash).bind(&content_hash).bind(mode).bind(mode).bind(metadata).bind(body).bind(&fp).bind(revision).execute(&mut *tx).await.map_err(err)?;
    let saved=row(sqlx::query("SELECT * FROM third_party_payloads WHERE company_id=? AND source_id=? AND url_hash=? AND content_hash=? AND storage_mode=?").bind(&candidate.company_id).bind(&candidate.source_id).bind(url_hash).bind(content_hash).bind(mode).fetch_one(&mut *tx).await.map_err(err)?);
    if saved.mode == "restricted" {
        return Err("旧条目已隔离，不得通过重复落盘恢复".into());
    }
    // The ledger is never restored from a package. A source fingerprint only confirms a current local registration, not legal truth.
    sqlx::query("INSERT INTO confirmed_licenses VALUES(?,?) ON CONFLICT(source_id) DO UPDATE SET fingerprint=excluded.fingerprint").bind(&candidate.source_id).bind(fp).execute(&mut l).await.map_err(err)?;
    tx.commit().await.map_err(err)?;
    Ok(saved)
}
pub async fn get(db: &Path, id: &str) -> Result<Payload, String> {
    let mut con = connect(db).await?;
    let mut p = row(sqlx::query("SELECT * FROM third_party_payloads WHERE id=?")
        .bind(id)
        .fetch_optional(&mut con)
        .await
        .map_err(err)?
        .ok_or("第三方记录不存在")?);
    let fp: String =
        sqlx::query_scalar("SELECT license_fingerprint FROM third_party_payloads WHERE id=?")
            .bind(id)
            .fetch_one(&mut con)
            .await
            .map_err(err)?;
    let path = ledger_path(db.parent().ok_or("数据库目录无效")?)?;
    match ledger(&path, false).await {
        Ok(mut l) => {
            let confirmed: Option<String> =
                sqlx::query_scalar("SELECT fingerprint FROM confirmed_licenses WHERE source_id=?")
                    .bind(&p.source_id)
                    .fetch_optional(&mut l)
                    .await
                    .map_err(err)?;
            if confirmed.as_ref() != Some(&fp) {
                p.mode = "restricted".into();
                p.body = None;
                p.metadata = None;
                p.restricted_event = Some("license-unconfirmed".into());
            }
            let rs = restrictions(&mut l, "restrictions").await?;
            if let Some(r) = rs
                .iter()
                .find(|r| r.source == p.source_id && r.hash == p.content_hash)
            {
                p.mode = "restricted".into();
                p.body = None;
                p.metadata = None;
                p.restricted_event = Some(r.id.clone());
            }
        }
        Err(_) => {
            p.mode = "restricted".into();
            p.body = None;
            p.metadata = None;
            p.restricted_event = Some("ledger-unavailable".into());
        }
    }
    let current = crate::collection::sources(db)
        .await?
        .into_iter()
        .find(|s| s.id == p.source_id)
        .filter(|s| allowed(&s.input))
        .map(|s| fingerprint(&s.input))
        .transpose()?;
    if current.as_ref() != Some(&fp) {
        p.mode = "restricted".into();
        p.body = None;
        p.metadata = None;
        p.restricted_event = Some("license-unconfirmed".into());
    }
    Ok(p)
}
pub async fn takedown(db: &Path, id: &str, reason: &str) -> Result<(), String> {
    if reason.trim().is_empty() || reason.len() > 2000 || reason.chars().any(char::is_control) {
        return Err("撤销原因为空或无效".into());
    }
    let p = get(db, id).await?;
    let path = ledger_path(db.parent().ok_or("数据库目录无效")?)?;
    let mut l = ledger(&path, true).await?;
    if let Some(r) = restrictions(&mut l, "restrictions")
        .await?
        .into_iter()
        .find(|r| r.source == p.source_id && r.hash == p.content_hash)
    {
        let mut con = connect(db).await?;
        apply(&mut con, &r).await?;
        return Ok(());
    }
    let time: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')")
        .fetch_one(&mut l)
        .await
        .map_err(err)?;
    let r = Restriction {
        id: uuid::Uuid::new_v4().to_string(),
        source: p.source_id,
        hash: p.content_hash,
        reason: reason.into(),
        time,
        status: "revoked".into(),
    };
    // Persist the safety tombstone first. A later payload clear failure must never make the old bytes readable/restoreable.
    record(&mut l, "restrictions", &r).await?;
    let mut con = connect(db).await?;
    apply(&mut con, &r).await
}
async fn apply(con: &mut SqliteConnection, r: &Restriction) -> Result<(), String> {
    let mut tx = con.begin().await.map_err(err)?;
    record(&mut tx, "takedown_events", r).await?;
    sqlx::query("UPDATE third_party_payloads SET mode='restricted',metadata=NULL,body=NULL,restricted_event=? WHERE source_id=? AND content_hash=?").bind(&r.id).bind(&r.source).bind(&r.hash).execute(&mut *tx).await.map_err(err)?;
    tx.commit().await.map_err(err)?;
    Ok(())
}
pub(crate) async fn sanitize_snapshot(db: &Path, current_data: &Path) -> Result<(), String> {
    let mut con = connect(db).await?;
    let path = ledger_path(current_data)?;
    let mut l = ledger(&path, false).await.ok();
    let mut merged = restrictions(&mut con, "takedown_events").await?;
    let current_db = current_data.join("research.sqlite3");
    if current_db.is_file()
        && let Ok(mut current) = connect(&current_db).await
        && let Ok(records) = restrictions(&mut current, "takedown_events").await
    {
        merged.extend(records);
    }
    if l.is_none() && !path.exists() && !merged.is_empty() {
        l = ledger(&path, true).await.ok();
    }
    if let Some(l) = l.as_mut() {
        merged.extend(restrictions(l, "restrictions").await?);
    }
    for r in &merged {
        if let Some(l) = l.as_mut() {
            record(l, "restrictions", r).await?;
        }
        apply(&mut con, r).await?;
    }
    let regs = crate::collection::sources(db).await?;
    let current_db = current_data.join("research.sqlite3");
    let current_regs = if current_db.is_file() {
        crate::collection::sources(&current_db).await.ok()
    } else {
        None
    };
    let rows=sqlx::query("SELECT source_id,content_hash,license_fingerprint FROM third_party_payloads WHERE mode!='restricted'").fetch_all(&mut con).await.map_err(err)?;
    for r in rows {
        let source: String = r.get("source_id");
        let fp: String = r.get("license_fingerprint");
        let confirmed = if let Some(l) = l.as_mut() {
            sqlx::query_scalar::<_, String>(
                "SELECT fingerprint FROM confirmed_licenses WHERE source_id=?",
            )
            .bind(&source)
            .fetch_optional(l)
            .await
            .map_err(err)?
        } else {
            None
        };
        let local = regs
            .iter()
            .find(|s| s.id == source)
            .filter(|s| allowed(&s.input))
            .map(|s| fingerprint(&s.input))
            .transpose()?;
        let current = current_regs
            .as_ref()
            .and_then(|regs| regs.iter().find(|s| s.id == source))
            .filter(|s| allowed(&s.input))
            .map(|s| fingerprint(&s.input))
            .transpose()?;
        if confirmed.as_ref() != Some(&fp)
            || local.as_ref() != Some(&fp)
            || current.as_ref() != Some(&fp)
        {
            let time: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')")
                .fetch_one(&mut con)
                .await
                .map_err(err)?;
            let r = Restriction {
                id: uuid::Uuid::new_v4().to_string(),
                source,
                hash: r.get("content_hash"),
                reason: "恢复/备份时本机许可无法确认，仅隔离第三方".into(),
                time,
                status: "unconfirmed".into(),
            };
            apply(&mut con, &r).await?;
        }
    }
    // Remove deleted payload bytes from free pages and checkpoints, not just the live SQL view.
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&mut con)
        .await
        .map_err(err)?;
    sqlx::query("VACUUM").execute(&mut con).await.map_err(err)?;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&mut con)
        .await
        .map_err(err)?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        backup::{create_backup, restore_backup},
        collection::{SourceInput, save_source},
        storage::initialize_database,
    };
    use sqlx::{Connection, SqliteConnection};
    use tempfile::tempdir;
    async fn setup(root: &Path) -> std::path::PathBuf {
        let db = root.join("data/research.sqlite3");
        initialize_database(&db).await.unwrap();
        let mut con = SqliteConnection::connect_with(
            &sqlx::sqlite::SqliteConnectOptions::new().filename(&db),
        )
        .await
        .unwrap();
        sqlx::query("INSERT INTO companies(id,name,market) VALUES('c','P09虚构公司','private')")
            .execute(&mut con)
            .await
            .unwrap();
        sqlx::query("INSERT INTO judgment_versions(id,company_id,document,text,revision,version,created_at,updated_at) VALUES('v','c','{}','我的正式判断',1,1,'old','old')").execute(&mut con).await.unwrap();
        sqlx::query("INSERT INTO judgment_drafts(id,company_id,document,text,reason) VALUES('d','c','{}','我的草稿批注','个人修订原因')").execute(&mut con).await.unwrap();
        std::fs::create_dir_all(root.join("data/attachments")).unwrap();
        std::fs::write(
            root.join("data/attachments/personal.txt"),
            b"third-party-payload",
        )
        .unwrap();
        crate::materials::create_text(
            &db,
            "c",
            "note",
            crate::materials::MaterialInput {
                title: "我的个人笔记".into(),
                body: "自己的护城河理解".into(),
                url: String::new(),
                tags: vec!["自写".into()],
            },
        )
        .await
        .unwrap();
        db
    }
    fn license(level: &str) -> SourceInput {
        SourceInput {
            enabled: true,
            level: level.into(),
            evidence_url: "https://example.com/terms".into(),
            evidence: "虚构测试许可，非真实来源授权".into(),
            purpose: "个人夹具测试".into(),
            purpose_confirmed: true,
            daily_limit: 10,
            min_interval_secs: 2,
        }
    }
    fn candidate() -> Candidate {
        Candidate {
            company_id: "c".into(),
            source_id: "sec_filings".into(),
            url: "https://example.com/filing".into(),
            title: "虚构第三方报告".into(),
            published_at: None,
            body: Some(b"third-party-payload".to_vec()),
        }
    }
    async fn personal(root: &Path) {
        let mut con = SqliteConnection::connect_with(
            &sqlx::sqlite::SqliteConnectOptions::new().filename(root.join("research.sqlite3")),
        )
        .await
        .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT text FROM judgment_versions WHERE id='v'")
                .fetch_one(&mut con)
                .await
                .unwrap(),
            "我的正式判断"
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT text FROM judgment_drafts WHERE id='d'")
                .fetch_one(&mut con)
                .await
                .unwrap(),
            "我的草稿批注"
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>(
                "SELECT body FROM materials WHERE title='我的个人笔记'"
            )
            .fetch_one(&mut con)
            .await
            .unwrap(),
            "自己的护城河理解"
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT reason FROM judgment_drafts WHERE id='d'")
                .fetch_one(&mut con)
                .await
                .unwrap(),
            "个人修订原因"
        );
        assert_eq!(
            std::fs::read(root.join("attachments/personal.txt")).unwrap(),
            b"third-party-payload"
        );
    }
    #[tokio::test]
    async fn admission_metadata_and_full_are_distinct_and_idempotent() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        assert!(archive(&db, candidate()).await.is_err());
        save_source(&db, "sec_filings", license("metadata"), 0)
            .await
            .unwrap();
        let m = archive(&db, candidate()).await.unwrap();
        assert_eq!(m.mode, "metadata_only");
        assert!(m.body.is_none());
        assert_eq!(archive(&db, candidate()).await.unwrap(), m);
        save_source(&db, "sec_filings", license("full"), 1)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        assert_eq!(f.mode, "full");
        assert_eq!(f.body, candidate().body);
        assert_ne!(f.id, m.id);
        assert_eq!(archive(&db, candidate()).await.unwrap(), f);
    }
    #[tokio::test]
    async fn takedown_filters_new_and_old_backups_without_rewriting_personal_content() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let old = t.path().join("old");
        create_backup(db.parent().unwrap(), &old).await.unwrap();
        takedown(&db, &f.id, "测试授权撤销").await.unwrap();
        let restricted = get(&db, &f.id).await.unwrap();
        assert_eq!(restricted.mode, "restricted");
        assert!(restricted.body.is_none());
        assert!(restricted.metadata.is_none());
        assert!(restricted.restricted_event.is_some());
        let new = t.path().join("new");
        create_backup(db.parent().unwrap(), &new).await.unwrap();
        assert!(
            get(&new.join("payload/research.sqlite3"), &f.id)
                .await
                .unwrap()
                .body
                .is_none()
        );
        restore_backup(&old, db.parent().unwrap()).await.unwrap();
        assert_eq!(get(&db, &f.id).await.unwrap().mode, "restricted");
        personal(db.parent().unwrap()).await;
        restore_backup(&old, db.parent().unwrap()).await.unwrap();
        assert!(get(&db, &f.id).await.unwrap().body.is_none());
        personal(db.parent().unwrap()).await;
        // Original package remains complete and unmodified.
        let mut raw = connect(&old.join("payload/research.sqlite3"))
            .await
            .unwrap();
        let original: Option<Vec<u8>> =
            sqlx::query_scalar("SELECT body FROM third_party_payloads WHERE id=?")
                .bind(&f.id)
                .fetch_one(&mut raw)
                .await
                .unwrap();
        assert_eq!(original, candidate().body);
    }
    #[tokio::test]
    async fn new_machine_or_missing_ledger_quarantines_only_third_party() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let old = t.path().join("old");
        create_backup(db.parent().unwrap(), &old).await.unwrap();
        let new = t.path().join("new-machine");
        restore_backup(&old, &new).await.unwrap();
        assert_eq!(
            get(&new.join("research.sqlite3"), &f.id)
                .await
                .unwrap()
                .mode,
            "restricted"
        );
        personal(&new).await;
    }
    #[tokio::test]
    async fn missing_or_corrupt_ledger_never_exposes_live_payload_or_blocks_personal_restore() {
        for corrupt in [false, true] {
            let t = tempdir().unwrap();
            let db = setup(t.path()).await;
            save_source(&db, "sec_filings", license("full"), 0)
                .await
                .unwrap();
            let f = archive(&db, candidate()).await.unwrap();
            let backup = t.path().join("backup");
            create_backup(db.parent().unwrap(), &backup).await.unwrap();
            let path = ledger_path(db.parent().unwrap()).unwrap();
            if corrupt {
                std::fs::write(&path, b"corrupt ledger fixture").unwrap();
            } else {
                std::fs::remove_file(&path).unwrap();
            }
            let hidden = get(&db, &f.id).await.unwrap();
            assert!(hidden.body.is_none());
            assert_eq!(hidden.mode, "restricted");
            restore_backup(&backup, db.parent().unwrap()).await.unwrap();
            personal(db.parent().unwrap()).await;
            assert!(get(&db, &f.id).await.unwrap().body.is_none());
            if corrupt {
                assert_eq!(std::fs::read(path).unwrap(), b"corrupt ledger fixture");
            }
        }
    }
    #[tokio::test]
    async fn current_disabled_source_cannot_be_reenabled_by_old_backup() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let backup = t.path().join("backup");
        create_backup(db.parent().unwrap(), &backup).await.unwrap();
        let mut disabled = license("full");
        disabled.enabled = false;
        save_source(&db, "sec_filings", disabled, 1).await.unwrap();
        restore_backup(&backup, db.parent().unwrap()).await.unwrap();
        assert!(get(&db, &f.id).await.unwrap().body.is_none());
        personal(db.parent().unwrap()).await;
    }
    #[tokio::test]
    async fn ledger_with_missing_tables_quarantines_without_overwriting_corrupt_file() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let backup = t.path().join("backup");
        create_backup(db.parent().unwrap(), &backup).await.unwrap();
        let path = ledger_path(db.parent().unwrap()).unwrap();
        let mut l = ledger(&path, false).await.unwrap();
        sqlx::query("DROP TABLE confirmed_licenses")
            .execute(&mut l)
            .await
            .unwrap();
        l.close().await.unwrap();
        let before = std::fs::read(&path).unwrap();
        restore_backup(&backup, db.parent().unwrap()).await.unwrap();
        personal(db.parent().unwrap()).await;
        assert!(get(&db, &f.id).await.unwrap().body.is_none());
        assert_eq!(std::fs::read(path).unwrap(), before);
    }
    #[tokio::test]
    async fn missing_ledger_merges_current_tombstones_before_restore_and_reimport() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let old = t.path().join("old");
        create_backup(db.parent().unwrap(), &old).await.unwrap();
        takedown(&db, &f.id, "清单丢失前的撤销").await.unwrap();
        std::fs::remove_file(ledger_path(db.parent().unwrap()).unwrap()).unwrap();
        restore_backup(&old, db.parent().unwrap()).await.unwrap();
        let mut con = connect(&db).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM takedown_events WHERE license_status='revoked'"
            )
            .fetch_one(&mut con)
            .await
            .unwrap(),
            1
        );
        assert!(archive(&db, candidate()).await.is_err());
        personal(db.parent().unwrap()).await;
    }
    #[tokio::test]
    async fn source_changes_mask_live_payload_and_tombstones_are_append_only() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let mut disabled = license("full");
        disabled.enabled = false;
        save_source(&db, "sec_filings", disabled, 1).await.unwrap();
        assert!(get(&db, &f.id).await.unwrap().body.is_none());
        takedown(&db, &f.id, "测试撤销").await.unwrap();
        takedown(&db, &f.id, "重复请求不覆盖原因").await.unwrap();
        let mut con = connect(&db).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM takedown_events")
                .fetch_one(&mut con)
                .await
                .unwrap(),
            1
        );
        assert!(
            sqlx::query("DELETE FROM takedown_events")
                .execute(&mut con)
                .await
                .is_err()
        );
        assert!(
            sqlx::query("UPDATE takedown_events SET reason='改写'")
                .execute(&mut con)
                .await
                .is_err()
        );
        let mut l = ledger(&ledger_path(db.parent().unwrap()).unwrap(), false)
            .await
            .unwrap();
        assert!(
            sqlx::query("DELETE FROM restrictions")
                .execute(&mut l)
                .await
                .is_err()
        );
        assert!(
            sqlx::query("UPDATE restrictions SET reason='改写'")
                .execute(&mut l)
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn failed_payload_clear_leaves_tombstone_and_filtered_backup() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let mut con = connect(&db).await.unwrap();
        sqlx::query("CREATE TRIGGER fail_clear BEFORE UPDATE ON third_party_payloads BEGIN SELECT RAISE(ABORT,'模拟落盘失败'); END").execute(&mut con).await.unwrap();
        assert!(takedown(&db, &f.id, "模拟故障下仍先记撤销").await.is_err());
        assert!(get(&db, &f.id).await.unwrap().body.is_none());
        sqlx::query("DROP TRIGGER fail_clear")
            .execute(&mut con)
            .await
            .unwrap();
        let b = t.path().join("backup");
        create_backup(db.parent().unwrap(), &b).await.unwrap();
        let mut snapshot = connect(&b.join("payload/research.sqlite3")).await.unwrap();
        let body: Option<Vec<u8>> =
            sqlx::query_scalar("SELECT body FROM third_party_payloads WHERE id=?")
                .bind(&f.id)
                .fetch_one(&mut snapshot)
                .await
                .unwrap();
        assert!(body.is_none());
    }
    #[tokio::test]
    async fn new_snapshots_do_not_contain_deleted_blob_bytes() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let unique = b"P09-THIRD-PARTY-ONLY-UNIQUE-MARKER-REPEATED-".repeat(2000);
        let mut c = candidate();
        c.body = Some(unique.clone());
        let f = archive(&db, c).await.unwrap();
        takedown(&db, &f.id, "测试物理快照排除").await.unwrap();
        let b = t.path().join("backup");
        create_backup(db.parent().unwrap(), &b).await.unwrap();
        let bytes = std::fs::read(b.join("payload/research.sqlite3")).unwrap();
        assert!(!bytes.windows(50).any(|v| v == &unique[..50]));
        personal(db.parent().unwrap()).await;
    }
    #[tokio::test]
    async fn v7_migration_preserves_tasks_and_conflicting_v8_rolls_back() {
        for conflict in [false, true] {
            let t = tempdir().unwrap();
            let db = t.path().join("research.sqlite3");
            let mut con = SqliteConnection::connect_with(
                &SqliteConnectOptions::new()
                    .filename(&db)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
            for sql in [
                include_str!("../migrations/0001_storage_foundation.sql"),
                include_str!("../migrations/0002_company_archives.sql"),
                include_str!("../migrations/0003_material_library.sql"),
                include_str!("../migrations/0004_judgment_history.sql"),
                include_str!("../migrations/0005_finance_observations.sql"),
                include_str!("../migrations/0006_dashboard.sql"),
                include_str!("../migrations/0007_collection.sql"),
            ] {
                sqlx::raw_sql(sql).execute(&mut con).await.unwrap();
            }
            sqlx::query("INSERT INTO companies(id,name,market) VALUES('c','keep','private')")
                .execute(&mut con)
                .await
                .unwrap();
            sqlx::query("INSERT INTO collection_runs(id,company_id,source_id,request_key,state) VALUES('r','c','sec_filings','keep','queued')").execute(&mut con).await.unwrap();
            if conflict {
                sqlx::query("CREATE TABLE third_party_payloads(keep TEXT)")
                    .execute(&mut con)
                    .await
                    .unwrap();
            }
            con.close().await.unwrap();
            let result = initialize_database(&db).await;
            if conflict {
                assert!(result.is_err());
            } else {
                assert_eq!(result.unwrap().schema_version, 8);
            }
            let mut con = connect(&db).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, i64>("PRAGMA user_version")
                    .fetch_one(&mut con)
                    .await
                    .unwrap(),
                if conflict { 7 } else { 8 }
            );
            assert_eq!(
                sqlx::query_scalar::<_, String>(
                    "SELECT request_key FROM collection_runs WHERE id='r'"
                )
                .fetch_one(&mut con)
                .await
                .unwrap(),
                "keep"
            );
            assert!(db.with_extension("v7-backup.sqlite3").is_file());
        }
    }
    #[tokio::test]
    async fn valid_same_machine_backup_preserves_full_payload_and_invalid_url_never_writes() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let mut bad = candidate();
        bad.url = "https://example.com/report?apikey=fixture".into();
        assert!(archive(&db, bad).await.is_err());
        let mut missing = candidate();
        missing.company_id = "unknown".into();
        assert!(archive(&db, missing).await.is_err());
        let f = archive(&db, candidate()).await.unwrap();
        let b = t.path().join("backup");
        create_backup(db.parent().unwrap(), &b).await.unwrap();
        let original = std::fs::read(b.join("payload/research.sqlite3")).unwrap();
        restore_backup(&b, db.parent().unwrap()).await.unwrap();
        assert_eq!(get(&db, &f.id).await.unwrap(), f);
        assert_eq!(
            std::fs::read(b.join("payload/research.sqlite3")).unwrap(),
            original
        );
        personal(db.parent().unwrap()).await;
    }
    #[tokio::test]
    async fn recreated_ledger_does_not_authorize_unconfirmed_old_payloads() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        std::fs::remove_file(ledger_path(db.parent().unwrap()).unwrap()).unwrap();
        let mut l = ledger(&ledger_path(db.parent().unwrap()).unwrap(), true)
            .await
            .unwrap();
        sqlx::query("INSERT INTO confirmed_licenses VALUES('gnews','unrelated')")
            .execute(&mut l)
            .await
            .unwrap();
        l.close().await.unwrap();
        assert!(get(&db, &f.id).await.unwrap().body.is_none());
    }
    #[tokio::test]
    async fn bad_hash_keeps_current_database_and_independent_restrictions() {
        let t = tempdir().unwrap();
        let db = setup(t.path()).await;
        save_source(&db, "sec_filings", license("full"), 0)
            .await
            .unwrap();
        let f = archive(&db, candidate()).await.unwrap();
        let b = t.path().join("backup");
        create_backup(db.parent().unwrap(), &b).await.unwrap();
        takedown(&db, &f.id, "测试撤销").await.unwrap();
        std::fs::write(b.join("payload/attachments/personal.txt"), b"tampered").unwrap();
        assert!(restore_backup(&b, db.parent().unwrap()).await.is_err());
        assert!(get(&db, &f.id).await.unwrap().body.is_none());
        personal(db.parent().unwrap()).await;
    }
}
