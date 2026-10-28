pub mod backup;
mod collection;
mod companies;
mod credentials;
mod dashboard;
mod finance;
mod judgments;
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

#[tauri::command]
async fn judgment_state(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
) -> Result<judgments::JudgmentState, String> {
    judgments::state(std::path::Path::new(&status.database_path), &company_id).await
}
#[tauri::command]
async fn judgment_start(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    base_id: Option<String>,
) -> Result<judgments::Judgment, String> {
    judgments::start(
        std::path::Path::new(&status.database_path),
        &company_id,
        base_id.as_deref(),
    )
    .await
}
#[tauri::command]
async fn judgment_save(
    status: State<'_, storage::StorageStatus>,
    id: String,
    expected_revision: i64,
    input: judgments::DraftInput,
) -> Result<judgments::Judgment, String> {
    judgments::save(
        std::path::Path::new(&status.database_path),
        &id,
        expected_revision,
        input,
    )
    .await
}
#[tauri::command]
async fn judgment_freeze(
    status: State<'_, storage::StorageStatus>,
    id: String,
    expected_revision: i64,
) -> Result<judgments::Judgment, String> {
    judgments::freeze(
        std::path::Path::new(&status.database_path),
        &id,
        expected_revision,
    )
    .await
}
#[tauri::command]
async fn judgment_discard(
    status: State<'_, storage::StorageStatus>,
    id: String,
    expected_revision: i64,
) -> Result<(), String> {
    judgments::discard(
        std::path::Path::new(&status.database_path),
        &id,
        expected_revision,
    )
    .await
}

#[tauri::command]
fn judgment_close_window<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) -> Result<(), String> {
    // The frontend intercepts close requests and only calls this after saving or when clean.
    // Do not rely on the SDK's generic destroy permission or recursively emit close events.
    window.destroy().map_err(|e| e.to_string())
}

#[tauri::command]
async fn finance_state(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
) -> Result<finance::FinanceState, String> {
    finance::state(std::path::Path::new(&status.database_path), &company_id).await
}
#[tauri::command]
async fn finance_save_fact(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    input: finance::FactInput,
    base_id: Option<String>,
) -> Result<finance::Version<finance::FactInput>, String> {
    finance::save_fact(
        std::path::Path::new(&status.database_path),
        &company_id,
        input,
        base_id.as_deref(),
    )
    .await
}
#[tauri::command]
async fn finance_define(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    input: finance::DefinitionInput,
) -> Result<finance::Definition, String> {
    finance::define(
        std::path::Path::new(&status.database_path),
        &company_id,
        input,
    )
    .await
}
#[tauri::command]
async fn finance_observe(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    input: finance::ObservationInput,
    base_id: Option<String>,
) -> Result<finance::Version<finance::ObservationInput>, String> {
    finance::observe(
        std::path::Path::new(&status.database_path),
        &company_id,
        input,
        base_id.as_deref(),
    )
    .await
}

#[tauri::command]
async fn dashboard_load(
    status: State<'_, storage::StorageStatus>,
) -> Result<dashboard::Saved, String> {
    dashboard::load(std::path::Path::new(&status.database_path)).await
}
#[tauri::command]
async fn dashboard_save(
    status: State<'_, storage::StorageStatus>,
    config: dashboard::Config,
    expected_revision: i64,
) -> Result<dashboard::Saved, String> {
    dashboard::save(
        std::path::Path::new(&status.database_path),
        config,
        expected_revision,
    )
    .await
}
#[tauri::command]
async fn dashboard_items(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
) -> Result<Vec<dashboard::Item>, String> {
    dashboard::items(std::path::Path::new(&status.database_path), &company_id).await
}
#[tauri::command]
async fn dashboard_put_item(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    input: dashboard::ItemInput,
) -> Result<dashboard::Item, String> {
    dashboard::put(
        std::path::Path::new(&status.database_path),
        &company_id,
        input,
    )
    .await
}

