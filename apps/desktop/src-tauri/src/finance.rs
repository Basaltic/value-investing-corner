use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct FactInput {
    pub metric: String,
    pub value: Option<f64>,
    pub currency: String,
    pub unit: String,
    pub period_kind: String,
    pub period_start: String,
    pub period_end: String,
    pub standard: String,
    pub scope: String,
    pub basis: String,
    pub reviewed: bool,
    pub source: String,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct DefinitionInput {
    pub name: String,
    pub value_type: String,
    pub currency: String,
    pub unit: String,
    pub basis: String,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ObservationInput {
    pub definition_id: String,
    pub date: String,
    pub numeric_value: Option<f64>,
    pub text_value: Option<String>,
    pub reviewed: bool,
    pub source: String,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Version<T> {
    pub id: String,
    pub company_id: String,
    pub series_id: String,
    pub version: i64,
    pub created_at: String,
    pub input: T,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Definition {
    pub id: String,
    pub company_id: String,
    pub input: DefinitionInput,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Derived {
    pub id: String,
    pub metric: String,
    pub formula_version: String,
    pub context: FactInput,
    pub input_ids: Vec<String>,
    pub value: Option<f64>,
    pub issue: String,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct FinanceState {
    pub facts: Vec<Version<FactInput>>,
    pub definitions: Vec<Definition>,
    pub observations: Vec<Version<ObservationInput>>,
    pub derived: Vec<Derived>,
    pub derived_history: Vec<Derived>,
}

use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use sqlx::{Connection, Row, SqliteConnection, sqlite::SqliteConnectOptions};
use std::collections::BTreeMap;

fn error(e: impl std::fmt::Display) -> String {
    format!("财务与观测存储失败：{e}")
}
async fn connect(db: &Path) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db).foreign_keys(true))
        .await
        .map_err(error)
}
fn version<T: DeserializeOwned>(r: sqlx::sqlite::SqliteRow) -> Result<Version<T>, String> {
    Ok(Version {
        id: r.get("id"),
        company_id: r.get("company_id"),
        series_id: r.get("series_id"),
        version: r.get("version"),
        created_at: r.get("created_at"),
        input: serde_json::from_str(r.get("payload")).map_err(error)?,
    })
}
fn date(s: &str) -> bool {
    if !s.is_ascii()
        || s.len() != 10
        || s.as_bytes()[4] != b'-'
        || s.as_bytes()[7] != b'-'
        || s.bytes()
            .enumerate()
            .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
    {
        return false;
    }
    let Ok(y) = s[..4].parse::<u32>() else {
        return false;
    };
    let Ok(m) = s[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(d) = s[8..].parse::<u32>() else {
        return false;
    };
    let leap = y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400));
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    y > 0 && d > 0 && d <= days
}
fn string(s: &str, max: usize) -> Result<(), String> {
    if s.len() > max || s.contains('\0') {
        Err("文本过长或含空字符".into())
    } else {
        Ok(())
    }
}
fn number(v: Option<f64>) -> Result<(), String> {
    if v.is_some_and(|n| !n.is_finite() || n.abs() > 1e18) {
        Err("数值必须有限且绝对值不超过10^18".into())
    } else {
        Ok(())
    }
}
fn tags(v: &[String]) -> Result<(), String> {
    if v.len() > 30 {
        return Err("标签不能超过30个".into());
    }
    for s in v {
        string(s, 100)?;
    }
    Ok(())
}
fn valid_fact(v: &FactInput) -> Result<(), String> {
    if !matches!(
        v.metric.as_str(),
        "revenue"
            | "cost"
            | "net_income"
            | "parent_net_income"
            | "cfo"
            | "capex"
            | "assets"
            | "liabilities"
            | "equity"
            | "parent_equity"
    ) {
        return Err("不支持的原始科目".into());
    }
    number(v.value)?;
    if v.metric == "capex" && v.value.is_some_and(|n| n < 0.) {
        return Err("资本开支使用正支出口径".into());
    }
    if !date(&v.period_end) {
        return Err("期间结束日不是合法日期".into());
    }
    let instant = matches!(
        v.metric.as_str(),
        "assets" | "liabilities" | "equity" | "parent_equity"
    );
    if instant {
        if v.period_kind != "instant" || !v.period_start.is_empty() {
            return Err("资产负债项须为期末时点，开始日留空".into());
        }
    } else if !matches!(
        v.period_kind.as_str(),
        "annual" | "quarter" | "ytd" | "custom"
    ) || !date(&v.period_start)
        || v.period_start > v.period_end
    {
        return Err("流量科目须指定合法期间起止和类型".into());
    }
    for s in [&v.currency, &v.unit, &v.standard, &v.scope] {
        string(s, 100)?;
    }
    string(&v.basis, 1000)?;
    string(&v.source, 2000)?;
    tags(&v.tags)
}
fn eligible(v: &FactInput) -> bool {
    v.reviewed
        && v.value.is_some()
        && [&v.currency, &v.unit, &v.standard, &v.scope, &v.basis]
            .iter()
            .all(|s| !s.trim().is_empty())
}
fn context(v: &FactInput) -> String {
    serde_json::json!([
        v.currency,
        v.unit,
        v.period_kind,
        v.period_start,
        v.period_end,
        v.standard,
        v.scope,
        v.basis
    ])
    .to_string()
}
fn same(a: &FactInput, b: &FactInput, instant: bool) -> bool {
    a.currency == b.currency
        && a.unit == b.unit
        && a.standard == b.standard
        && a.scope == b.scope
        && a.basis == b.basis
        && a.period_end == b.period_end
        && if instant {
            b.period_kind == "instant"
        } else {
            a.period_kind == b.period_kind && a.period_start == b.period_start
        }
}
fn latest<T>(rows: &[Version<T>]) -> Vec<&Version<T>> {
    let mut m: BTreeMap<&str, &Version<T>> = BTreeMap::new();
    for r in rows {
        if m.get(r.series_id.as_str())
            .is_none_or(|old| r.version > old.version)
        {
            m.insert(&r.series_id, r);
        }
    }
    m.into_values().collect()
}
fn derive(rows: &[Version<FactInput>]) -> Vec<Derived> {
    let current = latest(rows);
    let mut out = vec![];
    for (metric, left, right, instant) in [
        ("fcf", "cfo", "capex", false),
        ("roe", "parent_net_income", "parent_equity", true),
        ("gross_margin", "revenue", "cost", false),
        ("net_margin", "revenue", "net_income", false),
        ("debt_ratio", "assets", "liabilities", false),
    ] {
        let mut groups = BTreeMap::new();
        for r in &current {
            if r.input.metric == left || (r.input.metric == right && !instant) {
                groups
                    .entry(context(&r.input))
                    .or_insert_with(|| r.input.clone());
            }
        }
        for (_, ctx) in groups {
            let ctx = &ctx;
            let a: Vec<_> = current
                .iter()
                .filter(|r| r.input.metric == left && same(ctx, &r.input, false))
                .collect();
            let b: Vec<_> = current
                .iter()
                .filter(|r| r.input.metric == right && same(ctx, &r.input, instant))
                .collect();
            let input_ids: Vec<String> = a.iter().chain(b.iter()).map(|r| r.id.clone()).collect();
            let mut issue = String::new();
            let mut value = None;
            if a.len() != 1 || b.len() != 1 {
                issue = "缺少兼容输入或存在重复候选，未计算".into();
            } else if !eligible(&a[0].input) || !eligible(&b[0].input) {
                issue = "输入待审核、缺值或口径不全，未计算".into();
            } else {
                let x = a[0].input.value.unwrap();
                let y = b[0].input.value.unwrap();
                let n = match metric {
                    "fcf" => Some(x - y),
                    "roe" => {
                        if y == 0. {
                            None
                        } else {
                            Some(x / y)
                        }
                    }
                    "gross_margin" => {
                        if x == 0. {
                            None
                        } else {
                            Some((x - y) / x)
                        }
                    }
                    _ => {
                        if x == 0. {
                            None
                        } else {
                            Some(y / x)
                        }
                    }
                };
                if n.is_some_and(f64::is_finite) {
                    value = n;
                } else {
                    issue = "分母为零或计算溢出，未计算".into();
                }
            }
            let mut clean = ctx.clone();
            clean.metric = metric.into();
            clean.value = None;
            clean.tags = vec![];
            clean.source = String::new();
            clean.reviewed = value.is_some();
            let fingerprint =
                serde_json::json!([metric, "p06-v1", context(ctx), input_ids, value, issue])
                    .to_string();
            let id = format!("{:x}", Sha256::digest(fingerprint.as_bytes()));
            out.push(Derived {
                id,
                metric: metric.into(),
                formula_version: "p06-v1".into(),
                context: clean,
                input_ids,
                value,
                issue,
            });
        }
    }
    out
}
async fn facts(
    con: &mut SqliteConnection,
    company: &str,
) -> Result<Vec<Version<FactInput>>, String> {
    sqlx::query("SELECT * FROM financial_versions WHERE company_id=? ORDER BY created_at,id")
        .bind(company)
        .fetch_all(con)
        .await
        .map_err(error)?
        .into_iter()
        .map(version)
        .collect()
}
async fn snapshots(con: &mut SqliteConnection, company: &str) -> Result<(), String> {
    for d in derive(&facts(con, company).await?) {
        if d.value.is_some() {
            sqlx::query("INSERT OR IGNORE INTO derived_snapshots(id,company_id,fingerprint,payload) VALUES(?,?,?,?)").bind(&d.id).bind(company).bind(&d.id).bind(serde_json::to_string(&d).map_err(error)?).execute(&mut *con).await.map_err(error)?;
        }
    }
    Ok(())
}
pub async fn state(db: &Path, company: &str) -> Result<FinanceState, String> {
    crate::companies::get_company(db, company).await?;
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(error)?;
    let f = facts(&mut tx, company).await?;
    let definitions =
        sqlx::query("SELECT * FROM metric_definitions WHERE company_id=? ORDER BY id")
            .bind(company)
            .fetch_all(&mut *tx)
            .await
            .map_err(error)?
            .into_iter()
            .map(|r| {
                Ok(Definition {
                    id: r.get("id"),
                    company_id: r.get("company_id"),
                    input: serde_json::from_str(r.get("payload")).map_err(error)?,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
    let observations =
        sqlx::query("SELECT * FROM observation_versions WHERE company_id=? ORDER BY created_at,id")
            .bind(company)
            .fetch_all(&mut *tx)
            .await
            .map_err(error)?
            .into_iter()
            .map(version)
            .collect::<Result<Vec<_>, _>>()?;
    let derived_history =
        sqlx::query("SELECT payload FROM derived_snapshots WHERE company_id=? ORDER BY id")
            .bind(company)
            .fetch_all(&mut *tx)
            .await
            .map_err(error)?
            .into_iter()
            .map(|r| serde_json::from_str(r.get("payload")).map_err(error))
            .collect::<Result<Vec<_>, _>>()?;
    let derived = derive(&f);
    tx.commit().await.map_err(error)?;
    Ok(FinanceState {
        facts: f,
        definitions,
        observations,
        derived,
        derived_history,
    })
}
pub async fn save_fact(
    db: &Path,
    company: &str,
    input: FactInput,
    base: Option<&str>,
) -> Result<Version<FactInput>, String> {
    valid_fact(&input)?;
    crate::companies::get_company(db, company).await?;
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(error)?;
    let (series, number) = if let Some(id) = base {
        let old = sqlx::query("SELECT * FROM financial_versions WHERE id=? AND company_id=?")
            .bind(id)
            .bind(company)
            .fetch_optional(&mut *tx)
            .await
            .map_err(error)?
            .ok_or("修订基版不属于本公司")?;
        let old: Version<FactInput> = version(old)?;
        let max: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM financial_versions WHERE series_id=?")
                .bind(&old.series_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(error)?;
        if old.version != max {
            return Err("事实版本冲突，重新核对后修订".into());
        }
        if old.input.metric != input.metric || context(&old.input) != context(&input) {
            return Err("修订不改变科目/期间/币种/单位/口径；请新建独立事实".into());
        }
        (old.series_id, max + 1)
    } else {
        (uuid::Uuid::new_v4().to_string(), 1)
    };
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO financial_versions(id,company_id,series_id,version,payload) VALUES(?,?,?,?,?)",
    )
    .bind(&id)
    .bind(company)
    .bind(series)
    .bind(number)
    .bind(serde_json::to_string(&input).map_err(error)?)
    .execute(&mut *tx)
    .await
    .map_err(error)?;
    snapshots(&mut tx, company).await?;
    let saved = version(
        sqlx::query("SELECT * FROM financial_versions WHERE id=?")
            .bind(id)
            .fetch_one(&mut *tx)
            .await
            .map_err(error)?,
    )?;
    tx.commit().await.map_err(error)?;
    Ok(saved)
}
pub async fn define(
    db: &Path,
    company: &str,
    input: DefinitionInput,
) -> Result<Definition, String> {
    if input.name.trim().is_empty() || !matches!(input.value_type.as_str(), "number" | "text") {
        return Err("指标名称必填，类型仅数值或文本".into());
    }
    for s in [&input.name, &input.currency, &input.unit] {
        string(s, 200)?;
    }
    string(&input.basis, 1000)?;
    if input.value_type == "text" && (!input.unit.is_empty() || !input.currency.is_empty()) {
        return Err("文本指标不设置数值单位/币种".into());
    }
    crate::companies::get_company(db, company).await?;
    let mut con = connect(db).await?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO metric_definitions(id,company_id,payload) VALUES(?,?,?)")
        .bind(&id)
        .bind(company)
        .bind(serde_json::to_string(&input).map_err(error)?)
        .execute(&mut con)
        .await
        .map_err(error)?;
    Ok(Definition {
        id,
        company_id: company.into(),
        input,
    })
}
pub async fn observe(
    db: &Path,
    company: &str,
    input: ObservationInput,
    base: Option<&str>,
) -> Result<Version<ObservationInput>, String> {
    if !date(&input.date) {
        return Err("观测日不是合法日期".into());
    }
    number(input.numeric_value)?;
    if let Some(s) = &input.text_value {
        string(s, 10000)?;
    }
    string(&input.source, 2000)?;
    tags(&input.tags)?;
    crate::companies::get_company(db, company).await?;
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(error)?;
    let d = sqlx::query("SELECT payload FROM metric_definitions WHERE id=? AND company_id=?")
        .bind(&input.definition_id)
        .bind(company)
        .fetch_optional(&mut *tx)
        .await
        .map_err(error)?
        .ok_or("指标定义不属于本公司")?;
    let d: DefinitionInput = serde_json::from_str(d.get("payload")).map_err(error)?;
    if (d.value_type == "number" && input.text_value.is_some())
        || (d.value_type == "text" && input.numeric_value.is_some())
    {
        return Err("观测值类型与指标定义不一致".into());
    }
    let (series, n) = if let Some(id) = base {
        let old: Version<ObservationInput> = version(
            sqlx::query("SELECT * FROM observation_versions WHERE id=? AND company_id=?")
                .bind(id)
                .bind(company)
                .fetch_optional(&mut *tx)
                .await
                .map_err(error)?
                .ok_or("观测基版不属于本公司")?,
        )?;
        let max: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM observation_versions WHERE series_id=?")
                .bind(&old.series_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(error)?;
        if old.version != max {
            return Err("观测版本冲突，重新核对".into());
        }
        if old.input.definition_id != input.definition_id || old.input.date != input.date {
            return Err("修订保持定义与观测日；变更需新建".into());
        }
        (old.series_id, max + 1)
    } else {
        (uuid::Uuid::new_v4().to_string(), 1)
    };
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO observation_versions(id,company_id,series_id,version,payload,definition_id) VALUES(?,?,?,?,?,?)").bind(&id).bind(company).bind(series).bind(n).bind(serde_json::to_string(&input).map_err(error)?).bind(&input.definition_id).execute(&mut *tx).await.map_err(error)?;
    let saved = version(
        sqlx::query("SELECT * FROM observation_versions WHERE id=?")
            .bind(id)
            .fetch_one(&mut *tx)
            .await
            .map_err(error)?,
    )?;
    tx.commit().await.map_err(error)?;
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        backup::{create_backup, restore_backup},
        companies::{CompanyInput, CompanyMarket, SaveResult, create_company},
        storage::initialize_database,
    };
    use sqlx::Connection;
    use tempfile::tempdir;
    async fn fixture(root: &Path) -> (std::path::PathBuf, String) {
        let db = root.join("data/research.sqlite3");
        initialize_database(&db).await.unwrap();
        let SaveResult::Saved { record } = create_company(
            &db,
            CompanyInput {
                name: "P06虚构测试公司".into(),
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
    fn fact(metric: &str, value: Option<f64>) -> FactInput {
        let instant = matches!(
            metric,
            "assets" | "liabilities" | "parent_equity" | "equity"
        );
        FactInput {
            metric: metric.into(),
            value,
            currency: "CNY".into(),
            unit: "元".into(),
            period_kind: if instant { "instant" } else { "annual" }.into(),
            period_start: if instant { "" } else { "2025-01-01" }.into(),
            period_end: "2025-12-31".into(),
            standard: "CAS".into(),
            scope: "consolidated".into(),
            basis: "测试合并报表".into(),
            reviewed: true,
            source: "虚构夹具，不是真实公司数据".into(),
            tags: vec!["测试".into()],
        }
    }
    #[tokio::test]
    async fn missing_left_input_keeps_derived_period_as_explicit_gap() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        for (year, revenue) in [(2023, Some(100.)), (2024, None), (2025, Some(140.))] {
            for (metric, value) in [("revenue", revenue), ("cost", Some(60.))] {
                if value.is_none() {
                    continue;
                }
                let mut f = fact(metric, value);
                f.period_start = format!("{year}-01-01");
                f.period_end = format!("{year}-12-31");
                save_fact(&db, &c, f, None).await.unwrap();
            }
        }
        let s = state(&db, &c).await.unwrap();
        let d = s
            .derived
            .iter()
            .find(|d| d.metric == "gross_margin" && d.context.period_end == "2024-12-31")
            .expect("2024 gap must not vanish");
        assert!(d.value.is_none());
        assert!(!d.issue.is_empty());
    }

    #[tokio::test]
    async fn fixed_formulas_use_compatible_reviewed_inputs_and_keep_version_provenance() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        for (m, v) in [
            ("revenue", 100.),
            ("cost", 60.),
            ("net_income", 10.),
            ("parent_net_income", 8.),
            ("cfo", 20.),
            ("capex", 5.),
            ("assets", 200.),
            ("liabilities", 80.),
            ("parent_equity", 40.),
        ] {
            save_fact(&db, &c, fact(m, Some(v)), None).await.unwrap();
        }
        let s = state(&db, &c).await.unwrap();
        for (m, expected) in [
            ("fcf", 15.),
            ("roe", 0.2),
            ("gross_margin", 0.4),
            ("net_margin", 0.1),
            ("debt_ratio", 0.4),
        ] {
            let d = s
                .derived
                .iter()
                .find(|d| d.metric == m && d.value.is_some())
                .unwrap();
            assert!((d.value.unwrap() - expected).abs() < 1e-12);
            assert_eq!(d.input_ids.len(), 2);
            assert_eq!(d.formula_version, "p06-v1");
        }
        let r = s
            .facts
            .iter()
            .find(|v| v.input.metric == "revenue")
            .unwrap();
        let mut next = r.input.clone();
        next.value = Some(200.);
        save_fact(&db, &c, next, Some(&r.id)).await.unwrap();
        let updated = state(&db, &c).await.unwrap();
        assert!(updated.facts.iter().any(|v| v == r));
        assert!(
            updated
                .derived_history
                .iter()
                .any(|d| d.metric == "gross_margin" && d.value == Some(0.4))
        );
        assert!(
            updated
                .derived
                .iter()
                .any(|d| d.metric == "gross_margin" && d.value == Some(0.7))
        );
        assert!(
            save_fact(&db, &c, r.input.clone(), Some(&r.id))
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn missing_unreviewed_and_incompatible_data_never_become_zero_or_ratios() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let mut revenue = fact("revenue", None);
        revenue.reviewed = false;
        save_fact(&db, &c, revenue, None).await.unwrap();
        let mut cost = fact("cost", Some(10.));
        cost.currency = "USD".into();
        save_fact(&db, &c, cost, None).await.unwrap();
        let mut cfo = fact("cfo", Some(20.));
        cfo.basis = String::new();
        save_fact(&db, &c, cfo, None).await.unwrap();
        save_fact(&db, &c, fact("capex", Some(5.)), None)
            .await
            .unwrap();
        let s = state(&db, &c).await.unwrap();
        assert_eq!(
            s.facts
                .iter()
                .find(|r| r.input.metric == "revenue")
                .unwrap()
                .input
                .value,
            None
        );
        assert!(s.derived.iter().all(|d| d.value.is_none()));
        assert!(s.derived.iter().all(|d| !d.issue.is_empty()));
    }
    #[tokio::test]
    async fn zero_denominators_and_duplicate_metrics_are_explicit_gaps() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        save_fact(&db, &c, fact("revenue", Some(0.)), None)
            .await
            .unwrap();
        save_fact(&db, &c, fact("cost", Some(2.)), None)
            .await
            .unwrap();
        assert!(
            state(&db, &c)
                .await
                .unwrap()
                .derived
                .iter()
                .filter(|d| d.metric == "gross_margin")
                .all(|d| d.value.is_none())
        );
        save_fact(&db, &c, fact("revenue", Some(50.)), None)
            .await
            .unwrap();
        assert!(
            state(&db, &c)
                .await
                .unwrap()
                .derived
                .iter()
                .filter(|d| d.metric == "gross_margin")
                .all(|d| d.value.is_none())
        );
    }
    #[tokio::test]
    async fn numeric_and_text_observations_keep_empty_values_and_immutable_history() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let n = define(
            &db,
            &c,
            DefinitionInput {
                name: "客户数".into(),
                value_type: "number".into(),
                currency: String::new(),
                unit: "人".into(),
                basis: "期末客户".into(),
            },
        )
        .await
        .unwrap();
        let text = define(
            &db,
            &c,
            DefinitionInput {
                name: "护城河证伪线索".into(),
                value_type: "text".into(),
                currency: String::new(),
                unit: String::new(),
                basis: "个人观察".into(),
            },
        )
        .await
        .unwrap();
        let empty = ObservationInput {
            definition_id: n.id,
            date: "2025-12-31".into(),
            numeric_value: None,
            text_value: None,
            reviewed: false,
            source: String::new(),
            tags: vec![],
        };
        let v = observe(&db, &c, empty.clone(), None).await.unwrap();
        let mut next = empty;
        next.numeric_value = Some(12.);
        next.reviewed = true;
        observe(&db, &c, next, Some(&v.id)).await.unwrap();
        let tx = ObservationInput {
            definition_id: text.id,
            date: "2025-12-31".into(),
            numeric_value: None,
            text_value: Some("等待复购验证".into()),
            reviewed: true,
            source: "自己输入".into(),
            tags: vec![],
        };
        observe(&db, &c, tx, None).await.unwrap();
        let s = state(&db, &c).await.unwrap();
        assert_eq!(s.observations.len(), 3);
        assert!(s.observations.contains(&v));
        let mut con = sqlx::SqliteConnection::connect_with(
            &sqlx::sqlite::SqliteConnectOptions::new().filename(&db),
        )
        .await
        .unwrap();
        assert!(
            sqlx::query("UPDATE observation_versions SET payload='{}'")
                .execute(&mut con)
                .await
                .is_err()
        );
        save_fact(&db, &c, fact("revenue", Some(1.)), None)
            .await
            .unwrap();
        assert!(
            sqlx::query("DELETE FROM financial_versions")
                .execute(&mut con)
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn rejects_invalid_dates_values_types_and_cross_company_revisions() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        for date in ["2025-02-29", "2025-13-01", "not-date"] {
            let mut f = fact("revenue", Some(1.));
            f.period_end = date.into();
            assert!(save_fact(&db, &c, f, None).await.is_err());
        }
        let mut f = fact("capex", Some(-1.));
        assert!(save_fact(&db, &c, f.clone(), None).await.is_err());
        f.value = Some(f64::INFINITY);
        assert!(save_fact(&db, &c, f, None).await.is_err());
        assert!(
            save_fact(&db, "unknown", fact("revenue", Some(1.)), None)
                .await
                .is_err()
        );
        let f = save_fact(&db, &c, fact("assets", Some(10.)), None)
            .await
            .unwrap();
        let SaveResult::Saved { record: other } = create_company(
            &db,
            CompanyInput {
                name: "另一家公司".into(),
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
        assert!(
            save_fact(&db, &other.id, f.input, Some(&f.id))
                .await
                .is_err()
        );
        let d = define(
            &db,
            &c,
            DefinitionInput {
                name: "数值".into(),
                value_type: "number".into(),
                currency: String::new(),
                unit: "人".into(),
                basis: "期末".into(),
            },
        )
        .await
        .unwrap();
        let obs = ObservationInput {
            definition_id: d.id,
            date: "2025-12-31".into(),
            numeric_value: Some(1.),
            text_value: None,
            reviewed: false,
            source: String::new(),
            tags: vec![],
        };
        assert!(observe(&db, &other.id, obs.clone(), None).await.is_err());
        let v = observe(&db, &c, obs.clone(), None).await.unwrap();
        let mut wrong = obs;
        wrong.text_value = Some("invalid".into());
        assert!(observe(&db, &c, wrong, Some(&v.id)).await.is_err());
        assert!(
            define(
                &db,
                &c,
                DefinitionInput {
                    name: String::new(),
                    value_type: "formula".into(),
                    currency: String::new(),
                    unit: String::new(),
                    basis: String::new()
                }
            )
            .await
            .is_err()
        );
    }
    #[tokio::test]
    #[ignore = "explicit isolated UI fixture only"]
    async fn build_isolated_gui_fixture() {
        let path = std::path::PathBuf::from(
            std::env::var("P06_FIXTURE_DB").expect("explicit fixture path"),
        );
        assert!(path.ends_with("com.valueinvestingcorner.p06validation/research.sqlite3"));
        initialize_database(&path).await.unwrap();
        assert!(
            crate::companies::list_companies(&path, "")
                .await
                .unwrap()
                .is_empty(),
            "never overwrite existing companies"
        );
        let SaveResult::Saved { record } = create_company(
            &path,
            CompanyInput {
                name: "P06财务验收公司（虚构）".into(),
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
        for (year, amount, reviewed) in [
            (2023, Some(100.), true),
            (2024, None, false),
            (2025, Some(140.), true),
        ] {
            let mut f = fact("revenue", amount);
            f.period_start = format!("{year}-01-01");
            f.period_end = format!("{year}-12-31");
            f.reviewed = reviewed;
            save_fact(&path, &record.id, f, None).await.unwrap();
        }
        save_fact(&path, &record.id, fact("cost", Some(84.)), None)
            .await
            .unwrap();
        let d = define(
            &path,
            &record.id,
            DefinitionInput {
                name: "复购验证线索（虚构）".into(),
                value_type: "text".into(),
                currency: String::new(),
                unit: String::new(),
                basis: "个人观察".into(),
            },
        )
        .await
        .unwrap();
        observe(
            &path,
            &record.id,
            ObservationInput {
                definition_id: d.id,
                date: "2025-12-31".into(),
                numeric_value: None,
                text_value: Some("这是测试公司，不是真实研究结论；继续核对复购线索。".into()),
                reviewed: true,
                source: "虚构验收夹具".into(),
                tags: vec!["测试".into()],
            },
            None,
        )
        .await
        .unwrap();
        let d = define(
            &path,
            &record.id,
            DefinitionInput {
                name: "客户数（虚构）".into(),
                value_type: "number".into(),
                currency: String::new(),
                unit: "人".into(),
                basis: "期末客户".into(),
            },
        )
        .await
        .unwrap();
        for (year, value, reviewed) in [
            (2023, Some(10.), true),
            (2024, None, false),
            (2025, Some(14.), true),
        ] {
            observe(
                &path,
                &record.id,
                ObservationInput {
                    definition_id: d.id.clone(),
                    date: format!("{year}-12-31"),
                    numeric_value: value,
                    text_value: None,
                    reviewed,
                    source: "虚构验收夹具".into(),
                    tags: vec![],
                },
                None,
            )
            .await
            .unwrap();
        }
        assert_eq!(state(&path, &record.id).await.unwrap().facts.len(), 4);
    }

    #[tokio::test]
    async fn finance_and_observation_backup_round_trip_preserves_all_versions() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        save_fact(&db, &c, fact("revenue", Some(100.)), None)
            .await
            .unwrap();
        save_fact(&db, &c, fact("cost", Some(60.)), None)
            .await
            .unwrap();
        let d = define(
            &db,
            &c,
            DefinitionInput {
                name: "观察".into(),
                value_type: "text".into(),
                currency: String::new(),
                unit: String::new(),
                basis: "个人".into(),
            },
        )
        .await
        .unwrap();
        observe(
            &db,
            &c,
            ObservationInput {
                definition_id: d.id,
                date: "2025-12-31".into(),
                numeric_value: None,
                text_value: Some("测试".into()),
                reviewed: false,
                source: String::new(),
                tags: vec!["待核".into()],
            },
            None,
        )
        .await
        .unwrap();
        let first = save_fact(&db, &c, fact("revenue", Some(100.)), None)
            .await
            .unwrap();
        let mut revised = first.input.clone();
        revised.value = Some(120.);
        save_fact(&db, &c, revised, Some(&first.id)).await.unwrap();
        let before = state(&db, &c).await.unwrap();
        let backup = t.path().join("backup");
        assert_eq!(
            create_backup(db.parent().unwrap(), &backup)
                .await
                .unwrap()
                .schema_version,
            5
        );
        let restore = t.path().join("restore");
        restore_backup(&backup, &restore).await.unwrap();
        assert_eq!(
            state(&restore.join("research.sqlite3"), &c).await.unwrap(),
            before
        );
    }
}
