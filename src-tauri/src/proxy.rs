//! Optional proxy for the services that are blocked in some countries.
//!
//! Off by default. Yandex Music works fine without it and Meowave must not
//! route a user's traffic anywhere they didn't ask for.
//!
//! # Why this is not "a free built-in VPN"
//!
//! Free proxy lists (and the popular vpn-configs-for-russia style repos) hand
//! out VLESS / VMess / Hysteria2 / Trojan / Shadowsocks subscriptions. None of
//! those are proxy protocols an HTTP client can speak: they need a full client
//! (Xray, sing-box, Hysteria) that terminates the tunnel and then exposes a
//! plain SOCKS5 port on localhost. Shipping one would mean bundling a second
//! binary, keeping it updated, and inheriting its CVEs — and shipping a
//! hardcoded list of strangers' servers would mean pushing every user's
//! listening history through hosts we cannot vouch for.
//!
//! So Meowave does the honest half of the job, which is also the useful half:
//! it speaks SOCKS5/HTTP, and it FINDS the local port that an already-running
//! client (v2rayN, Nekoray, sing-box, Hiddify, Throne, Karing, Tor…) is
//! already listening on. The user imports a subscription in the client they
//! trust; Meowave just uses the door it opened.
//!
//! # Selective routing
//!
//! Only the blocked hosts go through the proxy. Yandex refuses foreign exit
//! IPs outright, Supabase has no reason to be tunnelled, and our own
//! 127.0.0.1 stream proxy must never be — routing localhost into a SOCKS
//! server is an instant failure.

use std::sync::RwLock;

use serde::{Deserialize, Serialize};

/// Hosts that need the tunnel. Matched as domain suffixes, so a subdomain like
/// `rr4---sn-f5f7knee.googlevideo.com` is covered by `googlevideo.com`.
///
/// `googlevideo.com` and `sndcdn.com` matter as much as the API hosts: search
/// would succeed and playback would still be silent without them, because the
/// audio bytes come from the CDN, not the API.
const BLOCKED: &[&str] = &[
    // YouTube Music: API, media CDN, artwork.
    "youtube.com",
    "music.youtube.com",
    "youtubei.googleapis.com",
    "googlevideo.com",
    "ytimg.com",
    "ggpht.com",
    "googleusercontent.com",
    // SoundCloud: API and media CDN.
    "soundcloud.com",
    "sndcdn.com",
    // Last.fm, used for artwork lookups.
    "last.fm",
    "lastfm.freetls.fastly.net",
];

/// Hosts that must NEVER be proxied even if a user pastes a broad rule.
///
/// Yandex serves 403 to foreign exit nodes, so tunnelling it turns a working
/// service into a broken one. Localhost is our own stream proxy.
const NEVER: &[&str] = &[
    "yandex.net",
    "yandex.ru",
    "music.yandex.net",
    "localhost",
    "127.0.0.1",
];

// Every field's default is its type's default: off, empty, off, empty.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct ProxyConfig {
    /// Master switch. False on a fresh install.
    pub enabled: bool,
    /// `socks5://127.0.0.1:10808`, `socks5h://…`, or `http://…`.
    ///
    /// Prefer `socks5h`: it makes the proxy resolve DNS, so a blocked domain
    /// isn't leaked to (or poisoned by) the local resolver, which is how a lot
    /// of DPI blocking is actually implemented.
    pub url: String,
    /// Route everything instead of just the blocked list. Off by default: it
    /// breaks Yandex and adds latency to Supabase for no benefit.
    pub all_traffic: bool,
    /// Extra domain suffixes the user wants tunnelled.
    pub extra_hosts: Vec<String>,
}

static CONFIG: RwLock<Option<ProxyConfig>> = RwLock::new(None);

/// Cached so `client()` — called on every request — doesn't hit the lock's
/// slow path or re-parse the URL each time.
pub fn current() -> ProxyConfig {
    CONFIG
        .read()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_default()
}

fn store_path() -> Result<std::path::PathBuf, String> {
    Ok(crate::paths::root()?.join("proxy.json"))
}

/// Reads the saved config at startup. A missing or corrupt file means "off",
/// never a hard failure: a bad proxy file must not stop the player from
/// launching.
pub fn load() {
    let cfg = store_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<ProxyConfig>(&s).ok())
        .unwrap_or_default();
    if let Ok(mut g) = CONFIG.write() {
        *g = Some(cfg);
    }
}

fn persist(cfg: &ProxyConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(store_path()?, json).map_err(|e| e.to_string())
}

