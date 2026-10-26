use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CompanyMarket {
    A,
    Hk,
    Us,
    Private,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ListingMarket {
    A,
    Hk,
    Us,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ListingInput {
    pub market: ListingMarket,
    pub code: String,
    pub exchange: String,
    pub security_type: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CompanyInput {
    pub name: String,
    pub market: CompanyMarket,
    pub registration: String,
    pub listings: Vec<ListingInput>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct Listing {
    pub id: String,
    pub company_id: String,
    pub market: ListingMarket,
    pub code: String,
    pub exchange: String,
    pub security_type: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct Company {
    pub id: String,
    pub name: String,
    pub market: CompanyMarket,
    pub registration: String,
    pub created_at: String,
    pub listings: Vec<Listing>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DuplicateWarning {
    pub message: String,
    pub company_id: String,
    pub company_name: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SaveResult<T> {
    Saved { record: T },
    NeedsConfirmation { warnings: Vec<DuplicateWarning> },
}

pub async fn create_company(
    path: &Path,
    input: CompanyInput,
    confirm: bool,
) -> Result<SaveResult<Company>, String> {
    let input = normalize_company(input)?;
    let mut connection = connect(path).await?;
    let mut tx = connection.begin().await.map_err(db_error)?;
    let mut warnings = name_warnings(&mut tx, &input.name).await?;
    for listing in &input.listings {
        warnings.extend(code_warnings(&mut tx, listing).await?);
    }
    let mut codes = std::collections::BTreeSet::new();
    for listing in &input.listings {
        if !codes.insert((market_string(&listing.market), listing.code.to_lowercase())) {
            warnings.push(DuplicateWarning {
                message: "本次填写的证券代码重复".into(),
                company_id: "".into(),
                company_name: input.name.clone(),
            });
        }
    }
    if !warnings.is_empty() && !confirm {
        return Ok(SaveResult::NeedsConfirmation { warnings });
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO companies (id, name, market, registration) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.name)
        .bind(company_market_string(&input.market))
        .bind(&input.registration)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    for listing in input.listings {
        insert_listing(&mut tx, &id, &listing).await?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(SaveResult::Saved {
        record: get_company(path, &id).await?,
    })
}

pub async fn list_companies(path: &Path, query: &str) -> Result<Vec<Company>, String> {
    let mut connection = connect(path).await?;
    let query = query.trim();
    if query.chars().count() > 200 {
        return Err("搜索词过长".into());
    }
    let pattern = format!(
        "%{}%",
        query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let rows = sqlx::query("SELECT DISTINCT c.* FROM companies c LEFT JOIN listings l ON l.company_id = c.id WHERE c.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR l.code LIKE ? ESCAPE '\\' COLLATE NOCASE ORDER BY c.created_at DESC, c.id")
        .bind(&pattern).bind(&pattern).fetch_all(&mut connection).await.map_err(db_error)?;
    let mut result = vec![];
    for row in rows {
        result.push(company_from_row(&mut connection, &row).await?);
    }
    Ok(result)
}

pub async fn get_company(path: &Path, id: &str) -> Result<Company, String> {
    let mut connection = connect(path).await?;
    let row = sqlx::query("SELECT * FROM companies WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut connection)
        .await
        .map_err(db_error)?
        .ok_or_else(|| "公司不存在".to_string())?;
    company_from_row(&mut connection, &row).await
}

pub async fn add_listing(
    path: &Path,
    id: &str,
    input: ListingInput,
    confirm: bool,
) -> Result<SaveResult<Listing>, String> {
    let input = normalize_listing(input)?;
    let mut connection = connect(path).await?;
    let mut tx = connection.begin().await.map_err(db_error)?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM companies WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    if exists == 0 {
        return Err("公司不存在".into());
    }
    let warnings = code_warnings(&mut tx, &input).await?;
    if !warnings.is_empty() && !confirm {
        return Ok(SaveResult::NeedsConfirmation { warnings });
    }
    let listing_id = insert_listing(&mut tx, id, &input).await?;
    tx.commit().await.map_err(db_error)?;
    let row = sqlx::query("SELECT * FROM listings WHERE id = ?")
        .bind(listing_id)
        .fetch_one(&mut connection)
        .await
        .map_err(db_error)?;
    Ok(SaveResult::Saved {
        record: listing_from_row(&row)?,
    })
}

use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteRow},
};

async fn connect(path: &Path) -> Result<SqliteConnection, String> {
    SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(path)
            .foreign_keys(true),
    )
    .await
    .map_err(db_error)
}
fn db_error(error: sqlx::Error) -> String {
    format!("公司档案数据库操作失败：{error}")
}
fn text(value: String, label: &str, max: usize, required: bool) -> Result<String, String> {
    let value = value.trim().to_string();
    if required && value.is_empty() {
        return Err(format!("{label}不能为空"));
    }
    if value.chars().count() > max || value.chars().any(char::is_control) {
        return Err(format!("{label}过长或包含控制字符"));
    }
    Ok(value)
}
fn normalize_company(mut input: CompanyInput) -> Result<CompanyInput, String> {
    input.name = text(input.name, "公司名称", 200, true)?;
    input.registration = text(input.registration, "注册地", 200, false)?;
    if input.listings.len() > 30 {
        return Err("一次最多填写30条证券".into());
    }
    input.listings = input
        .listings
        .into_iter()
        .map(normalize_listing)
        .collect::<Result<_, _>>()?;
    Ok(input)
}
fn normalize_listing(mut input: ListingInput) -> Result<ListingInput, String> {
    input.code = text(input.code, "证券代码", 64, true)?.to_uppercase();
    input.exchange = text(input.exchange, "交易所", 100, false)?;
    input.security_type = text(input.security_type, "证券类型", 100, false)?;
    Ok(input)
}
fn market_string(market: &ListingMarket) -> &'static str {
    match market {
        ListingMarket::A => "a",
        ListingMarket::Hk => "hk",
        ListingMarket::Us => "us",
    }
}
fn company_market_string(market: &CompanyMarket) -> &'static str {
    match market {
        CompanyMarket::A => "a",
        CompanyMarket::Hk => "hk",
        CompanyMarket::Us => "us",
        CompanyMarket::Private => "private",
    }
}
async fn name_warnings(
    connection: &mut SqliteConnection,
    name: &str,
) -> Result<Vec<DuplicateWarning>, String> {
    let rows = sqlx::query("SELECT id, name FROM companies WHERE name = ? COLLATE NOCASE")
        .bind(name)
        .fetch_all(connection)
        .await
        .map_err(db_error)?;
    Ok(rows
        .into_iter()
        .map(|row| DuplicateWarning {
            message: "已有同名公司，继续将新建独立档案，不会合并".into(),
            company_id: row.get("id"),
            company_name: row.get("name"),
        })
        .collect())
}
async fn code_warnings(
    connection: &mut SqliteConnection,
    input: &ListingInput,
) -> Result<Vec<DuplicateWarning>, String> {
    let rows = sqlx::query("SELECT c.id, c.name FROM listings l JOIN companies c ON c.id = l.company_id WHERE l.market = ? AND l.code = ? COLLATE NOCASE").bind(market_string(&input.market)).bind(&input.code).fetch_all(connection).await.map_err(db_error)?;
    Ok(rows
        .into_iter()
        .map(|row| DuplicateWarning {
            message: format!("同市场已有代码 {}，请核对，继续不会合并", input.code),
            company_id: row.get("id"),
            company_name: row.get("name"),
        })
        .collect())
}
async fn insert_listing(
    connection: &mut SqliteConnection,
    company_id: &str,
    input: &ListingInput,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO listings (id, company_id, market, code, exchange, security_type) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(company_id).bind(market_string(&input.market)).bind(&input.code).bind(&input.exchange).bind(&input.security_type).execute(connection).await.map_err(db_error)?;
    Ok(id)
}
fn listing_from_row(row: &SqliteRow) -> Result<Listing, String> {
    let market: String = row.try_get("market").map_err(db_error)?;
    Ok(Listing {
        id: row.try_get("id").map_err(db_error)?,
        company_id: row.try_get("company_id").map_err(db_error)?,
        market: match market.as_str() {
            "a" => ListingMarket::A,
            "hk" => ListingMarket::Hk,
            "us" => ListingMarket::Us,
            _ => return Err("证券市场字段损坏".into()),
        },
        code: row.try_get("code").map_err(db_error)?,
        exchange: row.try_get("exchange").map_err(db_error)?,
        security_type: row.try_get("security_type").map_err(db_error)?,
        created_at: row.try_get("created_at").map_err(db_error)?,
    })
}
async fn company_from_row(
    connection: &mut SqliteConnection,
    row: &SqliteRow,
) -> Result<Company, String> {
    let id: String = row.try_get("id").map_err(db_error)?;
    let market: String = row.try_get("market").map_err(db_error)?;
    let listings =
        sqlx::query("SELECT * FROM listings WHERE company_id = ? ORDER BY created_at, id")
            .bind(&id)
            .fetch_all(connection)
            .await
            .map_err(db_error)?
            .iter()
            .map(listing_from_row)
            .collect::<Result<_, _>>()?;
    Ok(Company {
        id,
        name: row.try_get("name").map_err(db_error)?,
        market: match market.as_str() {
            "a" => CompanyMarket::A,
            "hk" => CompanyMarket::Hk,
            "us" => CompanyMarket::Us,
            "private" => CompanyMarket::Private,
            _ => return Err("公司市场字段损坏".into()),
        },
        registration: row.try_get("registration").map_err(db_error)?,
        created_at: row.try_get("created_at").map_err(db_error)?,
        listings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        backup::{create_backup, restore_backup},
        storage::initialize_database,
    };
    use tempfile::tempdir;

    fn company(name: &str) -> CompanyInput {
        CompanyInput {
            name: name.into(),
            market: CompanyMarket::Private,
            registration: "中国".into(),
            listings: vec![],
        }
    }
    fn listing(code: &str) -> ListingInput {
        ListingInput {
            market: ListingMarket::Hk,
            code: code.into(),
            exchange: "HKEX".into(),
            security_type: "普通股".into(),
        }
    }
    fn saved<T>(result: SaveResult<T>) -> T {
        match result {
            SaveResult::Saved { record } => record,
            _ => panic!("expected saved record"),
        }
    }

    #[tokio::test]
    async fn independent_ids_and_multiple_listings_survive_reopen_and_search() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("research.sqlite3");
        initialize_database(&path).await.unwrap();
        let first = saved(
            create_company(&path, company("  研究样例公司  "), false)
                .await
                .unwrap(),
        );
        assert_eq!(first.name, "研究样例公司");
        assert_ne!(first.id, first.name);
        assert!(uuid::Uuid::parse_str(&first.id).is_ok());
        saved(
            add_listing(&path, &first.id, listing("  01234  "), false)
                .await
                .unwrap(),
        );
        let mut adr = listing("sample");
        adr.market = ListingMarket::Us;
        adr.exchange = "NASDAQ".into();
        adr.security_type = "ADR".into();
        saved(add_listing(&path, &first.id, adr, false).await.unwrap());
        initialize_database(&path).await.unwrap();
        let detail = get_company(&path, &first.id).await.unwrap();
        assert_eq!(detail.listings.len(), 2);
        assert!(detail.listings.iter().all(|row| row.company_id == first.id));
        assert_eq!(list_companies(&path, "样例").await.unwrap().len(), 1);
        assert_eq!(list_companies(&path, "sample").await.unwrap().len(), 1);
        assert_eq!(list_companies(&path, "01234").await.unwrap().len(), 1);
        assert_eq!(list_companies(&path, "%").await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn duplicate_name_and_code_require_confirmation_and_never_merge() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("research.sqlite3");
        initialize_database(&path).await.unwrap();
        let first = saved(
            create_company(&path, company("重复公司"), false)
                .await
                .unwrap(),
        );
        assert!(matches!(
            create_company(&path, company("重复公司"), false)
                .await
                .unwrap(),
            SaveResult::NeedsConfirmation { .. }
        ));
        assert_eq!(list_companies(&path, "").await.unwrap().len(), 1);
        let second = saved(
            create_company(&path, company("重复公司"), true)
                .await
                .unwrap(),
        );
        assert_ne!(first.id, second.id);
        saved(
            add_listing(&path, &first.id, listing("X1"), false)
                .await
                .unwrap(),
        );
        assert!(matches!(
            add_listing(&path, &second.id, listing("x1"), false)
                .await
                .unwrap(),
            SaveResult::NeedsConfirmation { .. }
        ));
        assert!(
            get_company(&path, &second.id)
                .await
                .unwrap()
                .listings
                .is_empty()
        );
        saved(
            add_listing(&path, &second.id, listing("x1"), true)
                .await
                .unwrap(),
        );
        assert_eq!(list_companies(&path, "").await.unwrap().len(), 2);
        assert_eq!(
            get_company(&path, &second.id).await.unwrap().listings.len(),
            1
        );
    }

    #[tokio::test]
    async fn rejects_empty_name_invalid_listing_and_unknown_parent_without_partial_data() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("research.sqlite3");
        initialize_database(&path).await.unwrap();
        assert!(create_company(&path, company(" \n "), false).await.is_err());
        let mut input = company("invalid securities");
        input.listings = vec![listing("OK"), listing("")];
        assert!(create_company(&path, input, false).await.is_err());
        assert!(list_companies(&path, "").await.unwrap().is_empty());
        assert!(
            add_listing(&path, "nonexistent", listing("OK"), false)
                .await
                .is_err()
        );
        assert!(get_company(&path, "nonexistent").await.is_err());
    }

    #[tokio::test]
    async fn company_and_listing_backup_round_trip_keeps_ids_and_foreign_keys() {
        let temp = tempdir().unwrap();
        let data = temp.path().join("data");
        let target = temp.path().join("restore");
        let path = data.join("research.sqlite3");
        initialize_database(&path).await.unwrap();
        let mut input = company("备份代表公司");
        input.market = CompanyMarket::A;
        let mut stock = listing("600001");
        stock.market = ListingMarket::A;
        stock.exchange = "SSE".into();
        input.listings.push(stock);
        let before = saved(create_company(&path, input, false).await.unwrap());
        let manifest = create_backup(&data, &temp.path().join("backup"))
            .await
            .unwrap();
        assert_eq!(manifest.schema_version, 3);
        restore_backup(&temp.path().join("backup"), &target)
            .await
            .unwrap();
        assert_eq!(
            get_company(&target.join("research.sqlite3"), &before.id)
                .await
                .unwrap(),
            before
        );
        restore_backup(&temp.path().join("backup"), &target)
            .await
            .unwrap();
        assert_eq!(
            list_companies(&target.join("research.sqlite3"), "")
                .await
                .unwrap()
                .len(),
            1
        );
    }
}
