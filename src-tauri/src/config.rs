use serde::Serialize;

#[derive(Serialize)]
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
}

/// Loads .env from the executable's directory first (installed app),
/// then falls back to dotenvy's ancestor search from the CWD (dev runs
/// from src-tauri, the .env lives in the project root one level up).
pub fn load_env() {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(".env");
            if candidate.exists() {
                let _ = dotenvy::from_path(&candidate);
            }
        }
    }
    let _ = dotenvy::dotenv();
}

/// The publishable key is intentionally non-secret: data access is guarded by
/// Supabase Row Level Security, not by hiding this key. These defaults are the
/// production Meowave project, so an installed build has working accounts out
/// of the box. Environment variables still override them for dev/staging.
#[tauri::command]
pub fn get_supabase_config() -> Result<SupabaseConfig, String> {
    const DEFAULT_URL: &str = "https://tvbdxxhskxnskbzfrxpp.supabase.co";
    const DEFAULT_PUBLISHABLE: &str = "sb_publishable_dbur0qB9UvZQwQDeMiWjaw_-Mpg4cTu";
    let url = std::env::var("SUPABASE_URL").unwrap_or_else(|_| DEFAULT_URL.to_string());
    let anon_key = std::env::var("SUPABASE_ANON_KEY")
        .or_else(|_| std::env::var("SUPABASE_PUBLISHABLE_KEY"))
        .unwrap_or_else(|_| DEFAULT_PUBLISHABLE.to_string());
    if url.trim().is_empty() || anon_key.trim().is_empty() {
        return Err("SUPABASE_URL / SUPABASE_ANON_KEY are empty in .env".into());
    }
    Ok(SupabaseConfig {
        url: url.trim().to_string(),
        anon_key: anon_key.trim().to_string(),
    })
}