/// Normalises what a user is likely to paste. A bare `127.0.0.1:10808` is a
/// perfectly reasonable thing to type and shouldn't be an error.
fn normalise(raw: &str) -> Result<String, String> {
    let s = raw.trim();
    if s.is_empty() {
        return Err("proxy address is empty".into());
    }
    let with_scheme = if s.contains("://") {
        s.to_string()
    } else {
        format!("socks5h://{s}")
    };

    let scheme = with_scheme.split("://").next().unwrap_or("");
    if !matches!(scheme, "socks5" | "socks5h" | "http" | "https") {
        return Err(format!(
            "unsupported scheme \"{scheme}\". Use socks5://, socks5h:// or http://.\n\
             VLESS, VMess, Trojan, Hysteria2 and Shadowsocks links cannot be used \
             directly — import them into a client (v2rayN, Nekoray, Hiddify, sing-box) \
             and point Meowave at the local SOCKS port it opens."
        ));
    }

    // Reject the obvious mistake of pasting a subscription link.
    if with_scheme.len() > 400 {
        return Err("that looks like a subscription link, not a proxy address".into());
    }

    // Let reqwest validate the rest, so we fail here rather than on first use.
    reqwest::Proxy::all(&with_scheme).map_err(|e| format!("invalid proxy address: {e}"))?;
    Ok(with_scheme)
}

pub fn host_matches(host: &str, suffix: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    let s = suffix.trim().trim_start_matches('.').to_ascii_lowercase();
    if s.is_empty() {
        return false;
    }
    // Suffix match on a label boundary: "sndcdn.com" must not match
    // "notsndcdn.com".
    h == s || h.ends_with(&format!(".{s}"))
}

/// Decides whether a URL goes through the tunnel.
pub fn should_proxy(cfg: &ProxyConfig, host: &str) -> bool {
    if NEVER.iter().any(|n| host_matches(host, n)) {
        return false;
    }
    // Any loopback or link-local address is ours or the system's.
    if host == "::1" || host.starts_with("127.") || host.starts_with("192.168.") {
        return false;
    }
    if cfg.all_traffic {
        return true;
    }
    BLOCKED.iter().any(|b| host_matches(host, b))
        || cfg.extra_hosts.iter().any(|b| host_matches(host, b))
}

/// Builds the `reqwest::Proxy` with the routing predicate attached, or `None`
/// when the proxy is off or misconfigured.
pub fn reqwest_proxy() -> Option<reqwest::Proxy> {
    let cfg = current();
    if !cfg.enabled || cfg.url.trim().is_empty() {
        return None;
    }
    let built = reqwest::Proxy::custom(move |url| {
        let host = url.host_str().unwrap_or("");
        if should_proxy(&cfg, host) {
            // Parsed on every call, but only for requests that are actually
            // routed, and it keeps the cached config a plain serialisable
            // struct instead of a live Url.
            reqwest::Url::parse(&cfg.url).ok()
        } else {
            None
        }
    });
    Some(built)
}

/// A local SOCKS port that some VPN client has already opened.
#[derive(Serialize, Clone, Debug)]
pub struct Found {
    pub url: String,
    pub port: u16,
    /// Which client usually owns this port, so the UI can say
    /// "found v2rayN" instead of a bare number.
    pub likely: String,
    /// Whether a blocked host actually loaded through it. A listening port
    /// proves nothing: the client may be running with the tunnel switched off.
    pub works: bool,
}

/// Default inbound SOCKS ports of the popular clients. Checked in this order.
const KNOWN_PORTS: &[(u16, &str)] = &[
    (10808, "v2rayN / Xray"),
    (2080, "Nekoray / sing-box"),
    (1080, "generic SOCKS5"),
    (12334, "Hiddify"),
    (7890, "Clash / Mihomo"),
    (7891, "Clash (SOCKS)"),
    (10801, "Throne / Karing"),
    (9050, "Tor"),
    (1081, "Shadowsocks"),
    (20170, "sing-box (alt)"),
];

fn port_open(port: u16) -> bool {
    use std::net::{Ipv4Addr, SocketAddr, TcpStream};
    // A short timeout: this runs across ten ports and the UI is waiting.
    TcpStream::connect_timeout(
        &SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
        std::time::Duration::from_millis(120),
    )
    .is_ok()
}

