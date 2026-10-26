use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MaterialInput {
    pub title: String,
    pub body: String,
    pub url: String,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct Material {
    pub id: String,
    pub company_id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub url: String,
    pub file_mode: String,
    pub original_name: String,
    pub file_size: i64,
    pub tags: Vec<String>,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub csv_mapping: Vec<String>,
}
#[derive(Debug, serde::Serialize)]
pub struct Preview {
    pub kind: String,
    pub status: String,
    pub text: String,
    pub bytes: Vec<u8>,
    pub mime: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: usize,
}

use sha2::{Digest, Sha256};
use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteRow},
};
use std::io::Read;
const MAX_FILE: u64 = 50 * 1024 * 1024;
const MAX_PREVIEW: u64 = 20 * 1024 * 1024;
fn err(e: impl std::fmt::Display) -> String {
    format!("资料库操作失败：{e}")
}
async fn connect(db: &Path) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db).foreign_keys(true))
        .await
        .map_err(err)
}
fn label(v: String, max: usize, required: bool) -> Result<String, String> {
    let v = v.trim().to_string();
    if (required && v.is_empty()) || v.chars().count() > max || v.chars().any(char::is_control) {
        return Err("标题、标签或地址为空、过长或含控制字符".into());
    }
    Ok(v)
}
fn normalize(mut input: MaterialInput, kind: &str) -> Result<MaterialInput, String> {
    input.title = label(input.title, 200, true)?;
    if input.body.len() > 1_000_000 || input.body.contains('\0') {
        return Err("正文过长或含空字符".into());
    }
    input.url = label(input.url, 4000, false)?;
    if !input.url.is_empty() || kind == "link" {
        let u = tauri::Url::parse(&input.url).map_err(|_| "来源链接不是有效网址".to_string())?;
        if !matches!(u.scheme(), "http" | "https")
            || u.host_str().is_none()
            || !u.username().is_empty()
            || u.password().is_some()
        {
            return Err("仅允许不含凭据的 HTTP/HTTPS 来源链接".into());
        }
    }
    if input.tags.len() > 30 {
        return Err("最多30个标签".into());
    }
    let mut tags = vec![];
    for tag in input.tags {
        let tag = label(tag, 60, false)?;
        if !tag.is_empty() && !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    input.tags = tags;
    Ok(input)
}
async fn tags(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    id: &str,
    values: &[String],
) -> Result<(), String> {
    sqlx::query("DELETE FROM material_tags WHERE material_id=?")
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(err)?;
    for (position, tag) in values.iter().enumerate() {
        sqlx::query("INSERT INTO material_tags VALUES (?,?,?)")
            .bind(id)
            .bind(tag)
            .bind(position as i64)
            .execute(&mut **tx)
            .await
            .map_err(err)?;
    }
    Ok(())
}
async fn from_row(connection: &mut SqliteConnection, row: SqliteRow) -> Result<Material, String> {
    let id: String = row.get("id");
    let tags =
        sqlx::query_scalar("SELECT tag FROM material_tags WHERE material_id=? ORDER BY position")
            .bind(&id)
            .fetch_all(connection)
            .await
            .map_err(err)?;
    Ok(Material {
        id,
        company_id: row.get("company_id"),
        kind: row.get("kind"),
        title: row.get("title"),
        body: row.get("body"),
        url: row.get("url"),
        file_mode: row.get("file_mode"),
        original_name: row.get("original_name"),
        file_size: row.get("file_size"),
        tags,
        archived: row.get::<i64, _>("archived") == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        csv_mapping: serde_json::from_str(row.get("csv_mapping")).map_err(err)?,
    })
}
pub async fn create_text(
    db: &Path,
    company: &str,
    kind: &str,
    input: MaterialInput,
) -> Result<Material, String> {
    if !matches!(kind, "note" | "link") {
        return Err("不支持的资料类型".into());
    }
    let input = normalize(input, kind)?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut connection = connect(db).await?;
    let mut tx = connection.begin().await.map_err(err)?;
    sqlx::query("INSERT INTO materials (id,company_id,kind,title,body,url) VALUES (?,?,?,?,?,?)")
        .bind(&id)
        .bind(company)
        .bind(kind)
        .bind(&input.title)
        .bind(&input.body)
        .bind(&input.url)
        .execute(&mut *tx)
        .await
        .map_err(err)?;
    tags(&mut tx, &id, &input.tags).await?;
    tx.commit().await.map_err(err)?;
    get(db, &id).await
}
fn file_info(source: &Path) -> Result<(String, String, u64), String> {
    let meta = std::fs::symlink_metadata(source).map_err(err)?;
    if !meta.file_type().is_file() {
        return Err("只接受普通文件，不接受目录或符号链接".into());
    }
    if meta.len() > MAX_FILE {
        return Err("文件超过50 MiB，本期不导入".into());
    }
    let name = source
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("文件名不是有效UTF-8")?
        .to_string();
    let extension = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let extension = if extension.len() <= 12 && extension.chars().all(|c| c.is_ascii_alphanumeric())
    {
        extension
    } else {
        String::new()
    };
    Ok((name, extension, meta.len()))
}
fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    file_info(path)?;
    let mut bytes = vec![];
    std::fs::File::open(path)
        .map_err(err)?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(err)?;
    if bytes.len() as u64 > limit {
        return Err(format!("内容超过本次读取上限 {} MiB", limit / 1024 / 1024));
    }
    Ok(bytes)
}
fn attachments(db: &Path) -> Result<std::path::PathBuf, String> {
    let root = db
        .parent()
        .ok_or("数据库目录缺失")?
        .canonicalize()
        .map_err(err)?
        .join("attachments");
    if root.exists() && !std::fs::symlink_metadata(&root).map_err(err)?.is_dir() {
        return Err("附件目录不允许符号链接或非目录".into());
    }
    Ok(root)
}
pub async fn import_file(
    db: &Path,
    company: &str,
    source: &Path,
    mode: &str,
    input: MaterialInput,
) -> Result<Material, String> {
    if !matches!(mode, "copy" | "reference") {
        return Err("不支持的文件模式".into());
    }
    let input = normalize(input, "file")?;
    crate::companies::get_company(db, company).await?;
    let (name, extension, size) = file_info(source)?;
    let content = read_bounded(source, MAX_FILE)?;
    let hash = format!("{:x}", Sha256::digest(&content));
    let id = uuid::Uuid::new_v4().to_string();
    let mut stored = String::new();
    let mut external = String::new();
    let mut destination = None;
    if mode == "copy" {
        let root = attachments(db)?;
        std::fs::create_dir_all(&root).map_err(err)?;
        stored = format!(
            "{id}{}",
            if extension.is_empty() {
                String::new()
            } else {
                format!(".{extension}")
            }
        );
        let path = root.join(&stored);
        use std::io::Write;
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(err)?;
        destination = Some(path.clone());
        if let Err(failure) = output.write_all(&content).and_then(|_| output.sync_all()) {
            drop(output);
            let _ = std::fs::remove_file(path);
            return Err(err(failure));
        }
    } else {
        external = source
            .canonicalize()
            .map_err(err)?
            .to_str()
            .ok_or("文件路径不是有效UTF-8")?
            .to_string();
    }
    let result=async {
        let mut connection=connect(db).await?; let mut tx=connection.begin().await.map_err(err)?;
        sqlx::query("INSERT INTO materials (id,company_id,kind,title,body,url,file_mode,stored_path,external_path,original_name,file_size,file_hash,extension) VALUES (?,?,'file',?,?,?,?,?,?,?,?,?,?)")
            .bind(&id).bind(company).bind(&input.title).bind(&input.body).bind(&input.url).bind(mode).bind(&stored).bind(&external).bind(name).bind(size as i64).bind(hash).bind(extension).execute(&mut *tx).await.map_err(err)?;
        tags(&mut tx,&id,&input.tags).await?; tx.commit().await.map_err(err)?; Ok::<(),String>(())
    }.await;
    if let Err(failure) = result {
        if let Some(path) = destination {
            let _ = std::fs::remove_file(path);
        }
        return Err(failure);
    }
    get(db, &id).await
}
pub async fn list(
    db: &Path,
    company: &str,
    query: &str,
    archived: bool,
) -> Result<Vec<Material>, String> {
    let query = label(query.into(), 200, false)?;
    let pattern = format!(
        "%{}%",
        query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let mut connection = connect(db).await?;
    let rows=sqlx::query("SELECT DISTINCT m.* FROM materials m LEFT JOIN material_tags t ON t.material_id=m.id WHERE m.company_id=? AND m.archived=? AND (m.title LIKE ? ESCAPE '\\' OR t.tag LIKE ? ESCAPE '\\') ORDER BY m.updated_at DESC,m.id")
        .bind(company).bind(archived).bind(&pattern).bind(&pattern).fetch_all(&mut connection).await.map_err(err)?;
    let mut result = vec![];
    for row in rows {
        result.push(from_row(&mut connection, row).await?);
    }
    Ok(result)
}
pub async fn get(db: &Path, id: &str) -> Result<Material, String> {
    let mut connection = connect(db).await?;
    let row = sqlx::query("SELECT * FROM materials WHERE id=?")
        .bind(id)
        .fetch_optional(&mut connection)
        .await
        .map_err(err)?
        .ok_or("资料不存在")?;
    from_row(&mut connection, row).await
}
pub async fn update(db: &Path, id: &str, input: MaterialInput) -> Result<Material, String> {
    let current = get(db, id).await?;
    let input = normalize(input, &current.kind)?;
    let mut connection = connect(db).await?;
    let mut tx = connection.begin().await.map_err(err)?;
    sqlx::query("UPDATE materials SET title=?,body=?,url=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(input.title).bind(input.body).bind(input.url).bind(id).execute(&mut *tx).await.map_err(err)?;
    tags(&mut tx, id, &input.tags).await?;
    tx.commit().await.map_err(err)?;
    get(db, id).await
}
pub async fn archive(db: &Path, id: &str, archived: bool) -> Result<Material, String> {
    get(db, id).await?;
    let mut connection = connect(db).await?;
    sqlx::query("UPDATE materials SET archived=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(archived).bind(id).execute(&mut connection).await.map_err(err)?;
    get(db, id).await
}
pub async fn file_path(db: &Path, id: &str) -> Result<std::path::PathBuf, String> {
    let mut connection = connect(db).await?;
    let row = sqlx::query("SELECT * FROM materials WHERE id=? AND kind='file'")
        .bind(id)
        .fetch_optional(&mut connection)
        .await
        .map_err(err)?
        .ok_or("资料不是文件")?;
    let path = if row.get::<&str, _>("file_mode") == "copy" {
        let id = uuid::Uuid::parse_str(id).map_err(err)?.to_string();
        let extension: &str = row.get("extension");
        if extension.len() > 12 || !extension.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err("附件扩展名损坏".into());
        }
        let expected = format!(
            "{id}{}",
            if extension.is_empty() {
                String::new()
            } else {
                format!(".{extension}")
            }
        );
        if row.get::<&str, _>("stored_path") != expected {
            return Err("附件路径校验失败".into());
        }
        attachments(db)?.join(expected)
    } else {
        let path = std::path::PathBuf::from(row.get::<&str, _>("external_path"));
        if !path.is_absolute() {
            return Err("外部路径损坏".into());
        }
        path
    };
    // Verify every ancestor, not just the leaf, to reject replaced symlink directories.
    for ancestor in path.ancestors() {
        if ancestor.exists()
            && std::fs::symlink_metadata(ancestor)
                .map_err(err)?
                .file_type()
                .is_symlink()
        {
            return Err("文件路径含符号链接，拒绝读取".into());
        }
    }
    Ok(path)
}
fn empty_preview(kind: &str, status: &str) -> Preview {
    Preview {
        kind: kind.into(),
        status: status.into(),
        text: String::new(),
        bytes: vec![],
        mime: String::new(),
        headers: vec![],
        rows: vec![],
        total_rows: 0,
    }
}
pub async fn preview(db: &Path, id: &str) -> Result<Preview, String> {
    let material = get(db, id).await?;
    if material.kind != "file" {
        let mut p = empty_preview(&material.kind, "ready");
        p.text = material.body;
        return Ok(p);
    }
    let path = file_path(db, id).await?;
    if !path.exists() {
        return Ok(empty_preview("file", "missing"));
    }
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "txt" | "md" | "markdown" | "csv" | "pdf" | "png" | "jpg" | "jpeg" | "gif" | "webp"
    ) {
        return Ok(empty_preview("unsupported", "ready"));
    }
    let content = read_bounded(&path, MAX_PREVIEW)?;
    let mut connection = connect(db).await?;
    let expected: String = sqlx::query_scalar("SELECT file_hash FROM materials WHERE id=?")
        .bind(id)
        .fetch_one(&mut connection)
        .await
        .map_err(err)?;
    if format!("{:x}", Sha256::digest(&content)) != expected {
        return Ok(empty_preview("file", "changed"));
    }
    let mut p = empty_preview("text", "ready");
    match extension.as_str() {
        "txt" | "md" | "markdown" | "csv" => {
            let text = String::from_utf8(content)
                .map_err(|_| "文本预览只支持UTF-8，请另存编码后重新导入".to_string())?;
            let text = text.trim_start_matches('\u{feff}').to_string();
            if text.contains('\0') {
                return Err("文本含二进制空字符，拒绝作为正文预览".into());
            }
            p.kind = if extension == "csv" {
                "csv"
            } else if extension == "txt" {
                "text"
            } else {
                "markdown"
            }
            .into();
            if extension == "csv" {
                let mut reader = csv::ReaderBuilder::new().from_reader(text.as_bytes());
                p.headers = reader
                    .headers()
                    .map_err(err)?
                    .iter()
                    .map(String::from)
                    .collect();
                if p.headers.is_empty() || p.headers.len() > 100 {
                    return Err("CSV须有表头且不超过100列".into());
                }
                for record in reader.records() {
                    let record = record.map_err(err)?;
                    p.total_rows += 1;
                    if p.rows.len() < 100 {
                        p.rows.push(record.iter().map(String::from).collect());
                    }
                }
            } else {
                p.text = text;
            }
        }
        "pdf" => {
            if !content.starts_with(b"%PDF-") {
                return Err("文件不是有效PDF头部".into());
            }
            p.kind = "pdf".into();
            p.mime = "application/pdf".into();
            p.bytes = content;
        }
        other => {
            let mime = match other {
                "png" if content.starts_with(b"\x89PNG\r\n\x1a\n") => "image/png",
                "jpg" | "jpeg" if content.starts_with(b"\xff\xd8\xff") => "image/jpeg",
                "gif" if content.starts_with(b"GIF8") => "image/gif",
                "webp" if content.starts_with(b"RIFF") && content.get(8..12) == Some(b"WEBP") => {
                    "image/webp"
                }
                _ => return Err("图片扩展名与文件头不一致".into()),
            };
            p.kind = "image".into();
            p.mime = mime.into();
            p.bytes = content;
        }
    }
    Ok(p)
}
pub async fn relocate(db: &Path, id: &str, source: &Path) -> Result<Material, String> {
    let material = get(db, id).await?;
    if material.kind != "file" || material.file_mode != "reference" {
        return Err("只有外部引用可重新定位".into());
    }
    let (name, extension, size) = file_info(source)?;
    let content = read_bounded(source, MAX_FILE)?;
    let mut connection = connect(db).await?;
    let expected: String = sqlx::query_scalar("SELECT file_hash FROM materials WHERE id=?")
        .bind(id)
        .fetch_one(&mut connection)
        .await
        .map_err(err)?;
    if format!("{:x}", Sha256::digest(&content)) != expected {
        return Err("所选文件内容与原引用不同，请作为新资料导入".into());
    }
    let external = source
        .canonicalize()
        .map_err(err)?
        .to_str()
        .ok_or("路径不是有效UTF-8")?
        .to_string();
    sqlx::query("UPDATE materials SET external_path=?,original_name=?,extension=?,file_size=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(external).bind(name).bind(extension).bind(size as i64).bind(id).execute(&mut connection).await.map_err(err)?;
    get(db, id).await
}
pub async fn set_csv_mapping(
    db: &Path,
    id: &str,
    mapping: Vec<String>,
) -> Result<Material, String> {
    let p = preview(db, id).await?;
    if p.kind != "csv" || p.headers.len() != mapping.len() {
        return Err("CSV列映射须与实际列数一致".into());
    }
    let mapping = mapping
        .into_iter()
        .map(|v| label(v, 60, false))
        .collect::<Result<Vec<_>, _>>()?;
    if mapping.iter().all(String::is_empty) {
        return Err("至少确认一列，其余列可忽略".into());
    }
    let mut names = std::collections::BTreeSet::new();
    for name in &mapping {
        if !name.is_empty() && !names.insert(name) {
            return Err("映射名称不可重复".into());
        }
    }
    let mut connection = connect(db).await?;
    sqlx::query("UPDATE materials SET csv_mapping=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(serde_json::to_string(&mapping).map_err(err)?).bind(id).execute(&mut connection).await.map_err(err)?;
    get(db, id).await
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
    fn input(title: &str) -> MaterialInput {
        MaterialInput {
            title: title.into(),
            body: "研究文字".into(),
            url: "".into(),
            tags: vec!["护城河".into(), "护城河".into(), "  财报  ".into()],
        }
    }
    async fn setup(root: &Path) -> (std::path::PathBuf, String) {
        let db = root.join("data/research.sqlite3");
        initialize_database(&db).await.unwrap();
        let result = create_company(
            &db,
            CompanyInput {
                name: "资料验收公司".into(),
                market: CompanyMarket::Private,
                registration: "".into(),
                listings: vec![],
            },
            false,
        )
        .await
        .unwrap();
        let SaveResult::Saved { record } = result else {
            panic!("create")
        };
        (db, record.id)
    }
    #[tokio::test]
    async fn notes_links_tags_edit_and_archive_round_trip() {
        let temp = tempdir().unwrap();
        let (db, company) = setup(temp.path()).await;
        let note = create_text(&db, &company, "note", input("研究札记"))
            .await
            .unwrap();
        assert_eq!(note.tags, vec!["护城河", "财报"]);
        assert_eq!(list(&db, &company, "护城河", false).await.unwrap().len(), 1);
        let changed = update(&db, &note.id, input("修改标题")).await.unwrap();
        assert_eq!(changed.title, "修改标题");
        archive(&db, &note.id, true).await.unwrap();
        assert!(list(&db, &company, "", false).await.unwrap().is_empty());
        assert_eq!(list(&db, &company, "", true).await.unwrap().len(), 1);
        archive(&db, &note.id, false).await.unwrap();
        let mut link = input("原站链接");
        link.url = "https://example.com/report".into();
        create_text(&db, &company, "link", link).await.unwrap();
        assert_eq!(list(&db, &company, "", false).await.unwrap().len(), 2);
        assert!(create_text(&db, &company, "note", input("")).await.is_err());
        let mut bad = input("bad");
        bad.url = "javascript:alert(1)".into();
        assert!(create_text(&db, &company, "link", bad).await.is_err());
        assert!(
            create_text(&db, "missing", "note", input("bad"))
                .await
                .is_err()
        );
    }
    #[tokio::test]
    async fn copied_file_survives_source_move_and_backup() {
        let temp = tempdir().unwrap();
        let (db, company) = setup(temp.path()).await;
        let source = temp.path().join("资料.md");
        std::fs::write(&source, "# 资料\n原件内容").unwrap();
        let row = import_file(&db, &company, &source, "copy", input("复制资料"))
            .await
            .unwrap();
        std::fs::rename(source, temp.path().join("moved.md")).unwrap();
        assert!(
            preview(&db, &row.id)
                .await
                .unwrap()
                .text
                .contains("原件内容")
        );
        let backup = temp.path().join("backup");
        create_backup(db.parent().unwrap(), &backup).await.unwrap();
        let restored = temp.path().join("restored");
        restore_backup(&backup, &restored).await.unwrap();
        assert_eq!(
            get(&restored.join("research.sqlite3"), &row.id)
                .await
                .unwrap()
                .tags,
            row.tags
        );
        assert!(
            preview(&restored.join("research.sqlite3"), &row.id)
                .await
                .unwrap()
                .text
                .contains("原件内容")
        );
    }
    #[tokio::test]
    async fn external_missing_relocates_and_unsupported_stays_metadata_only() {
        let temp = tempdir().unwrap();
        let (db, company) = setup(temp.path()).await;
        let source = temp.path().join("note.txt");
        std::fs::write(&source, "外部引用").unwrap();
        let row = import_file(&db, &company, &source, "reference", input("外部资料"))
            .await
            .unwrap();
        let moved = temp.path().join("new.txt");
        std::fs::rename(&source, &moved).unwrap();
        assert_eq!(preview(&db, &row.id).await.unwrap().status, "missing");
        relocate(&db, &row.id, &moved).await.unwrap();
        assert_eq!(preview(&db, &row.id).await.unwrap().text, "外部引用");
        let other = temp.path().join("payload.bin");
        std::fs::write(&other, [0, 255, 0, 1]).unwrap();
        let unknown = import_file(&db, &company, &other, "copy", input("未支持格式"))
            .await
            .unwrap();
        assert_eq!(preview(&db, &unknown.id).await.unwrap().kind, "unsupported");
        assert!(relocate(&db, &unknown.id, &moved).await.is_err());
    }
    #[tokio::test]
    async fn csv_requires_mapping_and_keeps_strings_quotes_and_empty_values() {
        let temp = tempdir().unwrap();
        let (db, company) = setup(temp.path()).await;
        let source = temp.path().join("data.csv");
        std::fs::write(
            &source,
            "名称,代码,备注\r\n甲,00123,\r\n乙,00999,\"含逗号,引号\"\r\n",
        )
        .unwrap();
        let row = import_file(&db, &company, &source, "copy", input("CSV资料"))
            .await
            .unwrap();
        let p = preview(&db, &row.id).await.unwrap();
        assert_eq!(p.kind, "csv");
        assert_eq!(p.headers.len(), 3);
        assert_eq!(p.rows[0], vec!["甲", "00123", ""]);
        assert_eq!(p.rows[1][2], "含逗号,引号");
        assert!(row.csv_mapping.is_empty());
        assert!(
            set_csv_mapping(&db, &row.id, vec!["名称".into()])
                .await
                .is_err()
        );
        let updated = set_csv_mapping(
            &db,
            &row.id,
            vec!["公司".into(), "代码".into(), "备注".into()],
        )
        .await
        .unwrap();
        assert_eq!(updated.csv_mapping.len(), 3);
    }
    #[tokio::test]
    async fn changed_external_content_is_not_silently_adopted() {
        let temp = tempdir().unwrap();
        let (db, company) = setup(temp.path()).await;
        let source = temp.path().join("external.txt");
        std::fs::write(&source, "原文字").unwrap();
        let row = import_file(&db, &company, &source, "reference", input("引用"))
            .await
            .unwrap();
        std::fs::write(&source, "改变文字").unwrap();
        assert_eq!(preview(&db, &row.id).await.unwrap().status, "changed");
        assert!(relocate(&db, &row.id, &source).await.is_err());
    }
    #[tokio::test]
    async fn all_material_metadata_and_mapping_survive_backup_restore() {
        let temp = tempdir().unwrap();
        let (db, company) = setup(temp.path()).await;
        let note = create_text(&db, &company, "note", input("备份笔记"))
            .await
            .unwrap();
        archive(&db, &note.id, true).await.unwrap();
        let mut link = input("书签");
        link.url = "https://example.com/a".into();
        let link = create_text(&db, &company, "link", link).await.unwrap();
        let file = temp.path().join("fixture.csv");
        std::fs::write(&file, "代码,值\n001,10\n").unwrap();
        let csv = import_file(&db, &company, &file, "copy", input("CSV"))
            .await
            .unwrap();
        set_csv_mapping(&db, &csv.id, vec!["代码".into(), "原始值".into()])
            .await
            .unwrap();
        let external = import_file(&db, &company, &file, "reference", input("外部引用"))
            .await
            .unwrap();
        let backup = temp.path().join("full-backup");
        create_backup(db.parent().unwrap(), &backup).await.unwrap();
        let target = temp.path().join("restore-all");
        restore_backup(&backup, &target).await.unwrap();
        let target_db = target.join("research.sqlite3");
        assert!(get(&target_db, &note.id).await.unwrap().archived);
        assert_eq!(
            get(&target_db, &link.id).await.unwrap().url,
            "https://example.com/a"
        );
        assert_eq!(
            get(&target_db, &csv.id).await.unwrap().csv_mapping,
            vec!["代码", "原始值"]
        );
        std::fs::remove_file(file).unwrap();
        assert_eq!(
            preview(&target_db, &external.id).await.unwrap().status,
            "missing"
        );
        assert_eq!(
            preview(&target_db, &csv.id).await.unwrap().rows[0][0],
            "001"
        );
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn symlinks_and_path_tampering_are_rejected() {
        use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};
        let temp = tempdir().unwrap();
        let (db, company) = setup(temp.path()).await;
        let source = temp.path().join("original.txt");
        std::fs::write(&source, "secret").unwrap();
        let symlink = temp.path().join("link.txt");
        std::os::unix::fs::symlink(&source, &symlink).unwrap();
        assert!(
            import_file(&db, &company, &symlink, "copy", input("bad"))
                .await
                .is_err()
        );
        let row = import_file(&db, &company, &source, "copy", input("good"))
            .await
            .unwrap();
        let mut connection =
            SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(&db))
                .await
                .unwrap();
        sqlx::query("UPDATE materials SET stored_path='../original.txt' WHERE id=?")
            .bind(&row.id)
            .execute(&mut connection)
            .await
            .unwrap();
        assert!(preview(&db, &row.id).await.is_err());
    }
}
