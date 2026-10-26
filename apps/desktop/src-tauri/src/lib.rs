pub mod backup;
mod companies;
mod materials;
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

#[tauri::command]
async fn material_create(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    kind: String,
    input: materials::MaterialInput,
) -> Result<materials::Material, String> {
    materials::create_text(
        std::path::Path::new(&status.database_path),
        &company_id,
        &kind,
        input,
    )
    .await
}
#[tauri::command]
async fn material_list(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    query: String,
    archived: bool,
) -> Result<Vec<materials::Material>, String> {
    materials::list(
        std::path::Path::new(&status.database_path),
        &company_id,
        &query,
        archived,
    )
    .await
}
#[tauri::command]
async fn material_get(
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<materials::Material, String> {
    materials::get(std::path::Path::new(&status.database_path), &id).await
}
#[tauri::command]
async fn material_update(
    status: State<'_, storage::StorageStatus>,
    id: String,
    input: materials::MaterialInput,
) -> Result<materials::Material, String> {
    materials::update(std::path::Path::new(&status.database_path), &id, input).await
}
#[tauri::command]
async fn material_archive(
    status: State<'_, storage::StorageStatus>,
    id: String,
    archived: bool,
) -> Result<materials::Material, String> {
    materials::archive(std::path::Path::new(&status.database_path), &id, archived).await
}
#[tauri::command]
async fn material_preview(
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<materials::Preview, String> {
    materials::preview(std::path::Path::new(&status.database_path), &id).await
}
#[tauri::command]
async fn material_csv_mapping(
    status: State<'_, storage::StorageStatus>,
    id: String,
    mapping: Vec<String>,
) -> Result<materials::Material, String> {
    materials::set_csv_mapping(std::path::Path::new(&status.database_path), &id, mapping).await
}
async fn pick_material_file(app: &tauri::AppHandle) -> Result<Option<std::path::PathBuf>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    let picker = app
        .dialog()
        .file()
        .set_title("选择公司研究资料（单个文件）");
    let picker = if let Some(window) = app.get_webview_window("main") {
        picker.set_parent(&window)
    } else {
        picker
    };
    let picked = tauri::async_runtime::spawn_blocking(move || picker.blocking_pick_file())
        .await
        .map_err(|e| e.to_string())?;
    match picked {
        None => Ok(None),
        Some(FilePath::Path(path)) => Ok(Some(path)),
        _ => Err("仅支持本地文件路径".into()),
    }
}
#[tauri::command]
async fn material_import_file(
    app: tauri::AppHandle,
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    mode: String,
    input: materials::MaterialInput,
) -> Result<Option<materials::Material>, String> {
    let db = std::path::Path::new(&status.database_path);
    companies::get_company(db, &company_id).await?;
    let Some(path) = pick_material_file(&app).await? else {
        return Ok(None);
    };
    materials::import_file(db, &company_id, &path, &mode, input)
        .await
        .map(Some)
}
#[tauri::command]
async fn material_relocate(
    app: tauri::AppHandle,
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<Option<materials::Material>, String> {
    let db = std::path::Path::new(&status.database_path);
    let row = materials::get(db, &id).await?;
    if row.file_mode != "reference" {
        return Err("只有外部引用可重新定位".into());
    }
    let Some(path) = pick_material_file(&app).await? else {
        return Ok(None);
    };
    materials::relocate(db, &id, &path).await.map(Some)
}
#[tauri::command]
async fn material_reveal(
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<(), String> {
    let path = materials::file_path(std::path::Path::new(&status.database_path), &id).await?;
    if !path.is_file() {
        return Err("文件失效，请重新定位外部引用".into());
    }
    // Reveal only, never execute an arbitrary imported file.
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}
#[tauri::command]
async fn material_open_source(
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<(), String> {
    let row = materials::get(std::path::Path::new(&status.database_path), &id).await?;
    let url = tauri::Url::parse(&row.url).map_err(|_| "没有有效来源链接")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("来源链接不在允许范围".into());
    }
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            listing_add,
            material_create,
            material_list,
            material_get,
            material_update,
            material_archive,
            material_preview,
            material_csv_mapping,
            material_import_file,
            material_relocate,
            material_reveal,
            material_open_source
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
                super::listing_add,
                super::material_create,
                super::material_list,
                super::material_get,
                super::material_update,
                super::material_archive,
                super::material_preview,
                super::material_csv_mapping
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
        let material_input =
            serde_json::json!({"title":"IPC资料","body":"资料正文","url":"","tags":["护城河"]});
        let material = request(
            "material_create",
            serde_json::json!({"companyId":id,"kind":"note","input":material_input}),
        )
        .unwrap();
        let material_id = material["id"].as_str().unwrap();
        let preview = request("material_preview", serde_json::json!({"id":material_id})).unwrap();
        assert_eq!(preview["text"], "资料正文");
        let filtered = request(
            "material_list",
            serde_json::json!({"companyId":id,"query":"护城河","archived":false}),
        )
        .unwrap();
        assert_eq!(filtered.as_array().unwrap().len(), 1);
        request(
            "material_archive",
            serde_json::json!({"id":material_id,"archived":true}),
        )
        .unwrap();
        assert_eq!(
            request("material_get", serde_json::json!({"id":material_id})).unwrap()["archived"],
            true
        );
        assert!(request("material_create",serde_json::json!({"companyId":id,"kind":"note","input":{"title":"","body":"","url":"","tags":[]}})).is_err());
        assert!(request("company_create", serde_json::json!({"input": {"name":"", "market":"private", "registration":"", "listings":[]}, "confirmDuplicates":false})).is_err());
    }

    #[test]
    fn native_info_matches_package_version() {
        let info = app_info();
        assert_eq!(info.name, "价投小角落");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