/// Fetches a small blocked resource through a candidate proxy. This is the only
/// honest test: it proves the tunnel reaches the outside world, not just that
/// something accepted a TCP connection.
async fn probe(url: &str) -> Result<bool, String> {
    let proxy = reqwest::Proxy::all(url).map_err(|e| format!("bad proxy address: {e}"))?;
    // The crate is built with default-features off, so a plain builder has no
    // TLS backend at all and every https request fails instantly. The app's own
    // client sets rustls through its feature set; here it has to be explicit,
    // or "Test" reported a dead tunnel no matter what was on the other end.
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent(crate::api::UA)
        .timeout(std::time::Duration::from_secs(8))
        .proxy(proxy)
        .build()
        .map_err(|e| e.to_string())?;

    // generate_204 is a few bytes and is the standard reachability endpoint;
    // it is also behind the same block as YouTube itself.
    match client
        .get("https://www.youtube.com/generate_204")
        .send()
        .await
    {
        Ok(r) => Ok(r.status().is_success() || r.status().as_u16() == 204),
        // A refused connection means no tunnel; a timeout usually means the
        // client is up but its outbound is dead. Both are "not working", but
        // the message tells them apart.
        Err(e) if e.is_timeout() => Err("the proxy accepted the connection but never answered".into()),
        Err(e) if e.is_connect() => Err("nothing is listening on that address".into()),
        Err(e) => Err(e.to_string()),
    }
}

/// Scans localhost for a usable proxy. Returns every open port, marking the
/// ones that actually carry traffic.
#[tauri::command]
pub async fn proxy_detect() -> Vec<Found> {
    // The TCP probes are blocking, and ten of them at 120 ms each would hold a
    // runtime worker for over a second. They run together off the runtime, then
    // only the open ports get the (async) reachability test.
    let open: Vec<(u16, &'static str)> = tokio::task::spawn_blocking(|| {
        KNOWN_PORTS
            .iter()
            .filter(|(port, _)| port_open(*port))
            .map(|(port, likely)| (*port, *likely))
            .collect()
    })
    .await
    .unwrap_or_default();

    let mut out = Vec::new();
    for (port, likely) in open {
        // socks5h so DNS resolution happens at the exit node.
        let url = format!("socks5h://127.0.0.1:{port}");
        let works = probe(&url).await.unwrap_or(false);
        out.push(Found {
            url,
            port,
            likely: likely.to_string(),
            works,
        });
    }
    // Working entries first: the UI offers the top one.
    out.sort_by_key(|f| !f.works);
    out
}

/// Verifies a user-entered address before it is saved, so a typo surfaces here
/// rather than as silent playback failure later.
#[tauri::command]
pub async fn proxy_test(url: String) -> Result<bool, String> {
    let clean = normalise(&url)?;
    probe(&clean).await
}

#[tauri::command]
pub fn proxy_get() -> ProxyConfig {
    current()
}

#[tauri::command]
pub fn proxy_set(cfg: ProxyConfig) -> Result<ProxyConfig, String> {
    let mut next = cfg;
    // Only validate the address when it is actually going to be used: the user
    // may toggle the switch off while leaving a half-typed address behind.
    if next.enabled {
        next.url = normalise(&next.url)?;
    } else if !next.url.trim().is_empty() {
        next.url = next.url.trim().to_string();
    }
    next.extra_hosts = next
        .extra_hosts
        .iter()
        .map(|h| h.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|h| !h.is_empty() && !NEVER.iter().any(|n| host_matches(h, n)))
        .collect();

    persist(&next)?;
    if let Ok(mut g) = CONFIG.write() {
        *g = Some(next.clone());
    }
    // The HTTP clients were built against the old routing; drop them so the
    // next request picks the new one up (see api::reset_clients).
    crate::api::reset_clients();
    Ok(next)
}

