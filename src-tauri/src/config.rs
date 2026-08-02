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

/// The anon key is intentionally non-secret: data access is guarded by
/// Supabase Row Level Security, not by hiding this key.
#[tauri::command]
pub fn get_supabase_config() -> Result<SupabaseConfig, String> {
    let url = std::env::var("SUPABASE_URL")
        .map_err(|_| "SUPABASE_URL is not set (put it in .env)".to_string())?;
    let anon_key = std::env::var("SUPABASE_ANON_KEY")
        .map_err(|_| "SUPABASE_ANON_KEY is not set (put it in .env)".to_string())?;
    if url.trim().is_empty() || anon_key.trim().is_empty() {
        return Err("SUPABASE_URL / SUPABASE_ANON_KEY are empty in .env".into());
    }
    Ok(SupabaseConfig {
        url: url.trim().to_string(),
        anon_key: anon_key.trim().to_string(),
    })
}
