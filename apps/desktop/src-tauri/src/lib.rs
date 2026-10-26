pub mod backup;
mod companies;
mod storage;

use tauri::{Manager, State};

#[derive(serde::Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "价投小角落",
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[tauri::command]
fn storage_status(status: State<'_, storage::StorageStatus>) -> storage::StorageStatus {
    storage::StorageStatus {
        schema_version: status.schema_version,
        database_path: status.database_path.clone(),
    }
}

#[tauri::command]
async fn company_create(
    status: State<'_, storage::StorageStatus>,
    input: companies::CompanyInput,
    confirm_duplicates: bool,
) -> Result<companies::SaveResult<companies::Company>, String> {
    companies::create_company(
        std::path::Path::new(&status.database_path),
        input,
        confirm_duplicates,
    )
    .await
}
#[tauri::command]
async fn company_list(
    status: State<'_, storage::StorageStatus>,
    query: String,
) -> Result<Vec<companies::Company>, String> {
    companies::list_companies(std::path::Path::new(&status.database_path), &query).await
}
#[tauri::command]
async fn company_get(
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<companies::Company, String> {
    companies::get_company(std::path::Path::new(&status.database_path), &id).await
}
#[tauri::command]
async fn listing_add(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    input: companies::ListingInput,
    confirm_duplicates: bool,
) -> Result<companies::SaveResult<companies::Listing>, String> {
    companies::add_listing(
        std::path::Path::new(&status.database_path),
        &company_id,
        input,
        confirm_duplicates,
    )
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let database_path = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("无法定位应用数据目录：{error}"))?
                .join("research.sqlite3");
            let status =
                tauri::async_runtime::block_on(storage::initialize_database(&database_path))
                    .map_err(std::io::Error::other)?;
            app.manage(status);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            storage_status,
            company_create,
            company_list,
            company_get,
            listing_add
        ])
        .run(tauri::generate_context!())
        .expect("无法启动价投小角落桌面端");
}

#[cfg(test)]
mod tests {
    use super::app_info;

    #[test]
    fn company_commands_use_fixed_storage_and_return_confirmation() {
        use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder, mock_context, noop_assets};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("research.sqlite3");
        let status =
            tauri::async_runtime::block_on(crate::storage::initialize_database(&path)).unwrap();
        let app = mock_builder()
            .manage(status)
            .invoke_handler(tauri::generate_handler![
                super::company_create,
                super::company_list,
                super::company_get,
                super::listing_add
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let request = |cmd: &str, body: serde_json::Value| {
            get_ipc_response(
                &window,
                tauri::webview::InvokeRequest {
                    cmd: cmd.into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    body: tauri::ipc::InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.into(),
                },
            )
            .map(|result| result.deserialize::<serde_json::Value>().unwrap())
        };
        let input = serde_json::json!({"name":"IPC测试公司", "market":"private", "registration":"", "listings":[]});
        let created = request(
            "company_create",
            serde_json::json!({"input": input, "confirmDuplicates": false}),
        )
        .unwrap();
        assert_eq!(created["kind"], "saved");
        let id = created["record"]["id"].as_str().unwrap();
        let detail = request("company_get", serde_json::json!({"id": id})).unwrap();
        assert_eq!(detail["name"], "IPC测试公司");
        let duplicate = request(
            "company_create",
            serde_json::json!({"input": input, "confirmDuplicates": false}),
        )
        .unwrap();
        assert_eq!(duplicate["kind"], "needs_confirmation");
        let added = request("listing_add", serde_json::json!({"companyId": id, "input": {"market":"hk", "code":"12345", "exchange":"HKEX", "security_type":"普通股"}, "confirmDuplicates": false})).unwrap();
        assert_eq!(added["kind"], "saved");
        let list = request("company_list", serde_json::json!({"query":"12345"})).unwrap();
        assert_eq!(list.as_array().unwrap().len(), 1);
        assert!(request("company_create", serde_json::json!({"input": {"name":"", "market":"private", "registration":"", "listings":[]}, "confirmDuplicates":false})).is_err());
    }

    #[test]
    fn native_info_matches_package_version() {
        let info = app_info();
        assert_eq!(info.name, "价投小角落");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