/// The routing table, so the UI can explain what is tunnelled instead of
/// asking the user to trust it.
#[tauri::command]
pub fn proxy_routes() -> serde_json::Value {
    let cfg = current();
    serde_json::json!({
        "proxied": BLOCKED,
        "direct": NEVER,
        "extra": cfg.extra_hosts,
        "all_traffic": cfg.all_traffic,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Suffix matching must not be a substring match, or "notsndcdn.com" would
    /// be routed as if it were the SoundCloud CDN.
    #[test]
    fn suffix_matching_respects_label_boundary() {
        assert!(host_matches("sndcdn.com", "sndcdn.com"));
        assert!(host_matches("cf-media.sndcdn.com", "sndcdn.com"));
        assert!(host_matches("rr4---sn-f5f7knee.googlevideo.com", "googlevideo.com"));
        assert!(!host_matches("notsndcdn.com", "sndcdn.com"));
        assert!(!host_matches("sndcdn.com.evil.tld", "sndcdn.com"));
    }

    /// Yandex must stay direct (it 403s foreign IPs) and our own stream proxy
    /// must never be tunnelled — both would turn a working player into a
    /// broken one.
    #[test]
    fn never_list_wins_over_everything() {
        let cfg = ProxyConfig {
            enabled: true,
            url: "socks5h://127.0.0.1:10808".into(),
            all_traffic: true,
            extra_hosts: vec!["yandex.ru".into()],
        };
        assert!(!should_proxy(&cfg, "api.music.yandex.net"));
        assert!(!should_proxy(&cfg, "127.0.0.1"));
        assert!(!should_proxy(&cfg, "localhost"));
        assert!(!should_proxy(&cfg, "192.168.1.10"));
        // ...while a blocked host still routes.
        assert!(should_proxy(&cfg, "music.youtube.com"));
    }

    #[test]
    fn selective_routing_by_default() {
        let cfg = ProxyConfig {
            enabled: true,
            url: "socks5h://127.0.0.1:10808".into(),
            all_traffic: false,
            extra_hosts: vec![],
        };
        // The media CDNs matter as much as the API hosts: without them search
        // works and playback is silent.
        assert!(should_proxy(&cfg, "rr4---sn-f5f7knee.googlevideo.com"));
        assert!(should_proxy(&cfg, "cf-media.sndcdn.com"));
        assert!(should_proxy(&cfg, "music.youtube.com"));
        // Unrelated hosts stay direct.
        assert!(!should_proxy(&cfg, "xyz.supabase.co"));
        assert!(!should_proxy(&cfg, "example.com"));
    }

    #[test]
    fn bare_address_gets_a_scheme() {
        assert_eq!(normalise("127.0.0.1:10808").unwrap(), "socks5h://127.0.0.1:10808");
        assert_eq!(normalise(" socks5://1.2.3.4:1080 ").unwrap(), "socks5://1.2.3.4:1080");
    }

    /// The whole point of the error message: these links are the thing users
    /// will actually paste, and they cannot work directly.
    #[test]
    fn tunnel_links_are_rejected_with_guidance() {
        for link in [
            "vless://uuid@host:443?type=ws",
            "vmess://eyJhZGQiOiJ4In0=",
            "ss://YWVzOjEyMw==@host:8388",
            "hysteria2://pass@host:443",
            "trojan://pass@host:443",
        ] {
            let err = normalise(link).unwrap_err();
            assert!(
                err.contains("import them into a client"),
                "{link} should explain the client step, got: {err}"
            );
        }
    }

    /// End-to-end: with the switch on, a blocked host must be handed to the
    /// SOCKS server and a direct host must not. Anything less and "selective
    /// routing" is just a comment.
    ///
    /// Ignored by default because it needs the helper SOCKS server on 18080:
    ///   node /tmp/socks5.mjs &
    ///   cargo test proxy_routes_live -- --ignored --nocapture
    #[test]
    #[ignore]
    fn proxy_routes_live() {
        let cfg = ProxyConfig {
            enabled: true,
            url: "socks5h://127.0.0.1:18080".into(),
            all_traffic: false,
            extra_hosts: vec![],
        };
        if let Ok(mut g) = CONFIG.write() {
            *g = Some(cfg);
        }

        let client = crate::api::client().expect("client");
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        rt.block_on(async {
            // Blocked -> must go through SOCKS. The stub kills the connection
            // after the handshake, so an error here is expected and fine; what
            // matters is that the request reached the SOCKS server at all.
            let _ = client.get("https://music.youtube.com/").send().await;
            let _ = client.get("https://cf-media.sndcdn.com/x").send().await;
            // Never-list -> must stay direct, so the stub must not see it.
            let _ = client.get("https://api.music.yandex.net/").send().await;
        });
        println!("requests issued; inspect the SOCKS server log");
    }

    /// Proves the Test button reports the truth: with default-features off,
    /// a builder without an explicit TLS backend fails every https request,
    /// so the probe used to answer "not working" for a perfectly good tunnel.
    ///
    ///   node -e "<real socks5 on 18081>" &
    ///   cargo test probe_through_real_socks -- --ignored --nocapture
    #[test]
    #[ignore]
    fn probe_through_real_socks() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let ok = rt.block_on(probe("socks5h://127.0.0.1:18081"));
        println!("probe result: {ok:?}");
        assert!(matches!(ok, Ok(true)), "probe should succeed through a working SOCKS5");
    }
}
