//! OAuth/API tokens for streaming services live in the OS keychain
//! (Windows Credential Manager via the `keyring` crate), never in files.
//! On Android, tokens are stored in the private app data directory.

#[cfg(not(target_os = "android"))]
use keyring::Entry;

#[cfg(not(target_os = "android"))]
const KEYCHAIN_SERVICE: &str = "meowave";
/// `sp` holds the whole Spotify token set as JSON rather than a bare string:
/// PKCE hands back an access token, a refresh token and an expiry, and losing
/// any of the three means a fresh browser round-trip on every restart.
/// `sp_redirect_port` is not a service — it is a stored preference that the
/// allowlist still has to name, because every accessor validates against this
/// list. Leaving it out made `spotify_set_redirect_port` fail unconditionally.
const KNOWN_SERVICES: &[&str] = &[
    "ytm",
    "sc",
    "dz",
    "am",
    "ym",
    "sp",
    "sp_client_id",
    "sp_redirect_port",
    // The user's own accounts (accounts.rs): a YouTube session cookie set,
    // a SoundCloud OAuth token and a Deezer `arl`. They sign the library
    // import and the personal shelves; playback itself stays tokenless.
    "ytm_cookie",
    "sc_oauth",
    "dz_arl",
];

/// Entries that are configuration rather than a signed-in account, so the UI
/// must not report them as connected services.
/// The account keys are not services either: YouTube Music, SoundCloud and
/// Deezer are usable without them, and accounts.rs reports their state.
const NON_SERVICE_KEYS: &[&str] = &["sp_client_id", "sp_redirect_port", "ytm_cookie", "sc_oauth", "dz_arl"];

/// Windows Credential Manager caps one secret at 2560 bytes (1280 UTF-16
/// characters), and a YouTube session is a whole set of cookies. A longer
/// value is split over numbered entries (`service#1`, `service#2`, …) and the
/// main entry holds a marker with the count.
#[cfg(not(target_os = "android"))]
const CHUNK: usize = 1000;
#[cfg(not(target_os = "android"))]
const CHUNKED: &str = "\u{1}chunks:";

#[cfg(not(target_os = "android"))]
fn part(service: &str, i: usize) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, &format!("{service}#{i}")).map_err(|e| e.to_string())
}

/// Removes the numbered parts of a split secret, stopping at the first gap.
#[cfg(not(target_os = "android"))]
fn drop_parts(service: &str) {
    for i in 1..=64 {
        let Ok(e) = part(service, i) else { break };
        if e.delete_credential().is_err() {
            break;
        }
    }
}

#[cfg(not(target_os = "android"))]
fn write_secret(service: &str, value: &str) -> Result<(), String> {
    drop_parts(service);
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= CHUNK {
        return entry(service)?.set_password(value).map_err(|e| e.to_string());
    }
    let parts: Vec<String> = chars.chunks(CHUNK).map(|c| c.iter().collect()).collect();
    for (i, p) in parts.iter().enumerate() {
        part(service, i + 1)?.set_password(p).map_err(|e| e.to_string())?;
    }
    entry(service)?
        .set_password(&format!("{CHUNKED}{}", parts.len()))
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
fn join_parts(service: &str, head: String) -> Result<String, String> {
    let Some(n) = head.strip_prefix(CHUNKED).and_then(|n| n.parse::<usize>().ok()) else {
        return Ok(head);
    };
    let mut out = String::new();
    for i in 1..=n {
        out.push_str(&part(service, i)?.get_password().map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Services that work without any user credentials: SoundCloud runs on a
/// public client_id we scrape ourselves, YouTube Music answers guest
/// InnerTube requests. They never appear in the keychain, but the UI still
/// has to show them as usable.
/// Deezer's catalogue API is public too; its audio comes from the matcher
/// (see dz.rs), so it never needs a credential either.
/// Spotify is listed since search and metadata work anonymously (spanon.rs);
/// its account session is read by spotify.rs itself, never through here.
/// Apple Music's catalogue is public the same way (am.rs).
pub const TOKENLESS_SERVICES: &[&str] = &["sc", "ytm", "dz", "sp", "am"];

#[cfg(not(target_os = "android"))]
fn entry(service: &str) -> Result<Entry, String> {
    if !KNOWN_SERVICES.contains(&service) {
        return Err(format!("unknown service: {service}"));
    }
    Entry::new(KEYCHAIN_SERVICE, service).map_err(|e| e.to_string())
}

#[cfg(target_os = "android")]
fn read_android_tokens() -> std::collections::HashMap<String, String> {
    if let Ok(dir) = crate::paths::root() {
        let file = dir.join("tokens.json");
        if let Ok(data) = std::fs::read_to_string(&file) {
            if let Ok(map) = serde_json::from_str(&data) {
                return map;
            }
        }
    }
    std::collections::HashMap::new()
}

#[cfg(target_os = "android")]
fn write_android_tokens(map: &std::collections::HashMap<String, String>) -> Result<(), String> {
    let dir = crate::paths::root()?;
    let file = dir.join("tokens.json");
    let data = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&file, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_service_token(service: String, token: String) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("token is empty".into());
    }
    if !KNOWN_SERVICES.contains(&service.as_str()) {
        return Err(format!("unknown service: {service}"));
    }
    #[cfg(not(target_os = "android"))]
    {
        write_secret(&service, token)
    }
    #[cfg(target_os = "android")]
    {
        let mut map = read_android_tokens();
        map.insert(service, token.to_string());
        write_android_tokens(&map)
    }
}

#[tauri::command]
pub fn get_service_token(service: String) -> Result<Option<String>, String> {
    read_token(&service)
}

/// Same thing for callers inside Rust (api / stream), without the command
/// wrapper.
pub fn read_token(service: &str) -> Result<Option<String>, String> {
    if !KNOWN_SERVICES.contains(&service) {
        return Err(format!("unknown service: {service}"));
    }
    #[cfg(not(target_os = "android"))]
    {
        match entry(service)?.get_password() {
            Ok(token) => join_parts(service, token).map(Some),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(target_os = "android")]
    {
        let map = read_android_tokens();
        Ok(map.get(service).cloned())
    }
}

#[tauri::command]
pub fn delete_service_token(service: String) -> Result<(), String> {
    if !KNOWN_SERVICES.contains(&service.as_str()) {
        return Err(format!("unknown service: {service}"));
    }
    #[cfg(not(target_os = "android"))]
    {
        drop_parts(&service);
        match entry(&service)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(target_os = "android")]
    {
        let mut map = read_android_tokens();
        map.remove(&service);
        write_android_tokens(&map)
    }
}

#[tauri::command]
pub fn list_connected_services() -> Vec<String> {
    KNOWN_SERVICES
        .iter()
        .filter(|id| {
            !NON_SERVICE_KEYS.contains(id)
                && (TOKENLESS_SERVICES.contains(id)
                    || read_token(id).map(|opt| opt.is_some()).unwrap_or(false))
        })
        .map(|s| s.to_string())
        .collect()
}
