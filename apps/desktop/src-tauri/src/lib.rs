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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
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
