use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub company_ids: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Selection {
    pub kind: String,
    pub metric: String,
    pub anchor_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Card {
    pub id: String,
    pub company_id: String,
    pub kind: String,
    pub visible: bool,
    pub selection: Option<Selection>,
    pub from: String,
    pub to: String,
    pub show_pending: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub groups: Vec<Group>,
    pub cards: Vec<Card>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Saved {
    pub revision: i64,
    pub config: Config,
}
use sqlx::{Connection, Row, SqliteConnection, sqlite::SqliteConnectOptions};
use std::collections::HashSet;
async fn connect(db: &Path) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db).foreign_keys(true))
        .await
        .map_err(|e| e.to_string())
}
fn text(s: &str, max: usize) -> Result<(), String> {
    if s.len() > max || s.contains('\0') {
        Err("配置文本过长或包含空字符".into())
    } else {
        Ok(())
    }
}
fn id(s: &str) -> Result<(), String> {
    text(s, 100)?;
    if s.trim().is_empty() {
        Err("ID不能为空".into())
    } else {
        Ok(())
    }
}
async fn validate(db: &Path, c: &Config) -> Result<(), String> {
    if c.groups.len() > 100 || c.cards.len() > 500 {
        return Err("看板最多100组、500卡片".into());
    }
    let mut ids = HashSet::new();
    let mut companies = HashSet::new();
    for g in &c.groups {
        id(&g.id)?;
        text(&g.name, 200)?;
        if g.name.trim().is_empty() || !ids.insert(&g.id) {
            return Err("组名称必填且ID不能重复".into());
        }
        if g.company_ids.len() > 500 {
            return Err("分组公司过多".into());
        }
        for cid in &g.company_ids {
            if !companies.insert(cid) {
                return Err("同一公司不能重复分组".into());
            }
            crate::companies::get_company(db, cid).await?;
        }
    }
    let mut ids = HashSet::new();
    for card in &c.cards {
        id(&card.id)?;
        if !ids.insert(&card.id) {
            return Err("卡片ID重复".into());
        }
        crate::companies::get_company(db, &card.company_id).await?;
        if !matches!(
            card.kind.as_str(),
            "metric" | "reading" | "supplement" | "judgment"
        ) {
            return Err("未知卡片模板".into());
        }
        for d in [&card.from, &card.to] {
            if !d.is_empty() && !crate::finance::date(d) {
                return Err("卡片时间范围日期无效".into());
            }
        }
        if !card.from.is_empty() && !card.to.is_empty() && card.from > card.to {
            return Err("卡片日期范围倒置".into());
        }
        if let Some(s) = &card.selection {
            if card.kind != "metric" {
                return Err("非指标卡不能附指标选择".into());
            }
            id(&s.anchor_id)?;
            text(&s.metric, 100)?;
            let state = crate::finance::state(db, &card.company_id).await?;
            let ok = match s.kind.as_str() {
                "custom" => state
                    .definitions
                    .iter()
                    .any(|d| d.id == s.anchor_id && s.metric == s.anchor_id),
                "fact" => state
                    .facts
                    .iter()
                    .any(|f| f.id == s.anchor_id && f.input.metric == s.metric),
                "derived" => {
                    matches!(
                        s.metric.as_str(),
                        "fcf" | "roe" | "gross_margin" | "net_margin" | "debt_ratio"
                    ) && state.facts.iter().any(|f| f.id == s.anchor_id)
                }
                _ => false,
            };
            if !ok {
                return Err("指标引用无效或不属于本公司".into());
            }
        }
    }
    Ok(())
}
pub async fn load(db: &Path) -> Result<Saved, String> {
    let mut con = connect(db).await?;
    let row = sqlx::query("SELECT revision,payload FROM dashboard_config WHERE singleton=1")
        .fetch_optional(&mut con)
        .await
        .map_err(|e| e.to_string())?;
    match row {
        None => Ok(Saved {
            revision: 0,
            config: Config::default(),
        }),
        Some(r) => Ok(Saved {
            revision: r.get("revision"),
            config: serde_json::from_str(r.get("payload")).map_err(|e| e.to_string())?,
        }),
    }
}
pub async fn save(db: &Path, config: Config, expected: i64) -> Result<Saved, String> {
    validate(db, &config).await?;
    if expected < 0 {
        return Err("无效配置修订号".into());
    }
    let payload = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    if payload.len() > 1_000_000 {
        return Err("配置超过1MB".into());
    }
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(|e| e.to_string())?;
    let changed=if expected==0{sqlx::query("INSERT OR IGNORE INTO dashboard_config(singleton,revision,payload) VALUES(1,1,?)").bind(payload).execute(&mut *tx).await}else{sqlx::query("UPDATE dashboard_config SET revision=revision+1,payload=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1 AND revision=?").bind(payload).bind(expected).execute(&mut *tx).await}.map_err(|e|e.to_string())?;
    if changed.rows_affected() != 1 {
        return Err("配置版本冲突，保留当前输入；重新载入核对后保存".into());
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(Saved {
        revision: expected + 1,
        config,
    })
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Item {
    pub id: String,
    pub company_id: String,
    pub kind: String,
    pub material_id: Option<String>,
    pub text: String,
    pub done: bool,
    pub revision: i64,
}
fn item(row: sqlx::sqlite::SqliteRow) -> Item {
    Item {
        id: row.get("id"),
        company_id: row.get("company_id"),
        kind: row.get("kind"),
        material_id: row.get("material_id"),
        text: row.get("text"),
        done: row.get::<i64, _>("done") == 1,
        revision: row.get("revision"),
    }
}
pub async fn items(db: &Path, company: &str) -> Result<Vec<Item>, String> {
    crate::companies::get_company(db, company).await?;
    let mut con = connect(db).await?;
    Ok(
        sqlx::query("SELECT * FROM research_items WHERE company_id=? ORDER BY created_at,id")
            .bind(company)
            .fetch_all(&mut con)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(item)
            .collect(),
    )
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ItemInput {
    pub id: Option<String>,
    pub kind: String,
    pub material_id: Option<String>,
    pub text: String,
    pub done: bool,
    pub expected_revision: i64,
}
pub async fn put(db: &Path, company: &str, input: ItemInput) -> Result<Item, String> {
    put_item(
        db,
        company,
        input.id.as_deref(),
        &input.kind,
        input.material_id.as_deref(),
        &input.text,
        input.done,
        input.expected_revision,
    )
    .await
}
#[allow(clippy::too_many_arguments)]
pub async fn put_item(
    db: &Path,
    company: &str,
    row_id: Option<&str>,
    kind: &str,
    material: Option<&str>,
    body: &str,
    done: bool,
    expected: i64,
) -> Result<Item, String> {
    crate::companies::get_company(db, company).await?;
    text(body, 5000)?;
    if expected < 0 {
        return Err("修订号无效".into());
    }
    if kind == "reading" {
        let m = crate::materials::get(db, material.ok_or("待读须选择资料")?).await?;
        if m.company_id != company {
            return Err("资料不属于本公司".into());
        }
        if row_id.is_none() && m.archived {
            return Err("归档资料不能新标待读，先在资料库恢复".into());
        }
        if !body.is_empty() {
            return Err("待读状态不写资料正文".into());
        }
    } else if kind != "supplement" || material.is_some() || body.trim().is_empty() {
        return Err("待补事项须填写内容；模板仅待读/待补".into());
    }
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(|e| e.to_string())?;
    let row_id = if let Some(rid) = row_id {
        let changed=sqlx::query("UPDATE research_items SET text=?,done=?,revision=revision+1 WHERE id=? AND company_id=? AND kind=? AND material_id IS ? AND revision=?").bind(body).bind(i64::from(done)).bind(rid).bind(company).bind(kind).bind(material).bind(expected).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        if changed.rows_affected() != 1 {
            return Err("事项版本冲突或归属不符，未写入".into());
        }
        rid.to_string()
    } else {
        if expected != 0 {
            return Err("新事项修订号须为0".into());
        }
        let rid = uuid::Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO research_items(id,company_id,kind,material_id,text,done) VALUES(?,?,?,?,?,?)").bind(&rid).bind(company).bind(kind).bind(material).bind(body).bind(i64::from(done)).execute(&mut *tx).await.map_err(|e|format!("事项写入失败（资料已标记时改用原事项）：{e}"))?;
        rid
    };
    let result = item(
        sqlx::query("SELECT * FROM research_items WHERE id=?")
            .bind(&row_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?,
    );
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(result)
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
                name: "P07虚构公司".into(),
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
    fn config(company: &str) -> Config {
        Config {
            groups: vec![Group {
                id: "group1".into(),
                name: "关注".into(),
                company_ids: vec![company.into()],
            }],
            cards: vec![
                Card {
                    id: "reading1".into(),
                    company_id: company.into(),
                    kind: "reading".into(),
                    visible: false,
                    selection: None,
                    from: "2023-01-01".into(),
                    to: "2025-12-31".into(),
                    show_pending: false,
                },
                Card {
                    id: "metric1".into(),
                    company_id: company.into(),
                    kind: "metric".into(),
                    visible: true,
                    selection: None,
                    from: String::new(),
                    to: String::new(),
                    show_pending: false,
                },
            ],
        }
    }
    #[tokio::test]
    async fn reading_and_supplement_items_are_explicit_and_backup_safe() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        assert!(items(&db, &c).await.unwrap().is_empty());
        let material = crate::materials::create_text(
            &db,
            &c,
            "note",
            crate::materials::MaterialInput {
                title: "资料".into(),
                body: "虚构".into(),
                url: String::new(),
                tags: vec![],
            },
        )
        .await
        .unwrap();
        let reading = put_item(&db, &c, None, "reading", Some(&material.id), "", false, 0)
            .await
            .unwrap();
        assert!(
            put_item(&db, &c, None, "reading", Some(&material.id), "", false, 0)
                .await
                .is_err()
        );
        let supplement = put_item(
            &db,
            &c,
            None,
            "supplement",
            None,
            "补充2024现金流",
            false,
            0,
        )
        .await
        .unwrap();
        let done = put_item(
            &db,
            &c,
            Some(&reading.id),
            "reading",
            Some(&material.id),
            "",
            true,
            0,
        )
        .await
        .unwrap();
        assert!(done.done);
        assert_eq!(done.revision, 1);
        assert!(
            put_item(
                &db,
                &c,
                Some(&reading.id),
                "reading",
                Some(&material.id),
                "",
                false,
                0
            )
            .await
            .is_err()
        );
        let b = t.path().join("backup");
        create_backup(db.parent().unwrap(), &b).await.unwrap();
        let r = t.path().join("restore");
        restore_backup(&b, &r).await.unwrap();
        assert_eq!(
            items(&r.join("research.sqlite3"), &c).await.unwrap(),
            items(&db, &c).await.unwrap()
        );
        assert!(items(&db, &c).await.unwrap().contains(&supplement));
    }
    #[tokio::test]
    async fn empty_load_is_read_only_and_config_reopens_with_order_and_visibility() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        assert_eq!(
            load(&db).await.unwrap(),
            Saved {
                revision: 0,
                config: Config::default()
            }
        );
        let cfg = config(&c);
        let s = save(&db, cfg.clone(), 0).await.unwrap();
        assert_eq!(s.revision, 1);
        assert_eq!(load(&db).await.unwrap().config, cfg);
        let mut cfg2 = cfg;
        cfg2.cards.reverse();
        cfg2.cards[1].visible = true;
        let s2 = save(&db, cfg2.clone(), 1).await.unwrap();
        assert_eq!(s2.revision, 2);
        assert_eq!(load(&db).await.unwrap().config, cfg2);
    }
    #[tokio::test]
    async fn stale_and_invalid_config_never_overwrite_saved_config() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let good = save(&db, config(&c), 0).await.unwrap();
        assert!(save(&db, Config::default(), 0).await.is_err());
        for n in 0..4 {
            let mut bad = good.config.clone();
            match n {
                0 => bad.cards[0].company_id = "unknown".into(),
                1 => bad.cards[1].id = bad.cards[0].id.clone(),
                2 => bad.cards[0].from = "2025-02-29".into(),
                _ => bad.groups[0].company_ids.push(c.clone()),
            };
            assert!(save(&db, bad, 1).await.is_err());
            assert_eq!(load(&db).await.unwrap(), good);
        }
    }
    #[tokio::test]
    async fn config_backup_preserves_groups_cards_ranges_and_revision() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let saved = save(&db, config(&c), 0).await.unwrap();
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
        assert_eq!(
            load(&restore.join("research.sqlite3")).await.unwrap(),
            saved
        );
    }
    #[tokio::test]
    async fn metric_reference_ownership_and_limits_preserve_prior_configuration() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let d = crate::finance::define(
            &db,
            &c,
            crate::finance::DefinitionInput {
                name: "客户".into(),
                value_type: "number".into(),
                unit: "人".into(),
                currency: String::new(),
                basis: "期末".into(),
            },
        )
        .await
        .unwrap();
        let SaveResult::Saved { record: other } = create_company(
            &db,
            CompanyInput {
                name: "其它公司".into(),
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
        let mut cfg = config(&c);
        cfg.cards[1].selection = Some(Selection {
            kind: "custom".into(),
            metric: d.id.clone(),
            anchor_id: d.id.clone(),
        });
        let good = save(&db, cfg.clone(), 0).await.unwrap();
        let mut wrong = cfg.clone();
        wrong.cards[1].company_id = other.id;
        assert!(save(&db, wrong, 1).await.is_err());
        let mut wrong = cfg.clone();
        wrong.cards[1].selection.as_mut().unwrap().metric = "not-definition".into();
        assert!(save(&db, wrong, 1).await.is_err());
        let mut wrong = cfg;
        wrong.cards[0].from = "2026-01-01".into();
        assert!(save(&db, wrong, 1).await.is_err());
        assert_eq!(load(&db).await.unwrap(), good);
        let b = t.path().join("backup");
        create_backup(db.parent().unwrap(), &b).await.unwrap();
        let r = t.path().join("restore");
        restore_backup(&b, &r).await.unwrap();
        assert_eq!(load(&r.join("research.sqlite3")).await.unwrap(), good);
    }
    #[tokio::test]
    #[ignore = "explicit isolated P07 GUI fixture only"]
    async fn create_p07_gui_fixture() {
        let db = std::path::PathBuf::from(
            std::env::var("P07_FIXTURE_DB").expect("explicit isolation path"),
        );
        assert!(db.ends_with("com.valueinvestingcorner.p07validation/research.sqlite3"));
        initialize_database(&db).await.unwrap();
        assert!(
            crate::companies::list_companies(&db, "")
                .await
                .unwrap()
                .is_empty(),
            "no overwrite existing data"
        );
        let SaveResult::Saved { record: c } = create_company(
            &db,
            CompanyInput {
                name: "P07看板验收公司（虚构）".into(),
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
        let mut anchor = String::new();
        for (year, value, reviewed) in [
            (2023, Some(100.), true),
            (2024, None, false),
            (2025, Some(140.), true),
        ] {
            let f = crate::finance::save_fact(
                &db,
                &c.id,
                crate::finance::FactInput {
                    metric: "revenue".into(),
                    value,
                    currency: "CNY".into(),
                    unit: "元".into(),
                    period_kind: "annual".into(),
                    period_start: format!("{year}-01-01"),
                    period_end: format!("{year}-12-31"),
                    standard: "CAS".into(),
                    scope: "合并".into(),
                    basis: "虚构验收口径".into(),
                    reviewed,
                    source: "测试数据，不是真实财务".into(),
                    tags: vec![],
                },
                None,
            )
            .await
            .unwrap();
            anchor = f.id;
        }
        let m = crate::materials::create_text(
            &db,
            &c.id,
            "note",
            crate::materials::MaterialInput {
                title: "虚构资料待阅读".into(),
                body: "仅验收用，不是真实报告".into(),
                url: String::new(),
                tags: vec![],
            },
        )
        .await
        .unwrap();
        put_item(&db, &c.id, None, "reading", Some(&m.id), "", false, 0)
            .await
            .unwrap();
        put_item(
            &db,
            &c.id,
            None,
            "supplement",
            None,
            "补充虚构2024年现金流",
            false,
            0,
        )
        .await
        .unwrap();
        let d = crate::judgments::start(&db, &c.id, None).await.unwrap();
        let saved=crate::judgments::save(&db,&d.id,0,crate::judgments::DraftInput{document:serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"仅为虚构验收判断，不是真实投资观点。"}]}]}),reason:String::new()}).await.unwrap();
        crate::judgments::freeze(&db, &d.id, saved.revision)
            .await
            .unwrap();
        let mut cfg = config(&c.id);
        cfg.cards[1].selection = Some(Selection {
            kind: "fact".into(),
            metric: "revenue".into(),
            anchor_id: anchor,
        });
        cfg.cards[0].visible = true;
        for kind in ["supplement", "judgment"] {
            cfg.cards.push(Card {
                id: kind.into(),
                company_id: c.id.clone(),
                kind: kind.into(),
                visible: true,
                selection: None,
                from: String::new(),
                to: String::new(),
                show_pending: false,
            });
        }
        save(&db, cfg, 0).await.unwrap();
    }
    #[tokio::test]
    async fn v5_migration_keeps_finance_and_conflicting_v6_rolls_back() {
        for conflict in [false, true] {
            let t = tempdir().unwrap();
            let db = t.path().join("research.sqlite3");
            use sqlx::{Connection, sqlite::SqliteConnectOptions};
            let mut con = sqlx::SqliteConnection::connect_with(
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
            ] {
                sqlx::raw_sql(sql).execute(&mut con).await.unwrap();
            }
            sqlx::query("INSERT INTO companies(id,name,market,registration) VALUES('old','旧公司','private','')").execute(&mut con).await.unwrap();
            sqlx::query("INSERT INTO financial_versions(id,company_id,series_id,version,payload) VALUES('fact','old','s',1,'{\"value\":null}')").execute(&mut con).await.unwrap();
            if conflict {
                sqlx::query("CREATE TABLE dashboard_config(old TEXT)")
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
            assert!(db.with_extension("v5-backup.sqlite3").is_file());
            let mut con =
                sqlx::SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&db))
                    .await
                    .unwrap();
            let v: i64 = sqlx::query_scalar("PRAGMA user_version")
                .fetch_one(&mut con)
                .await
                .unwrap();
            assert_eq!(v, if conflict { 5 } else { 8 });
            let count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM financial_versions WHERE id='fact'")
                    .fetch_one(&mut con)
                    .await
                    .unwrap();
            assert_eq!(count, 1);
        }
    }
}
