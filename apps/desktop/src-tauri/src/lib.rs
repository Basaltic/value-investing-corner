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
        .invoke_handler(tauri::generate_handler![app_info, storage_status])
        .run(tauri::generate_context!())
        .expect("无法启动价投小角落桌面端");
}

#[cfg(test)]
mod tests {
    use super::app_info;

    #[test]
    fn native_info_matches_package_version() {
        let info = app_info();
        assert_eq!(info.name, "价投小角落");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
