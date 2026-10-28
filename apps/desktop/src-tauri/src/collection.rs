use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SourceInput {
    pub enabled: bool,
    pub level: String,
    pub evidence_url: String,
    pub evidence: String,
    pub purpose: String,
    pub purpose_confirmed: bool,
    pub daily_limit: i64,
    pub min_interval_secs: i64,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Source {
    pub id: String,
    pub revision: i64,
    pub input: SourceInput,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Run {
    pub id: String,
    pub company_id: String,
    pub source_id: String,
    pub request_key: String,
    pub state: String,
    pub attempts: i64,
    pub reason: String,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Event {
    pub sequence: i64,
    pub created_at: String,
    pub run_id: String,
    pub state: String,
    pub attempt: i64,
    pub reason: String,
}
use sqlx::{Connection, Row, SqliteConnection, sqlite::SqliteConnectOptions};
pub const SOURCE_IDS: [&str; 3] = ["sec_finance", "sec_filings", "gnews"];
fn source_id(id: &str) -> Result<(), String> {
    if SOURCE_IDS.contains(&id) {
        Ok(())
    } else {
        Err("未支持的来源通道".into())
    }
}
fn safe_text(s: &str, max: usize) -> Result<(), String> {
    if s.len() > max
        || s.contains('\0')
        || s.to_lowercase().contains("bearer ")
        || s.contains("sk-")
    {
        Err("文本过长或疑似凭据；请只在密码栏保存密钥".into())
    } else {
        Ok(())
    }
}
fn valid(v: &SourceInput) -> Result<(), String> {
    if !matches!(v.level.as_str(), "blocked" | "metadata" | "full")
        || !(1..=100).contains(&v.daily_limit)
        || !(1..=86400).contains(&v.min_interval_secs)
    {
        return Err("等级/配额/间隔无效：每日1–100，间隔1–86400秒".into());
    }
    for s in [&v.evidence, &v.purpose] {
        safe_text(s, 4000)?;
    }
    safe_text(&v.evidence_url, 2000)?;
    if !v.evidence_url.is_empty() {
        let u = tauri::Url::parse(&v.evidence_url).map_err(|_| "依据URL无效")?;
        if !matches!(u.scheme(), "http" | "https")
            || u.host_str().is_none()
            || !u.username().is_empty()
            || u.password().is_some()
            || u.query().is_some()
            || u.fragment().is_some()
        {
            return Err("依据URL仅HTTP(S)，不含账号、查询参数或片段（避免密钥入库）".into());
        }
    }
    Ok(())
}
async fn connect(db: &Path) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db).foreign_keys(true))
        .await
        .map_err(|_| "采集存储不可用".into())
}
fn default_source(id: &str) -> Source {
    Source {
        id: id.into(),
        revision: 0,
        input: SourceInput {
            enabled: false,
            level: "blocked".into(),
            evidence_url: String::new(),
            evidence: String::new(),
            purpose: String::new(),
            purpose_confirmed: false,
            daily_limit: 10,
            min_interval_secs: 2,
        },
    }
}
pub async fn sources(db: &Path) -> Result<Vec<Source>, String> {
    let mut con = connect(db).await?;
    let mut out = vec![];
    for id in SOURCE_IDS {
        let row = sqlx::query("SELECT revision,payload FROM source_registrations WHERE id=?")
            .bind(id)
            .fetch_optional(&mut con)
            .await
            .map_err(|_| "读取来源失败")?;
        out.push(if let Some(r) = row {
            Source {
                id: id.into(),
                revision: r.get("revision"),
                input: serde_json::from_str(r.get("payload")).map_err(|_| "来源数据损坏")?,
            }
        } else {
            default_source(id)
        });
    }
    Ok(out)
}
pub async fn save_source(
    db: &Path,
    id: &str,
    input: SourceInput,
    expected: i64,
) -> Result<Source, String> {
    source_id(id)?;
    valid(&input)?;
    if expected < 0 {
        return Err("来源修订号无效".into());
    }
    let mut con = connect(db).await?;
    let payload = serde_json::to_string(&input).map_err(|_| "序列化失败")?;
    let result=if expected==0{sqlx::query("INSERT OR IGNORE INTO source_registrations(id,revision,payload) VALUES(?,1,?)").bind(id).bind(payload).execute(&mut con).await}else{sqlx::query("UPDATE source_registrations SET revision=revision+1,payload=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=?").bind(payload).bind(id).bind(expected).execute(&mut con).await}.map_err(|_|"登记保存失败")?;
    if result.rows_affected() != 1 {
        return Err("来源版本冲突；输入保留，请重新载入核对".into());
    }
    Ok(Source {
        id: id.into(),
        revision: expected + 1,
        input,
    })
}
fn row(r: sqlx::sqlite::SqliteRow) -> Run {
    Run {
        id: r.get("id"),
        company_id: r.get("company_id"),
        source_id: r.get("source_id"),
        request_key: r.get("request_key"),
        state: r.get("state"),
        attempts: r.get("attempts"),
        reason: r.get("reason"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }
}
pub async fn get_run(db: &Path, id: &str) -> Result<Run, String> {
    let mut con = connect(db).await?;
    sqlx::query("SELECT * FROM collection_runs WHERE id=?")
        .bind(id)
        .fetch_optional(&mut con)
        .await
        .map_err(|_| "读取任务失败")?
        .map(row)
        .ok_or("任务不存在".into())
}
async fn event(con: &mut SqliteConnection, r: &Run) -> Result<(), String> {
    sqlx::query("INSERT INTO collection_events(run_id,state,attempt,reason) VALUES(?,?,?,?)")
        .bind(&r.id)
        .bind(&r.state)
        .bind(r.attempts)
        .bind(&r.reason)
        .execute(con)
        .await
        .map_err(|_| "任务事件写入失败")?;
    Ok(())
}
pub async fn enqueue(db: &Path, company: &str, source: &str, key: &str) -> Result<Run, String> {
    source_id(source)?;
    crate::companies::get_company(db, company).await?;
    if key.is_empty()
        || key.len() > 100
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("请求标识须1–100位字母数字或短横线/下划线，不放URL/凭据".into());
    }
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(|_| "事务失败")?;
    let id = uuid::Uuid::new_v4().to_string();
    let result=sqlx::query("INSERT OR IGNORE INTO collection_runs(id,company_id,source_id,request_key,state) VALUES(?,?,?,?,'queued')").bind(id).bind(company).bind(source).bind(key).execute(&mut *tx).await.map_err(|_|"排队失败")?;
    let r = row(sqlx::query(
        "SELECT * FROM collection_runs WHERE company_id=? AND source_id=? AND request_key=?",
    )
    .bind(company)
    .bind(source)
    .bind(key)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| "读取任务失败")?);
    if result.rows_affected() == 1 {
        event(&mut tx, &r).await?;
    }
    tx.commit().await.map_err(|_| "提交失败")?;
    Ok(r)
}
pub async fn runs(db: &Path) -> Result<Vec<Run>, String> {
    let mut con = connect(db).await?;
    Ok(
        sqlx::query("SELECT * FROM collection_runs ORDER BY created_at DESC,id")
            .fetch_all(&mut con)
            .await
            .map_err(|_| "读取任务失败")?
            .into_iter()
            .map(row)
            .collect(),
    )
}
pub async fn events(db: &Path, id: &str) -> Result<Vec<Event>, String> {
    get_run(db, id).await?;
    let mut con = connect(db).await?;
    Ok(
        sqlx::query("SELECT * FROM collection_events WHERE run_id=? ORDER BY sequence")
            .bind(id)
            .fetch_all(&mut con)
            .await
            .map_err(|_| "读取事件失败")?
            .into_iter()
            .map(|r| Event {
                sequence: r.get("sequence"),
                created_at: r.get("created_at"),
                run_id: r.get("run_id"),
                state: r.get("state"),
                attempt: r.get("attempt"),
                reason: r.get("reason"),
            })
            .collect(),
    )
}
pub async fn retry(db: &Path, id: &str) -> Result<Run, String> {
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(|_| "事务失败")?;
    let changed=sqlx::query("UPDATE collection_runs SET state='queued',reason='',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND state IN ('failed','skipped') AND attempts<3").bind(id).execute(&mut *tx).await.map_err(|_|"重试失败")?;
    if changed.rows_affected() != 1 {
        return Err("仅失败/跳过且少于3次尝试可重试".into());
    }
    let r = row(sqlx::query("SELECT * FROM collection_runs WHERE id=?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| "读取失败")?);
    event(&mut tx, &r).await?;
    tx.commit().await.map_err(|_| "提交失败")?;
    Ok(r)
}
fn family(id: &str) -> &str {
    if id.starts_with("sec_") {
        "sec"
    } else {
        "gnews"
    }
}
#[derive(Debug)]
pub struct Receipt {
    pub records: u64,
    pub proof: String,
}
#[allow(dead_code)] // Future source adapters produce these classified errors; no production adapter in P08.
#[derive(Clone, Copy)]
pub enum Failure {
    Network,
    Parsing,
    Persistence,
}
pub trait Adapter: Send + Sync {
    fn collect<'a>(
        &'a self,
        run: &'a Run,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Receipt, Failure>> + Send + 'a>>;
}
pub async fn execute(db: &Path, id: &str, credential: bool) -> Result<Run, String> {
    execute_with(db, id, credential, None).await
}
async fn execute_with(
    db: &Path,
    id: &str,
    credential: bool,
    adapter: Option<&dyn Adapter>,
) -> Result<Run, String> {
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(|_| "事务失败")?;
    let changed=sqlx::query("UPDATE collection_runs SET state='running',attempts=attempts+1,reason='',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND state='queued' AND attempts<3 AND NOT EXISTS(SELECT 1 FROM collection_runs WHERE state='running')").bind(id).execute(&mut *tx).await.map_err(|_|"任务领取失败")?;
    if changed.rows_affected() != 1 {
        tx.commit().await.map_err(|_| "提交失败")?;
        return get_run(db, id).await;
    }
    let r = row(sqlx::query("SELECT * FROM collection_runs WHERE id=?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| "读取任务失败")?);
    event(&mut tx, &r).await?;
    let reg = sqlx::query("SELECT payload FROM source_registrations WHERE id=?")
        .bind(&r.source_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| "读取登记失败")?;
    let s: SourceInput = if let Some(reg) = reg {
        serde_json::from_str(reg.get("payload")).map_err(|_| "来源数据损坏")?
    } else {
        default_source(&r.source_id).input
    };
    let reason = if !s.enabled {
        Some("来源未启用，未访问外部内容")
    } else if s.level == "blocked"
        || s.evidence.trim().is_empty()
        || s.evidence_url.trim().is_empty()
    {
        Some("许可依据不足，连元数据也不访问；仅可人工书签")
    } else if !s.purpose_confirmed || s.purpose.trim().is_empty() {
        Some("用途未确认，未访问外部内容")
    } else if r.source_id == "gnews" && !credential {
        Some("系统凭据未配置，未访问外部内容")
    } else if adapter.is_none() {
        Some("适配器尚未接入（后续P10–P12），未访问/归档")
    } else {
        None
    };
    let mut skip = reason.map(str::to_string);
    if skip.is_none() {
        let day: String = sqlx::query_scalar("SELECT date('now')")
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| "读取时钟失败")?;
        let now: i64 = sqlx::query_scalar("SELECT unixepoch('now')")
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| "读取时钟失败")?;
        let q =
            sqlx::query("SELECT used,last_started FROM collection_quota WHERE family=? AND day=?")
                .bind(family(&r.source_id))
                .bind(&day)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| "读取配额失败")?;
        let shared = if family(&r.source_id) == "sec" {
            let regs=sqlx::query("SELECT payload FROM source_registrations WHERE id IN ('sec_finance','sec_filings')").fetch_all(&mut *tx).await.map_err(|_|"读取共享配额失败")?;
            regs.into_iter()
                .filter_map(|v| serde_json::from_str::<SourceInput>(v.get("payload")).ok())
                .fold((s.daily_limit, s.min_interval_secs), |(l, i), v| {
                    (l.min(v.daily_limit), i.max(v.min_interval_secs))
                })
        } else {
            (s.daily_limit, s.min_interval_secs)
        };
        let last: Option<i64> =
            sqlx::query_scalar("SELECT MAX(last_started) FROM collection_quota WHERE family=?")
                .bind(family(&r.source_id))
                .fetch_one(&mut *tx)
                .await
                .map_err(|_| "读取来源间隔失败")?;
        if q.as_ref()
            .is_some_and(|q| q.get::<i64, _>("used") >= shared.0)
        {
            skip = Some("来源共享UTC日配额不足，未调用".into());
        } else if last.is_some_and(|last| now - last < shared.1) {
            skip = Some("来源共享最小间隔未到，未调用".into());
        } else {
            sqlx::query("INSERT INTO collection_quota(family,day,used,last_started) VALUES(?,?,1,?) ON CONFLICT(family,day) DO UPDATE SET used=used+1,last_started=excluded.last_started").bind(family(&r.source_id)).bind(day).bind(now).execute(&mut *tx).await.map_err(|_|"登记配额失败")?;
        }
    }
    tx.commit().await.map_err(|_| "任务领取提交失败")?;
    let (state, reason) = if let Some(skip) = skip {
        ("skipped", skip)
    } else {
        match adapter.expect("checked").collect(&r).await {
            Ok(receipt)
                if receipt.proof.len() == 64
                    && receipt.proof.bytes().all(|b| b.is_ascii_hexdigit()) =>
            {
                (
                    "succeeded",
                    format!(
                        "适配器持久化回执：{}条；proof={}",
                        receipt.records, receipt.proof
                    ),
                )
            }
            Ok(_) => ("failed", "适配器缺少有效持久化回执，不算成功".into()),
            Err(f) => (
                "failed",
                match f {
                    Failure::Network => "适配器网络失败（详情不记录，避免密钥泄漏）",
                    Failure::Parsing => "适配器格式解析失败",
                    Failure::Persistence => "适配器持久化失败",
                }
                .into(),
            ),
        }
    };
    let mut tx = con.begin().await.map_err(|_| "结果事务失败")?;
    sqlx::query("UPDATE collection_runs SET state=?,reason=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND state='running' AND attempts=?").bind(state).bind(reason).bind(&r.id).bind(r.attempts).execute(&mut *tx).await.map_err(|_|"结果保存失败；任务保持未完成")?;
    let done = row(sqlx::query("SELECT * FROM collection_runs WHERE id=?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| "结果读取失败")?);
    event(&mut tx, &done).await?;
    tx.commit().await.map_err(|_| "结果提交失败")?;
    Ok(done)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        backup::{create_backup, restore_backup},
        companies::{CompanyInput, CompanyMarket, SaveResult, create_company},
        storage::initialize_database,
    };
    use tempfile::tempdir;
    async fn fixture(root: &Path) -> (std::path::PathBuf, String) {
        let db = root.join("data/research.sqlite3");
        initialize_database(&db).await.unwrap();
        let SaveResult::Saved { record } = create_company(
            &db,
            CompanyInput {
                name: "P08虚构公司".into(),
                market: CompanyMarket::Private,
                registration: String::new(),
                listings: vec![],
            },
            false,
        )
        .await
        .unwrap() else {
            panic!("saved")
        };
        (db, record.id)
    }
    fn input() -> SourceInput {
        SourceInput {
            enabled: true,
            level: "metadata".into(),
            evidence_url: "https://example.com/terms".into(),
            evidence: "测试许可，不是真实授权".into(),
            purpose: "个人测试".into(),
            purpose_confirmed: true,
            daily_limit: 1,
            min_interval_secs: 1,
        }
    }
    #[tokio::test]
    async fn no_license_skips_without_fetch_and_duplicates_keep_same_run() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let source = sources(&db).await.unwrap();
        assert!(source.iter().all(|s| !s.input.enabled));
        let r = enqueue(&db, &c, "sec_finance", "manual1").await.unwrap();
        assert_eq!(r.state, "queued");
        assert_eq!(enqueue(&db, &c, "sec_finance", "manual1").await.unwrap(), r);
        let done = execute(&db, &r.id, false).await.unwrap();
        assert_eq!(done.state, "skipped");
        assert!(!done.reason.is_empty());
        assert_eq!(execute(&db, &r.id, false).await.unwrap(), done);
        assert_eq!(runs(&db).await.unwrap().len(), 1);
        assert_eq!(events(&db, &r.id).await.unwrap().len(), 3);
    }
    #[tokio::test]
    async fn registered_source_without_adapter_never_becomes_success() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        save_source(&db, "gnews", input(), 0).await.unwrap();
        let r = enqueue(&db, &c, "gnews", "1").await.unwrap();
        let s = execute(&db, &r.id, false).await.unwrap();
        assert_eq!(s.state, "skipped");
        assert!(s.reason.contains("凭据"));
        retry(&db, &r.id).await.unwrap();
        let s = execute(&db, &r.id, true).await.unwrap();
        assert_eq!(s.state, "skipped");
        assert!(s.reason.contains("适配器"));
        retry(&db, &r.id).await.unwrap();
        execute(&db, &r.id, true).await.unwrap();
        assert!(retry(&db, &r.id).await.is_err());
    }
    #[tokio::test]
    async fn source_conflicts_invalid_inputs_and_unknown_company_do_not_write() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let good = save_source(&db, "sec_finance", input(), 0).await.unwrap();
        assert_eq!(good.revision, 1);
        assert!(save_source(&db, "sec_finance", input(), 0).await.is_err());
        let mut bad = input();
        bad.evidence_url = "https://example.com/?apikey=secret".into();
        assert!(save_source(&db, "sec_finance", bad, 1).await.is_err());
        assert!(enqueue(&db, "missing", "sec_finance", "x").await.is_err());
        assert!(enqueue(&db, &c, "custom", "x").await.is_err());
        assert_eq!(
            sources(&db)
                .await
                .unwrap()
                .into_iter()
                .find(|s| s.id == "sec_finance")
                .unwrap(),
            good
        );
    }
    struct Probe {
        calls: std::sync::atomic::AtomicUsize,
        fail: bool,
    }
    impl Adapter for Probe {
        fn collect<'a>(
            &'a self,
            _r: &'a Run,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<Receipt, Failure>> + Send + 'a>,
        > {
            Box::pin(async move {
                self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if self.fail {
                    Err(Failure::Network)
                } else {
                    Ok(Receipt {
                        records: 1,
                        proof: "a".repeat(64),
                    })
                }
            })
        }
    }
    #[tokio::test]
    async fn adapter_failures_quota_and_simultaneous_claims_use_single_pipeline() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        save_source(&db, "sec_finance", input(), 0).await.unwrap();
        save_source(&db, "sec_filings", input(), 0).await.unwrap();
        let probe = Probe {
            calls: std::sync::atomic::AtomicUsize::new(0),
            fail: false,
        };
        let r = enqueue(&db, &c, "sec_finance", "first").await.unwrap();
        let (a, b) = tokio::join!(
            execute_with(&db, &r.id, false, Some(&probe)),
            execute_with(&db, &r.id, false, Some(&probe))
        );
        a.unwrap();
        b.unwrap();
        assert_eq!(probe.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(get_run(&db, &r.id).await.unwrap().state, "succeeded");
        assert!(retry(&db, &r.id).await.is_err());
        let r2 = enqueue(&db, &c, "sec_filings", "other").await.unwrap();
        let out = execute_with(&db, &r2.id, false, Some(&probe))
            .await
            .unwrap();
        assert_eq!(out.state, "skipped");
        assert!(out.reason.contains("配额"));
        assert_eq!(probe.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        let mut con = connect(&db).await.unwrap();
        sqlx::query("DELETE FROM collection_quota")
            .execute(&mut con)
            .await
            .unwrap();
        let failing = Probe {
            calls: std::sync::atomic::AtomicUsize::new(0),
            fail: true,
        };
        retry(&db, &r2.id).await.unwrap();
        let out = execute_with(&db, &r2.id, false, Some(&failing))
            .await
            .unwrap();
        assert_eq!(out.state, "failed");
        assert!(out.reason.contains("网络失败"));
        assert!(!out.reason.contains("secret"));
    }
    #[tokio::test]
    async fn enabled_without_evidence_skips_before_adapter_call() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let mut i = input();
        i.evidence.clear();
        save_source(&db, "sec_finance", i, 0).await.unwrap();
        let r = enqueue(&db, &c, "sec_finance", "once").await.unwrap();
        let probe = Probe {
            calls: std::sync::atomic::AtomicUsize::new(0),
            fail: false,
        };
        let out = execute_with(&db, &r.id, false, Some(&probe)).await.unwrap();
        assert_eq!(out.state, "skipped");
        assert!(out.reason.contains("许可依据"));
        assert_eq!(probe.calls.load(std::sync::atomic::Ordering::SeqCst), 0);
    }
    #[tokio::test]
    async fn quota_interval_survives_day_rollover_and_backup() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let mut settings = input();
        settings.daily_limit = 100;
        settings.min_interval_secs = 86400;
        save_source(&db, "sec_finance", settings, 0).await.unwrap();
        let mut con = connect(&db).await.unwrap();
        // Previous UTC bucket and a recent start prove that the interval is independent of the daily reset.
        sqlx::query("INSERT INTO collection_quota(family,day,used,last_started) VALUES('sec',date('now','-1 day'),1,unixepoch('now')-1)").execute(&mut con).await.unwrap();
        let r = enqueue(&db, &c, "sec_finance", "rollover").await.unwrap();
        let probe = Probe {
            calls: std::sync::atomic::AtomicUsize::new(0),
            fail: false,
        };
        let out = execute_with(&db, &r.id, false, Some(&probe)).await.unwrap();
        assert_eq!(out.state, "skipped");
        assert!(out.reason.contains("最小间隔"));
        assert_eq!(probe.calls.load(std::sync::atomic::Ordering::SeqCst), 0);
        let b = t.path().join("backup");
        create_backup(db.parent().unwrap(), &b).await.unwrap();
        let root = t.path().join("restore");
        restore_backup(&b, &root).await.unwrap();
        let mut restored = connect(&root.join("research.sqlite3")).await.unwrap();
        let values: (String, i64, i64) =
            sqlx::query_as("SELECT day,used,last_started FROM collection_quota WHERE family='sec'")
                .fetch_one(&mut restored)
                .await
                .unwrap();
        let original: (String, i64, i64) =
            sqlx::query_as("SELECT day,used,last_started FROM collection_quota WHERE family='sec'")
                .fetch_one(&mut con)
                .await
                .unwrap();
        assert_eq!(values, original);
    }
    struct OutcomeProbe(Option<Failure>);
    impl Adapter for OutcomeProbe {
        fn collect<'a>(
            &'a self,
            _r: &'a Run,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<Receipt, Failure>> + Send + 'a>,
        > {
            Box::pin(async move {
                match self.0 {
                    Some(f) => Err(f),
                    None => Ok(Receipt {
                        records: 0,
                        proof: "invalid".into(),
                    }),
                }
            })
        }
    }
    #[tokio::test]
    async fn failure_classes_and_invalid_receipts_are_never_success() {
        for (failure, reason) in [
            (Some(Failure::Network), "网络失败"),
            (Some(Failure::Parsing), "解析失败"),
            (Some(Failure::Persistence), "持久化失败"),
            (None, "缺少有效持久化回执"),
        ] {
            let t = tempdir().unwrap();
            let (db, c) = fixture(t.path()).await;
            save_source(&db, "sec_finance", input(), 0).await.unwrap();
            let r = enqueue(&db, &c, "sec_finance", "failure").await.unwrap();
            let out = execute_with(&db, &r.id, false, Some(&OutcomeProbe(failure)))
                .await
                .unwrap();
            assert_eq!(out.state, "failed");
            assert!(out.reason.contains(reason));
            let events = events(&db, &r.id).await.unwrap();
            assert_eq!(
                events.iter().map(|e| e.state.as_str()).collect::<Vec<_>>(),
                vec!["queued", "running", "failed"]
            );
            let mut con = connect(&db).await.unwrap();
            assert!(
                sqlx::query("UPDATE collection_events SET reason='changed' WHERE run_id=?")
                    .bind(&r.id)
                    .execute(&mut con)
                    .await
                    .is_err()
            );
            assert!(
                sqlx::query("DELETE FROM collection_events WHERE run_id=?")
                    .bind(&r.id)
                    .execute(&mut con)
                    .await
                    .is_err()
            );
        }
    }
    #[tokio::test]
    async fn v6_migration_keeps_dashboard_or_rolls_back_conflict() {
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
            ] {
                sqlx::raw_sql(sql).execute(&mut con).await.unwrap();
            }
            sqlx::query("INSERT INTO dashboard_config(singleton,revision,payload) VALUES(1,2,'{\"groups\":[],\"cards\":[]}')").execute(&mut con).await.unwrap();
            if conflict {
                sqlx::query("CREATE TABLE collection_runs(old TEXT)")
                    .execute(&mut con)
                    .await
                    .unwrap();
            }
            drop(con);
            let result = initialize_database(&db).await;
            if conflict {
                assert!(result.is_err());
            } else {
                assert_eq!(result.unwrap().schema_version, 8);
            }
            let mut con = connect(&db).await.unwrap();
            let version: i64 = sqlx::query_scalar("PRAGMA user_version")
                .fetch_one(&mut con)
                .await
                .unwrap();
            assert_eq!(version, if conflict { 6 } else { 8 });
            let revision: i64 = sqlx::query_scalar("SELECT revision FROM dashboard_config")
                .fetch_one(&mut con)
                .await
                .unwrap();
            assert_eq!(revision, 2);
            assert!(db.with_extension("v6-backup.sqlite3").is_file());
        }
    }
    #[tokio::test]
    async fn registry_runs_events_roundtrip_without_credentials() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        save_source(&db, "sec_finance", input(), 0).await.unwrap();
        let r = enqueue(&db, &c, "sec_finance", "once").await.unwrap();
        execute(&db, &r.id, false).await.unwrap();
        let b = t.path().join("backup");
        assert_eq!(
            create_backup(db.parent().unwrap(), &b)
                .await
                .unwrap()
                .schema_version,
            8
        );
        let restore = t.path().join("restore");
        restore_backup(&b, &restore).await.unwrap();
        let restored = restore.join("research.sqlite3");
        assert_eq!(
            sources(&db).await.unwrap(),
            sources(&restored).await.unwrap()
        );
        assert_eq!(runs(&db).await.unwrap(), runs(&restored).await.unwrap());
        assert_eq!(
            events(&db, &r.id).await.unwrap(),
            events(&restored, &r.id).await.unwrap()
        );
    }
}
