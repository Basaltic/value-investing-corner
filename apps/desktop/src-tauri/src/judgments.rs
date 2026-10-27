use std::path::Path;
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct DraftInput {
    pub document: serde_json::Value,
    pub reason: String,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Judgment {
    pub id: String,
    pub company_id: String,
    pub document: serde_json::Value,
    pub text: String,
    pub reason: String,
    pub revision: i64,
    pub version: Option<i64>,
    pub base_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, serde::Serialize)]
pub struct JudgmentState {
    pub draft: Option<Judgment>,
    pub versions: Vec<Judgment>,
}
use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteRow},
};
fn error(e: impl std::fmt::Display) -> String {
    format!("判断存储失败：{e}")
}
async fn connect(db: &Path) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db).foreign_keys(true))
        .await
        .map_err(error)
}
fn row(r: SqliteRow, official: bool) -> Result<Judgment, String> {
    Ok(Judgment {
        id: r.get("id"),
        company_id: r.get("company_id"),
        document: serde_json::from_str(r.get("document")).map_err(error)?,
        text: r.get("text"),
        reason: r.get("reason"),
        revision: r.get("revision"),
        version: if official {
            Some(r.get("version"))
        } else {
            None
        },
        base_id: r.get("base_id"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    })
}
fn validate(input: &DraftInput) -> Result<String, String> {
    if input.reason.len() > 4000
        || input.reason.contains('\0')
        || input.document.to_string().len() > 1_000_000
    {
        return Err("正文或修订原因过长或含空字符".into());
    }
    if input.document.get("type").and_then(|v| v.as_str()) != Some("doc") {
        return Err("正文必须是文档结构".into());
    }
    fn walk(v: &serde_json::Value, depth: usize, text: &mut String) -> Result<(), String> {
        if depth > 30 {
            return Err("正文嵌套过深".into());
        }
        let obj = v.as_object().ok_or("正文节点不是对象")?;
        let kind = obj
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or("正文节点缺少类型")?;
        if !matches!(
            kind,
            "doc"
                | "paragraph"
                | "text"
                | "heading"
                | "bulletList"
                | "orderedList"
                | "listItem"
                | "blockquote"
                | "hardBreak"
                | "horizontalRule"
                | "codeBlock"
        ) {
            return Err("不支持的正文节点".into());
        }
        if obj
            .keys()
            .any(|k| !matches!(k.as_str(), "type" | "content" | "text" | "marks" | "attrs"))
        {
            return Err("正文包含不支持字段".into());
        }
        if let Some(attrs) = obj.get("attrs") {
            let attrs = attrs.as_object().ok_or("正文属性错误")?;
            for (k, v) in attrs {
                match (kind, k.as_str()) {
                    ("heading", "level") if v.as_i64().is_some_and(|n| (1..=3).contains(&n)) => {}
                    ("orderedList", "start") if v.as_i64().is_some_and(|n| n > 0) => {}
                    ("codeBlock", "language")
                        if v.is_null() || v.as_str().is_some_and(|s| s.len() < 60) => {}
                    _ => return Err("正文属性不支持".into()),
                }
            }
        }
        if let Some(marks) = obj.get("marks") {
            for mark in marks.as_array().ok_or("正文格式错误")? {
                let m = mark.as_object().ok_or("格式标记不是对象")?;
                if m.len() != 1
                    || !matches!(
                        m.get("type").and_then(|v| v.as_str()),
                        Some("bold" | "italic" | "strike" | "code")
                    )
                {
                    return Err("正文格式不支持".into());
                }
            }
        }
        let children = obj
            .get("content")
            .map(|v| v.as_array().ok_or("正文内容错误"))
            .transpose()?;
        let block = |s: &str| {
            matches!(
                s,
                "paragraph"
                    | "heading"
                    | "bulletList"
                    | "orderedList"
                    | "blockquote"
                    | "horizontalRule"
                    | "codeBlock"
            )
        };
        if depth > 0 && kind == "doc" {
            return Err("正文不能嵌套文档根".into());
        }
        if kind != "text" && obj.contains_key("text") {
            return Err("非文本节点包含文本字段".into());
        }
        if obj.contains_key("marks") && !matches!(kind, "text" | "hardBreak") {
            return Err("块节点不能包含行内格式".into());
        }
        let count = children.map_or(0, |v| v.len());
        if matches!(kind, "text" | "hardBreak" | "horizontalRule") && children.is_some() {
            return Err("叶节点不能包含子节点".into());
        }
        if (kind == "doc"
            || matches!(
                kind,
                "bulletList" | "orderedList" | "listItem" | "blockquote"
            ))
            && count == 0
        {
            return Err("块结构不能为空".into());
        }
        if kind == "heading" && obj.get("attrs").and_then(|a| a.get("level")).is_none() {
            return Err("标题缺少层级".into());
        }
        if let Some(children) = children {
            for (i, child) in children.iter().enumerate() {
                let child_kind = child
                    .get("type")
                    .and_then(|v| v.as_str())
                    .ok_or("子节点缺少类型")?;
                let valid = match kind {
                    "doc" | "blockquote" => block(child_kind),
                    "listItem" => {
                        if i == 0 {
                            child_kind == "paragraph"
                        } else {
                            block(child_kind)
                        }
                    }
                    "bulletList" | "orderedList" => child_kind == "listItem",
                    "paragraph" | "heading" => matches!(child_kind, "text" | "hardBreak"),
                    "codeBlock" => child_kind == "text" && child.get("marks").is_none(),
                    _ => false,
                };
                if !valid {
                    return Err("正文节点嵌套不合法".into());
                }
            }
        }
        if kind == "text" {
            let s = obj.get("text").and_then(|v| v.as_str()).ok_or("文本缺失")?;
            if s.is_empty() {
                return Err("文本节点不能为空".into());
            }
            if s.contains('\0') {
                return Err("正文含空字符".into());
            }
            text.push_str(s);
        }
        if let Some(content) = obj.get("content") {
            for child in content.as_array().ok_or("正文内容错误")? {
                walk(child, depth + 1, text)?;
            }
        }
        if matches!(kind, "paragraph" | "heading" | "hardBreak" | "codeBlock") {
            text.push('\n');
        }
        Ok(())
    }
    let mut text = String::new();
    walk(&input.document, 0, &mut text)?;
    Ok(text)
}
pub async fn state(db: &Path, company: &str) -> Result<JudgmentState, String> {
    crate::companies::get_company(db, company).await?;
    let mut con = connect(db).await?;
    let draft = sqlx::query("SELECT * FROM judgment_drafts WHERE company_id=?")
        .bind(company)
        .fetch_optional(&mut con)
        .await
        .map_err(error)?
        .map(|r| row(r, false))
        .transpose()?;
    let versions =
        sqlx::query("SELECT * FROM judgment_versions WHERE company_id=? ORDER BY version DESC")
            .bind(company)
            .fetch_all(&mut con)
            .await
            .map_err(error)?
            .into_iter()
            .map(|r| row(r, true))
            .collect::<Result<Vec<_>, _>>()?;
    Ok(JudgmentState { draft, versions })
}
pub async fn start(db: &Path, company: &str, base: Option<&str>) -> Result<Judgment, String> {
    crate::companies::get_company(db, company).await?;
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(error)?;
    let existing: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM judgment_drafts WHERE company_id=?")
            .bind(company)
            .fetch_one(&mut *tx)
            .await
            .map_err(error)?;
    if existing > 0 {
        return Err("已有草稿，请先处理，不覆盖未完成内容".into());
    }
    let (document, text) = if let Some(id) = base {
        let r =
            sqlx::query("SELECT document,text FROM judgment_versions WHERE id=? AND company_id=?")
                .bind(id)
                .bind(company)
                .fetch_optional(&mut *tx)
                .await
                .map_err(error)?
                .ok_or("修订基版不存在或不属于本公司")?;
        (r.get::<String, _>("document"), r.get::<String, _>("text"))
    } else {
        (
            serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]}).to_string(),
            String::new(),
        )
    };
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO judgment_drafts(id,company_id,document,text,base_id) VALUES(?,?,?,?,?)",
    )
    .bind(&id)
    .bind(company)
    .bind(document)
    .bind(text)
    .bind(base)
    .execute(&mut *tx)
    .await
    .map_err(error)?;
    tx.commit().await.map_err(error)?;
    let r = sqlx::query("SELECT * FROM judgment_drafts WHERE id=?")
        .bind(id)
        .fetch_one(&mut con)
        .await
        .map_err(error)?;
    row(r, false)
}
pub async fn save(
    db: &Path,
    id: &str,
    expected: i64,
    input: DraftInput,
) -> Result<Judgment, String> {
    let text = validate(&input)?;
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(error)?;
    let affected=sqlx::query("UPDATE judgment_drafts SET document=?,text=?,reason=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=?").bind(input.document.to_string()).bind(text).bind(input.reason).bind(id).bind(expected).execute(&mut *tx).await.map_err(error)?.rows_affected();
    if affected != 1 {
        return Err("草稿版本冲突或已冻结；输入保留，请重新核对，不自动覆盖".into());
    }
    let saved = row(
        sqlx::query("SELECT * FROM judgment_drafts WHERE id=?")
            .bind(id)
            .fetch_one(&mut *tx)
            .await
            .map_err(error)?,
        false,
    )?;
    tx.commit().await.map_err(error)?;
    Ok(saved)
}
pub async fn freeze(db: &Path, id: &str, expected: i64) -> Result<Judgment, String> {
    let mut con = connect(db).await?;
    let mut tx = con.begin().await.map_err(error)?;
    // Obtain SQLite write lock before selecting/versioning; prevents concurrent publication.
    let claimed =
        sqlx::query("UPDATE judgment_drafts SET revision=revision WHERE id=? AND revision=?")
            .bind(id)
            .bind(expected)
            .execute(&mut *tx)
            .await
            .map_err(error)?
            .rows_affected();
    if claimed != 1 {
        return Err("草稿版本冲突或已转正式，请重新核对".into());
    }
    let draft = row(
        sqlx::query("SELECT * FROM judgment_drafts WHERE id=?")
            .bind(id)
            .fetch_one(&mut *tx)
            .await
            .map_err(error)?,
        false,
    )?;
    if draft.text.trim().is_empty() {
        return Err("正文为空，不能转正式".into());
    }
    let version: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version),0)+1 FROM judgment_versions WHERE company_id=?",
    )
    .bind(&draft.company_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(error)?;
    sqlx::query("INSERT INTO judgment_versions (id,company_id,document,text,reason,revision,version,base_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(id).bind(&draft.company_id).bind(draft.document.to_string()).bind(&draft.text).bind(&draft.reason).bind(draft.revision).bind(version).bind(&draft.base_id).bind(&draft.created_at).execute(&mut *tx).await.map_err(error)?;
    sqlx::query("DELETE FROM judgment_drafts WHERE id=?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(error)?;
    tx.commit().await.map_err(error)?;
    row(
        sqlx::query("SELECT * FROM judgment_versions WHERE id=?")
            .bind(id)
            .fetch_one(&mut con)
            .await
            .map_err(error)?,
        true,
    )
}
pub async fn discard(db: &Path, id: &str, expected: i64) -> Result<(), String> {
    let mut con = connect(db).await?;
    let affected = sqlx::query("DELETE FROM judgment_drafts WHERE id=? AND revision=?")
        .bind(id)
        .bind(expected)
        .execute(&mut con)
        .await
        .map_err(error)?
        .rows_affected();
    if affected != 1 {
        return Err("草稿不存在、已冻结或版本冲突，不删除".into());
    }
    Ok(())
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
    fn input(text: &str) -> DraftInput {
        DraftInput {
            document: serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}),
            reason: "".into(),
        }
    }
    async fn fixture(root: &Path) -> (std::path::PathBuf, String) {
        let db = root.join("data/research.sqlite3");
        initialize_database(&db).await.unwrap();
        let result = create_company(
            &db,
            CompanyInput {
                name: "判断验收公司".into(),
                market: CompanyMarket::Private,
                registration: "".into(),
                listings: vec![],
            },
            false,
        )
        .await
        .unwrap();
        let SaveResult::Saved { record } = result else {
            panic!("saved")
        };
        (db, record.id)
    }
    #[tokio::test]
    async fn draft_freezes_and_revision_copies_without_rewriting_official() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let draft = start(&db, &c, None).await.unwrap();
        let draft = save(&db, &draft.id, 0, input("护城河：尚待验证"))
            .await
            .unwrap();
        let v1 = freeze(&db, &draft.id, draft.revision).await.unwrap();
        assert_eq!(v1.version, Some(1));
        assert!(state(&db, &c).await.unwrap().draft.is_none());
        assert!(save(&db, &v1.id, 1, input("改旧版")).await.is_err());
        assert!(discard(&db, &v1.id, 1).await.is_err());
        let revised = start(&db, &c, Some(&v1.id)).await.unwrap();
        assert_eq!(revised.document, v1.document);
        assert_eq!(revised.base_id, Some(v1.id.clone()));
        let revised = save(&db, &revised.id, 0, input("护城河：已有新认识"))
            .await
            .unwrap();
        let v2 = freeze(&db, &revised.id, revised.revision).await.unwrap();
        assert_eq!(v2.version, Some(2));
        let current = state(&db, &c).await.unwrap();
        assert_eq!(current.versions.len(), 2);
        assert_eq!(current.versions[0].id, v2.id);
        assert_eq!(current.versions[1], v1);
    }
    #[tokio::test]
    async fn stale_save_and_freeze_never_lose_latest_draft() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let d = start(&db, &c, None).await.unwrap();
        assert!(start(&db, &c, None).await.is_err());
        let d = save(&db, &d.id, 0, input("已保存的最新文字"))
            .await
            .unwrap();
        assert!(save(&db, &d.id, 0, input("旧请求")).await.is_err());
        assert!(freeze(&db, &d.id, 0).await.is_err());
        assert!(discard(&db, &d.id, 0).await.is_err());
        assert_eq!(state(&db, &c).await.unwrap().draft.unwrap(), d);
    }
    #[tokio::test]
    async fn blank_freeze_invalid_doc_and_cross_company_base_are_rejected() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let d = start(&db, &c, None).await.unwrap();
        assert!(freeze(&db, &d.id, 0).await.is_err());
        let mut bad = input("bad");
        bad.document = serde_json::json!({"type":"script","text":"evil"});
        assert!(save(&db, &d.id, 0, bad).await.is_err());
        let good = save(&db, &d.id, 0, input("自由正文，不填提纲或证据也可正式保存"))
            .await
            .unwrap();
        let v = freeze(&db, &good.id, 1).await.unwrap();
        assert!(start(&db, "missing", Some(&v.id)).await.is_err());
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
        assert!(start(&db, &other.id, Some(&v.id)).await.is_err());
        assert!(freeze(&db, &v.id, 1).await.is_err());
    }
    #[tokio::test]
    async fn official_rows_are_immutable_even_through_raw_sql() {
        use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let d = start(&db, &c, None).await.unwrap();
        let d = save(&db, &d.id, 0, input("不可回写")).await.unwrap();
        let v = freeze(&db, &d.id, 1).await.unwrap();
        let mut con = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&db))
            .await
            .unwrap();
        assert!(
            sqlx::query("UPDATE judgment_versions SET text='changed' WHERE id=?")
                .bind(&v.id)
                .execute(&mut con)
                .await
                .is_err()
        );
        assert!(
            sqlx::query("DELETE FROM judgment_versions WHERE id=?")
                .bind(&v.id)
                .execute(&mut con)
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn rejects_malformed_editor_structure_without_changing_draft() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let d = start(&db, &c, None).await.unwrap();
        for document in [
            serde_json::json!({"type":"doc","content":[{"type":"text","text":"loose"}]}),
            serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"heading","attrs":{"level":2}}]}]}),
            serde_json::json!({"type":"doc","content":[{"type":"bulletList","content":[{"type":"paragraph"}]}]}),
            serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":""}]}]}),
        ] {
            assert!(
                save(
                    &db,
                    &d.id,
                    0,
                    DraftInput {
                        document,
                        reason: String::new()
                    }
                )
                .await
                .is_err()
            );
        }
        assert_eq!(state(&db, &c).await.unwrap().draft, Some(d));
    }
    #[tokio::test]
    async fn draft_and_versions_backup_round_trip_keeps_history() {
        let t = tempdir().unwrap();
        let (db, c) = fixture(t.path()).await;
        let d = start(&db, &c, None).await.unwrap();
        let d = save(&db, &d.id, 0, input("原观点")).await.unwrap();
        let v = freeze(&db, &d.id, 1).await.unwrap();
        let d = start(&db, &c, Some(&v.id)).await.unwrap();
        let mut next = input("未完成的修订\n正文批注也保留");
        next.reason = "新增反证".into();
        let d = save(&db, &d.id, 0, next).await.unwrap();
        let backup = t.path().join("backup");
        create_backup(db.parent().unwrap(), &backup).await.unwrap();
        let restored = t.path().join("restore");
        restore_backup(&backup, &restored).await.unwrap();
        let result = state(&restored.join("research.sqlite3"), &c).await.unwrap();
        assert_eq!(result.draft, Some(d));
        assert_eq!(result.versions, vec![v]);
    }
}
