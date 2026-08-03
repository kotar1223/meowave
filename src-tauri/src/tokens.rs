//! OAuth/API tokens for streaming services live in the OS keychain
//! (Windows Credential Manager via the `keyring` crate), never in files.

use keyring::Entry;

const KEYCHAIN_SERVICE: &str = "meowave";
const KNOWN_SERVICES: &[&str] = &["ytm", "sc", "ym"];

/// Services that work without any user credentials: SoundCloud runs on a
/// public client_id we scrape ourselves, YouTube Music answers guest
/// InnerTube requests. They never appear in the keychain, but the UI still
/// has to show them as usable.
pub const TOKENLESS_SERVICES: &[&str] = &["sc", "ytm"];

fn entry(service: &str) -> Result<Entry, String> {
    if !KNOWN_SERVICES.contains(&service) {
        return Err(format!("unknown service: {service}"));
    }
    Entry::new(KEYCHAIN_SERVICE, service).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_service_token(service: String, token: String) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("token is empty".into());
    }
    entry(&service)?.set_password(token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_service_token(service: String) -> Result<Option<String>, String> {
    read_token(&service)
}

/// Same thing for callers inside Rust (api / stream), without the command
/// wrapper.
pub fn read_token(service: &str) -> Result<Option<String>, String> {
    match entry(service)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_service_token(service: String) -> Result<(), String> {
    match entry(&service)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn list_connected_services() -> Vec<String> {
    KNOWN_SERVICES
        .iter()
        .filter(|id| {
            TOKENLESS_SERVICES.contains(id)
                || Entry::new(KEYCHAIN_SERVICE, id)
                    .and_then(|e| e.get_password())
                    .is_ok()
        })
        .map(|s| s.to_string())
        .collect()
}
