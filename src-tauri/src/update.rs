//! Signed self-update through GitHub Releases.
//!
//! Every client checks GitHub's `latest.json`; users never paste URLs, keys or
//! run database commands. Tauri verifies the downloaded installer signature
//! before it can run. The updater public key is safe to ship; the private key
//! exists only as GitHub Actions secrets.

use serde::Serialize;
use tauri::AppHandle;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => Ok(UpdateInfo {
            available: true,
            current_version: update.current_version.clone(),
            version: Some(update.version.clone()),
            body: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        }),
        None => Ok(UpdateInfo {
            available: false,
            current_version: app.package_info().version.to_string(),
            version: None,
            body: None,
            date: None,
        }),
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    Ok(UpdateInfo {
        available: false,
        current_version: app.package_info().version.to_string(),
        version: None,
        body: None,
        date: None,
    })
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Err("no update available".into());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // NSIS starts the new installer after this process exits.
    app.restart();
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub async fn update_install(_app: AppHandle) -> Result<(), String> {
    Err("in-app update not supported on mobile".into())
}