#[tauri::command]
async fn collection_sources(
    status: State<'_, storage::StorageStatus>,
) -> Result<Vec<collection::Source>, String> {
    collection::sources(std::path::Path::new(&status.database_path)).await
}
#[tauri::command]
async fn collection_save_source(
    status: State<'_, storage::StorageStatus>,
    id: String,
    input: collection::SourceInput,
    expected_revision: i64,
) -> Result<collection::Source, String> {
    collection::save_source(
        std::path::Path::new(&status.database_path),
        &id,
        input,
        expected_revision,
    )
    .await
}
#[tauri::command]
async fn collection_enqueue(
    status: State<'_, storage::StorageStatus>,
    company_id: String,
    source_id: String,
    request_key: String,
) -> Result<collection::Run, String> {
    collection::enqueue(
        std::path::Path::new(&status.database_path),
        &company_id,
        &source_id,
        &request_key,
    )
    .await
}
#[tauri::command]
async fn collection_runs(
    status: State<'_, storage::StorageStatus>,
) -> Result<Vec<collection::Run>, String> {
    collection::runs(std::path::Path::new(&status.database_path)).await
}
#[tauri::command]
async fn collection_events(
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<Vec<collection::Event>, String> {
    collection::events(std::path::Path::new(&status.database_path), &id).await
}
#[tauri::command]
async fn collection_execute(
    app: tauri::AppHandle,
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<collection::Run, String> {
    let db = std::path::Path::new(&status.database_path);
    let r = collection::get_run(db, &id).await?;
    let registered = collection::sources(db).await?;
    let allowed = registered
        .iter()
        .find(|s| s.id == r.source_id)
        .is_some_and(|s| {
            s.input.enabled
                && s.input.level != "blocked"
                && !s.input.evidence.is_empty()
                && !s.input.evidence_url.is_empty()
                && s.input.purpose_confirmed
        });
    let configured = if allowed && r.source_id == "gnews" {
        let ns = app.config().identifier.clone();
        tauri::async_runtime::spawn_blocking(move || credentials::status(&ns, "gnews"))
            .await
            .map_err(|_| "凭据检查未完成")??
            .configured
    } else {
        false
    };
    collection::execute(db, &id, configured).await
}
#[tauri::command]
async fn collection_retry(
    status: State<'_, storage::StorageStatus>,
    id: String,
) -> Result<collection::Run, String> {
    collection::retry(std::path::Path::new(&status.database_path), &id).await
}
#[tauri::command]
async fn collection_credential_status(
    app: tauri::AppHandle,
    source_id: String,
) -> Result<credentials::CredentialStatus, String> {
    let ns = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || credentials::status(&ns, &source_id))
        .await
        .map_err(|_| "凭据检查未完成")?
}
#[tauri::command]
async fn collection_credential_save(
    app: tauri::AppHandle,
    source_id: String,
    secret: String,
) -> Result<credentials::CredentialStatus, String> {
    let ns = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || credentials::save(&ns, &source_id, &secret))
        .await
        .map_err(|_| "凭据保存未完成")?
}
#[tauri::command]
async fn collection_credential_remove(
    app: tauri::AppHandle,
    source_id: String,
) -> Result<credentials::CredentialStatus, String> {
    let ns = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || credentials::remove(&ns, &source_id))
        .await
        .map_err(|_| "凭据删除未完成")?
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
            material_open_source,
            judgment_state,
            judgment_start,
            judgment_save,
            judgment_freeze,
            judgment_discard,
            judgment_close_window,
            finance_state,
            finance_save_fact,
            finance_define,
            finance_observe,
            dashboard_load,
            dashboard_save,
            dashboard_items,
            dashboard_put_item,
            collection_sources,
            collection_save_source,
            collection_enqueue,
            collection_runs,
            collection_events,
            collection_execute,
            collection_retry,
            collection_credential_status,
            collection_credential_save,
            collection_credential_remove
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
                super::material_csv_mapping,
                super::judgment_state,
                super::judgment_start,
                super::judgment_save,
                super::judgment_freeze,
                super::judgment_discard,
                super::judgment_close_window,
                super::finance_state,
                super::finance_save_fact,
                super::finance_define,
                super::finance_observe,
                super::dashboard_load,
                super::dashboard_save,
                super::dashboard_items,
                super::dashboard_put_item,
                super::collection_sources,
                super::collection_save_source,
                super::collection_enqueue,
                super::collection_runs,
                super::collection_events,
                super::collection_retry
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
        let d = request(
            "judgment_start",
            serde_json::json!({"companyId":id,"baseId":null}),
        )
        .unwrap();
        let did = d["id"].as_str().unwrap();
        let doc = serde_json::json!({"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"IPC判断正文"}]}]},"reason":""});
        let saved = request(
            "judgment_save",
            serde_json::json!({"id":did,"expectedRevision":0,"input":doc}),
        )
        .unwrap();
        assert_eq!(saved["revision"], 1);
        assert!(
            request(
                "judgment_freeze",
                serde_json::json!({"id":did,"expectedRevision":0})
            )
            .is_err()
        );
        let v = request(
            "judgment_freeze",
            serde_json::json!({"id":did,"expectedRevision":1}),
        )
        .unwrap();
        assert_eq!(v["version"], 1);
        let history = request("judgment_state", serde_json::json!({"companyId":id})).unwrap();
        assert_eq!(history["versions"][0]["text"], "IPC判断正文\n");
        assert!(history["draft"].is_null());
        assert!(
            request(
                "judgment_save",
                serde_json::json!({"id":did,"expectedRevision":1,"input":doc})
            )
            .is_err()
        );
        let revision = request(
            "judgment_start",
            serde_json::json!({"companyId":id,"baseId":v["id"]}),
        )
        .unwrap();
        request(
            "judgment_discard",
            serde_json::json!({"id":revision["id"],"expectedRevision":0}),
        )
        .unwrap();
        assert!(
            request("judgment_state", serde_json::json!({"companyId":id})).unwrap()["draft"]
                .is_null()
        );
        let financial_input = serde_json::json!({"metric":"revenue","value":null,"currency":"CNY","unit":"元","period_kind":"annual","period_start":"2025-01-01","period_end":"2025-12-31","standard":"CAS","scope":"合并","basis":"虚构测试","reviewed":false,"source":"测试","tags":[]});
        let fact = request(
            "finance_save_fact",
            serde_json::json!({"companyId":id,"input":financial_input,"baseId":null}),
        )
        .unwrap();
        assert!(fact["input"]["value"].is_null());
        assert_eq!(fact["version"], 1);
        let definition=request("finance_define",serde_json::json!({"companyId":id,"input":{"name":"IPC文本","value_type":"text","unit":"","currency":"","basis":"个人观察"}})).unwrap();
        request("finance_observe",serde_json::json!({"companyId":id,"baseId":null,"input":{"definition_id":definition["id"],"date":"2025-12-31","numeric_value":null,"text_value":"测试观察","reviewed":true,"source":"自己输入","tags":[]}})).unwrap();
        let state = request("finance_state", serde_json::json!({"companyId":id})).unwrap();
        assert_eq!(state["facts"].as_array().unwrap().len(), 1);
        assert_eq!(state["observations"][0]["input"]["text_value"], "测试观察");
        assert!(request("finance_observe",serde_json::json!({"companyId":id,"baseId":null,"input":{"definition_id":definition["id"],"date":"2025-02-29","numeric_value":1,"text_value":null,"reviewed":false,"source":"","tags":[]}})).is_err());
        let dash = request("dashboard_load", serde_json::json!({})).unwrap();
        assert_eq!(dash["revision"], 0);
        let config = serde_json::json!({"groups":[{"id":"g","name":"关注","company_ids":[id]}],"cards":[{"id":"metric","company_id":id,"kind":"metric","visible":true,"selection":{"kind":"fact","metric":"revenue","anchor_id":fact["id"]},"from":"","to":"","show_pending":false}]});
        let dash = request(
            "dashboard_save",
            serde_json::json!({"config":config,"expectedRevision":0}),
        )
        .unwrap();
        assert_eq!(dash["revision"], 1);
        assert!(
            request(
                "dashboard_save",
                serde_json::json!({"config":config,"expectedRevision":0})
            )
            .is_err()
        );
        let item=request("dashboard_put_item",serde_json::json!({"companyId":id,"input":{"id":null,"kind":"supplement","material_id":null,"text":"补现金流","done":false,"expected_revision":0}})).unwrap();
        assert_eq!(item["text"], "补现金流");
        assert_eq!(
            request("dashboard_items", serde_json::json!({"companyId":id}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            request("collection_sources", serde_json::json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            3
        );
        let run = request(
            "collection_enqueue",
            serde_json::json!({"companyId":id,"sourceId":"sec_finance","requestKey":"ipc1"}),
        )
        .unwrap();
        assert_eq!(run["state"], "queued");
        let same = request(
            "collection_enqueue",
            serde_json::json!({"companyId":id,"sourceId":"sec_finance","requestKey":"ipc1"}),
        )
        .unwrap();
        assert_eq!(same["id"], run["id"]);
        assert_eq!(
            request("collection_runs", serde_json::json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            request("collection_events", serde_json::json!({"id":run["id"]}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        // MockRuntime tests command registration/current-window scope, not real macOS window destruction.
        request("judgment_close_window", serde_json::json!({})).unwrap();
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
