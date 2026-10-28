#[derive(serde::Serialize)]
pub struct CredentialStatus {
    pub configured: bool,
}
fn validate_source(source: &str) -> Result<(), String> {
    if source != "gnews" {
        Err("此通道不使用密钥".into())
    } else {
        Ok(())
    }
}
#[cfg(target_os = "macos")]
fn entry(namespace: &str, source: &str) -> Result<keyring::Entry, String> {
    validate_source(source)?;
    keyring::Entry::new(&format!("{namespace}.collection"), source)
        .map_err(|_| "系统凭据库不可用，不回退文件存储".into())
}
#[cfg(target_os = "macos")]
pub fn status(namespace: &str, source: &str) -> Result<CredentialStatus, String> {
    match entry(namespace, source)?.get_password() {
        Ok(_) => Ok(CredentialStatus { configured: true }),
        Err(keyring::Error::NoEntry) => Ok(CredentialStatus { configured: false }),
        Err(_) => Err("系统凭据读取失败；配置状态未知，不回退文件存储".into()),
    }
}
#[cfg(target_os = "macos")]
pub fn save(namespace: &str, source: &str, secret: &str) -> Result<CredentialStatus, String> {
    if secret.trim().is_empty() || secret.len() > 4096 || secret.chars().any(char::is_control) {
        return Err("密钥为空、过长或含控制字符".into());
    }
    entry(namespace, source)?
        .set_password(secret)
        .map_err(|_| "系统凭据保存失败，不回退SQLite或文件".to_string())?;
    status(namespace, source)
}
#[cfg(target_os = "macos")]
pub fn remove(namespace: &str, source: &str) -> Result<CredentialStatus, String> {
    match entry(namespace, source)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => status(namespace, source),
        Err(_) => Err("系统凭据删除失败，未假报已清除".into()),
    }
}
#[cfg(not(target_os = "macos"))]
pub fn status(_namespace: &str, source: &str) -> Result<CredentialStatus, String> {
    validate_source(source)?;
    Err("当前平台尚未接入系统凭据库".into())
}
#[cfg(not(target_os = "macos"))]
pub fn save(_namespace: &str, source: &str, _secret: &str) -> Result<CredentialStatus, String> {
    validate_source(source)?;
    Err("当前平台尚未接入系统凭据库，不使用内存或文件替代".into())
}
#[cfg(not(target_os = "macos"))]
pub fn remove(_namespace: &str, source: &str) -> Result<CredentialStatus, String> {
    validate_source(source)?;
    Err("当前平台尚未接入系统凭据库".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credential_status_never_serializes_secret() {
        let status = CredentialStatus { configured: true };
        assert_eq!(
            serde_json::to_string(&status).unwrap(),
            "{\"configured\":true}"
        );
        assert!(save("unused", "sec_finance", "nonsecret").is_err());
        assert!(save("unused", "gnews", "").is_err());
    }
    #[test]
    #[ignore = "explicit macOS keychain probe only"]
    fn isolated_keychain_roundtrip() {
        let namespace = format!("com.valueinvestingcorner.p08probe.{}", uuid::Uuid::new_v4());
        let secret = format!("p08-test-{}", uuid::Uuid::new_v4());
        assert!(!status(&namespace, "gnews").unwrap().configured);
        let result = save(&namespace, "gnews", &secret);
        let configured = status(&namespace, "gnews");
        let removed = remove(&namespace, "gnews");
        assert!(result.unwrap().configured);
        assert!(configured.unwrap().configured);
        assert!(!removed.unwrap().configured);
    }
}
