//! MPRIS — the Linux counterpart of the Windows taskbar/SMTC integration in
//! `taskbar.rs`.
//!
//! WebKitGTK has no `navigator.mediaSession`, so before this module the entire
//! media-control path on Linux was dead: `initMediaSession()` in app.js returns
//! early on `!('mediaSession' in navigator)`, and nothing else registered the
//! player anywhere. Media keys did nothing, the desktop's media widget had no
//! player to show, and `playerctl` reported "no players found". On Windows the
//! thumbnail toolbar and SMTC cover this; on Linux MPRIS is the only interface
//! those things speak, so there was no fallback.
//!
//! Two things are kept out of the interface on purpose:
//!
//! * Playback state is never inferred from the audio element. The page owns it,
//!   and every control arriving over the bus is forwarded to the page as a
//!   `meowave://media-action` event — the same contract `taskbar.rs` already
//!   uses, so there is one control path on every platform and not two.
//! * `Position` is answered from a base value plus the instant it was taken, so
//!   the page reports the clock only when it jumps (a seek, a new track)
//!   instead of several times a second. MPRIS clients poll this property;
//!   emitting it on a timer would wake the lock screen continuously for no
//!   benefit.

/// What the page reports about the current track.
#[derive(serde::Deserialize)]
pub struct NowPlaying {
    playing: bool,
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    artist: String,
    #[serde(default)]
    album: String,
    #[serde(default)]
    dur: f64,
    /// Where the page says playback is right now, in seconds.
    #[serde(default)]
    pos: f64,
    #[serde(default)]
    art: String,
    #[serde(default)]
    shuffle: bool,
    #[serde(default)]
    repeat: bool,
    #[serde(default = "one")]
    rate: f64,
    #[serde(default = "one")]
    volume: f64,
}

fn one() -> f64 {
    1.0
}

#[tauri::command]
pub fn mpris_update(now: NowPlaying) {
    #[cfg(target_os = "linux")]
    linux::update(now);
    #[cfg(not(target_os = "linux"))]
    let _ = now;
}

/// Starts the bus name. Failure is logged, never fatal: a machine without a
/// session bus (a container, a bare TTY, an SSH session) should still get a
/// working player, just without desktop media controls.
pub fn spawn(app: tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    linux::spawn(app);
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}

#[cfg(target_os = "linux")]
mod linux {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::Instant;

    use tauri::{AppHandle, Emitter, Manager};
    use zbus::blocking::Connection;
    use zbus::interface;
    use zbus::zvariant::{ObjectPath, OwnedValue, Str, Value};

    use super::NowPlaying;

    const BUS_NAME: &str = "org.mpris.MediaPlayer2.meowave";
    const OBJECT_PATH: &str = "/org/mpris/MediaPlayer2";
    const PLAYER_IFACE: &str = "org.mpris.MediaPlayer2.Player";
    const PROPERTIES_IFACE: &str = "org.freedesktop.DBus.Properties";
    /// The spec's sentinel for "nothing loaded". Clients use it to tell an idle
    /// player from one that is merely paused.
    const NO_TRACK: &str = "/org/mpris/MediaPlayer2/TrackList/NoTrack";
    /// Must match the bundled `.desktop` file's basename, or desktops cannot
    /// pair the player with its launcher icon. The bundler names that file
    /// after `productName` in tauri.conf.json, which the test below keeps this
    /// in step with.
    const DESKTOP_ENTRY: &str = "Meowave";

    /// `OwnedValue` has no `From<&str>`; `Str` is the shape it does take.
    fn text(v: &str) -> OwnedValue {
        OwnedValue::from(Str::from(v))
    }

    /// Absolute seek, or an offset from wherever the page currently is. Sent as
    /// an offset when MPRIS gave us one, because the page's own clock is the
    /// only accurate one — ours is extrapolated and would be off by the round
    /// trip.
    #[derive(serde::Serialize, Clone, Copy, Debug, PartialEq)]
    pub struct SeekTarget {
        #[serde(skip_serializing_if = "Option::is_none")]
        abs: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        rel: Option<f64>,
    }

    /// Everything the service has to hand back to the rest of the app.
    #[derive(Debug, Clone, PartialEq)]
    pub enum Out {
        Action(&'static str),
        Seek(SeekTarget),
        Volume(f64),
        Raise,
    }

    /// Where `Out` goes. A callback rather than a captured `AppHandle`, so the
    /// interface can be driven over a real bus in tests with no Tauri app in
    /// the picture.
    pub type Sink = Arc<dyn Fn(Out) + Send + Sync>;

    /// What the page last reported, plus the moment it said so.
    struct State {
        playing: bool,
        /// The page's own track id, compared only to notice a change of track.
        id: String,
        title: String,
        artist: String,
        album: String,
        dur: f64,
        pos_base: f64,
        pos_at: Option<Instant>,
        art: String,
        shuffle: bool,
        repeat: bool,
        rate: f64,
        volume: f64,
        /// Bumped whenever the track identity changes, so `mpris:trackid`
        /// differs between two songs that happen to share a title. A client
        /// that sees an unchanged id treats the update as "same track, new
        /// metadata" and does not re-announce it.
        seq: u64,
    }

    impl Default for State {
        fn default() -> Self {
            Self {
                playing: false,
                id: String::new(),
                title: String::new(),
                artist: String::new(),
                album: String::new(),
                dur: 0.0,
                pos_base: 0.0,
                pos_at: None,
                art: String::new(),
                shuffle: false,
                repeat: false,
                rate: 1.0,
                volume: 1.0,
                seq: 0,
            }
        }
    }

    impl State {
        fn position_us(&self) -> i64 {
            let mut secs = self.pos_base;
            if self.playing {
                if let Some(t) = self.pos_at {
                    secs += t.elapsed().as_secs_f64();
                }
            }
            if self.dur > 0.0 {
                secs = secs.min(self.dur);
            }
            (secs.max(0.0) * 1_000_000.0).round() as i64
        }

        fn playback_status_str(&self) -> &'static str {
            if self.title.is_empty() {
                "Stopped"
            } else if self.playing {
                "Playing"
            } else {
                "Paused"
            }
        }

        fn loop_status_str(&self) -> &'static str {
            if self.repeat {
                "Playlist"
            } else {
                "None"
            }
        }

        fn track_id(&self) -> ObjectPath<'static> {
            if self.title.is_empty() {
                return ObjectPath::from_static_str_unchecked(NO_TRACK);
            }
            ObjectPath::try_from(format!("/org/mpris/MediaPlayer2/Track/{}", self.seq))
                .unwrap_or_else(|_| ObjectPath::from_static_str_unchecked(NO_TRACK))
        }

        fn metadata(&self) -> HashMap<String, OwnedValue> {
            let mut m: HashMap<String, OwnedValue> = HashMap::new();
            m.insert("mpris:trackid".into(), OwnedValue::from(self.track_id()));
            m.insert("xesam:title".into(), text(&self.title));
            if !self.album.is_empty() {
                m.insert("xesam:album".into(), text(&self.album));
            }
            if !self.art.is_empty() {
                m.insert("mpris:artUrl".into(), text(&self.art));
            }
            // `xesam:artist` is `as`, an array, and arrays are the one shape
            // here without an infallible conversion. Dropping the key on the
            // impossible failure beats panicking inside a property getter,
            // which would take the whole bus name down.
            if let Ok(v) = Value::from(vec![self.artist.clone()]).try_to_owned() {
                m.insert("xesam:artist".into(), v);
            }
            if self.dur > 0.0 {
                m.insert(
                    "mpris:length".into(),
                    OwnedValue::from((self.dur * 1_000_000.0).round() as i64),
                );
            }
            m
        }
    }

    /// The live connection, kept so `update` can emit `PropertiesChanged`.
    /// Empty when the session bus was not reachable — every reader treats that
    /// as "MPRIS is off", not as an error.
    static CONN: OnceLock<Connection> = OnceLock::new();

    /// The state `update` writes into. Kept beside `CONN` rather than inside the
    /// interface because the interface is owned by the object server and cannot
    /// be reached without a round trip through it.
    static STATE: OnceLock<Arc<Mutex<State>>> = OnceLock::new();

    /// The two MPRIS interfaces need two types: zbus implements its `Interface`
    /// trait once per type, so a single struct cannot carry both. They sit at
    /// the same object path and share the same state.
    struct Root {
        out: Sink,
    }

    struct Player {
        out: Sink,
        state: Arc<Mutex<State>>,
    }

    impl Root {
        fn emit(&self, o: Out) {
            (self.out)(o);
        }
    }

    impl Player {
        fn emit(&self, o: Out) {
            (self.out)(o);
        }

        fn lock(&self) -> std::sync::MutexGuard<'_, State> {
            self.state.lock().unwrap_or_else(|e| e.into_inner())
        }
    }

    #[interface(name = "org.mpris.MediaPlayer2")]
    impl Root {
        #[zbus(property)]
        fn identity(&self) -> String {
            "Meowave".to_string()
        }

        #[zbus(property)]
        fn desktop_entry(&self) -> String {
            DESKTOP_ENTRY.to_string()
        }

        /// Quitting would drop the user's queue with no way back, and MPRIS
        /// gives no confirmation step, so the method is not offered.
        #[zbus(property)]
        fn can_quit(&self) -> bool {
            false
        }

        #[zbus(property)]
        fn can_raise(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn has_track_list(&self) -> bool {
            false
        }

        #[zbus(property)]
        fn supported_uri_schemes(&self) -> Vec<String> {
            Vec::new()
        }

        #[zbus(property)]
        fn supported_mime_types(&self) -> Vec<String> {
            [
                "audio/mpeg",
                "audio/mp4",
                "audio/ogg",
                "audio/opus",
                "audio/flac",
                "audio/wav",
                "audio/webm",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect()
        }

        fn raise(&self) {
            self.emit(Out::Raise);
        }
    }

    #[interface(name = "org.mpris.MediaPlayer2.Player")]
    impl Player {
        #[zbus(property)]
        fn playback_status(&self) -> String {
            self.lock().playback_status_str().to_string()
        }

        #[zbus(property)]
        fn loop_status(&self) -> String {
            self.lock().loop_status_str().to_string()
        }

        #[zbus(property)]
        fn shuffle(&self) -> bool {
            self.lock().shuffle
        }

        /// The app's slowed/nightcore control, reported as-is. Not writable:
        /// MPRIS `Rate` is a fast-forward control, and letting a client write it
        /// would silently change the user's pitch-shift setting.
        #[zbus(property)]
        fn rate(&self) -> f64 {
            self.lock().rate
        }

        #[zbus(property)]
        fn minimum_rate(&self) -> f64 {
            0.5
        }

        #[zbus(property)]
        fn maximum_rate(&self) -> f64 {
            2.0
        }

        #[zbus(property)]
        fn metadata(&self) -> HashMap<String, OwnedValue> {
            self.lock().metadata()
        }

        #[zbus(property)]
        fn volume(&self) -> f64 {
            self.lock().volume
        }

        #[zbus(property)]
        fn set_volume(&self, v: f64) {
            let v = v.clamp(0.0, 1.0);
            self.lock().volume = v;
            self.emit(Out::Volume(v));
        }

        /// Polled by clients, never signalled. `emits_changed_signal = "false"`
        /// says so in the introspection data, which is the spec's own advice for
        /// this property — and unlike the others it is genuinely never
        /// signalled, so a client that trusts the annotation is not misled.
        #[zbus(property(emits_changed_signal = "false"))]
        fn position(&self) -> i64 {
            self.lock().position_us()
        }

        #[zbus(property)]
        fn can_control(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_play(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_pause(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_go_next(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_go_previous(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_seek(&self) -> bool {
            true
        }

        fn play(&self) {
            self.emit(Out::Action("play"));
        }

        fn pause(&self) {
            self.emit(Out::Action("pause"));
        }

        fn play_pause(&self) {
            self.emit(Out::Action("play_pause"));
        }

        fn stop(&self) {
            self.emit(Out::Action("stop"));
        }

        fn next(&self) {
            self.emit(Out::Action("next"));
        }

        fn previous(&self) {
            self.emit(Out::Action("prev"));
        }

        /// Relative seek, in microseconds. Forwarded as an offset so the page
        /// applies it to its own clock rather than to ours.
        fn seek(&self, offset: i64) {
            self.emit(Out::Seek(SeekTarget {
                abs: None,
                rel: Some(offset as f64 / 1_000_000.0),
            }));
        }

        /// Absolute seek. `SetPosition` on the wire — the macro derives that
        /// from the name, and it is a method, not a setter for `Position`.
        ///
        /// The track id has to be checked: a client that had the previous track
        /// loaded will happily ask us to jump inside it after the user has
        /// already moved on, and honouring that yanks the new song.
        fn set_position(&self, track_id: ObjectPath<'_>, position: i64) {
            if track_id.as_str() != self.lock().track_id().as_str() {
                return;
            }
            self.emit(Out::Seek(SeekTarget {
                abs: Some(position as f64 / 1_000_000.0),
                rel: None,
            }));
        }
    }

    /// Registers both interfaces and takes the bus name. Split out of `spawn` so
    /// the tests can drive exactly the object the app registers, over a real
    /// bus, without a webview.
    fn serve(out: Sink) -> zbus::Result<Connection> {
        let state = Arc::new(Mutex::new(State::default()));
        let _ = STATE.set(state.clone());
        let conn = zbus::blocking::connection::Builder::session()?
            .name(BUS_NAME)?
            .serve_at(OBJECT_PATH, Root { out: out.clone() })?
            .serve_at(OBJECT_PATH, Player { out, state })?
            .build()?;
        let _ = CONN.set(conn.clone());
        Ok(conn)
    }

    pub fn spawn(app: AppHandle) {
        let out: Sink = Arc::new(move |o| match o {
            Out::Action(a) => {
                let _ = app.emit("meowave://media-action", a);
            }
            Out::Seek(t) => {
                let _ = app.emit("meowave://media-seek", t);
            }
            Out::Volume(v) => {
                let _ = app.emit("meowave://media-volume", v);
            }
            Out::Raise => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        });

        std::thread::spawn(move || match serve(out) {
            Ok(_conn) => {
                // The connection owns the registered objects; dropping it takes
                // the bus name with it. The service itself runs on zbus's own
                // executor thread, so this one only has to stay alive.
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(3600));
                }
            }
            Err(e) => {
                eprintln!("meowave: MPRIS unavailable, desktop media controls are off: {e}");
            }
        });
    }

    /// Called by the page whenever the current track or transport state
    /// changes.
    ///
    /// Emits `PropertiesChanged` only for fields that actually differ. The page
    /// reports on a timer, and a player that signals the bus once a second
    /// while paused keeps the lock screen awake for nothing.
    pub fn update(now: NowPlaying) {
        let Some(conn) = CONN.get() else {
            return;
        };

        let changed: HashMap<String, OwnedValue> = {
            let Some(shared) = STATE.get() else {
                return;
            };
            let mut st = shared.lock().unwrap_or_else(|e| e.into_inner());

            let mut names: Vec<&'static str> = Vec::new();
            if st.playing != now.playing {
                st.playing = now.playing;
                names.push("PlaybackStatus");
            }
            if st.shuffle != now.shuffle {
                st.shuffle = now.shuffle;
                names.push("Shuffle");
            }
            if st.repeat != now.repeat {
                st.repeat = now.repeat;
                names.push("LoopStatus");
            }
            if (st.rate - now.rate).abs() > 1e-3 {
                st.rate = now.rate;
                names.push("Rate");
            }
            if (st.volume - now.volume).abs() > 1e-3 {
                st.volume = now.volume;
                names.push("Volume");
            }

            let same_track = !now.id.is_empty() && st.id == now.id;
            if !same_track {
                st.seq += 1;
            }
            if !same_track
                || st.title != now.title
                || st.artist != now.artist
                || st.album != now.album
                || st.art != now.art
                || (st.dur - now.dur).abs() > 0.5
            {
                st.title = now.title.clone();
                st.artist = now.artist.clone();
                st.album = now.album.clone();
                st.art = now.art.clone();
                st.dur = now.dur;
                names.push("Metadata");
            }
            st.id = now.id.clone();

            // A position that moved on its own (a seek) has to re-anchor, or the
            // extrapolation would keep counting from the old base. Small
            // differences are just the page's timer and the extrapolation
            // drifting apart, and re-anchoring on those would make the reported
            // position jump backwards every second.
            if (st.position_us() as f64 / 1_000_000.0 - now.pos).abs() > 1.5 {
                st.pos_base = now.pos;
                st.pos_at = Some(Instant::now());
            }

            // Read the values back out of the state we just wrote rather than
            // out of `now`: the two differ wherever a field was clamped or left
            // alone, and the signal has to describe what the property getters
            // will actually answer.
            let mut props: HashMap<String, OwnedValue> = HashMap::new();
            for name in names {
                let v = match name {
                    "PlaybackStatus" => text(st.playback_status_str()),
                    "Shuffle" => OwnedValue::from(st.shuffle),
                    "LoopStatus" => text(st.loop_status_str()),
                    "Rate" => OwnedValue::from(st.rate),
                    "Volume" => OwnedValue::from(st.volume),
                    "Metadata" => OwnedValue::from(st.metadata()),
                    _ => continue,
                };
                props.insert(name.to_string(), v);
            }
            props
        };

        if changed.is_empty() {
            return;
        }
        // Emitted by hand rather than through the macro's per-property
        // `*_changed` helpers: those are async, and this side of the app is a
        // plain thread. The body is the spec's `sa{sv}as`, and an empty
        // invalidated list is correct — every property here carries its new
        // value, so there is nothing for a client to re-read.
        let body = (PLAYER_IFACE, changed, Vec::<String>::new());
        if let Err(e) = conn.emit_signal(
            None::<&str>,
            OBJECT_PATH,
            PROPERTIES_IFACE,
            "PropertiesChanged",
            &body,
        ) {
            eprintln!("meowave: MPRIS could not announce a change: {e}");
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::mpsc;
        use std::time::Duration;

        fn state_with(title: &str, playing: bool, base: f64, dur: f64) -> State {
            State {
                title: title.to_string(),
                playing,
                pos_base: base,
                pos_at: Some(Instant::now()),
                dur,
                ..State::default()
            }
        }

        #[test]
        fn idle_player_reports_the_no_track_sentinel() {
            let st = State::default();
            assert_eq!(st.track_id().as_str(), NO_TRACK);
            assert_eq!(
                st.metadata()["mpris:trackid"],
                OwnedValue::from(ObjectPath::from_static_str_unchecked(NO_TRACK)),
                "an idle player must announce the spec's NoTrack sentinel"
            );
        }

        #[test]
        fn a_loaded_track_gets_a_distinct_id() {
            let a = state_with("One", true, 0.0, 100.0);
            let mut b = state_with("One", true, 0.0, 100.0);
            b.seq = 1;
            assert_ne!(
                a.track_id().as_str(),
                b.track_id().as_str(),
                "two tracks sharing a title must still be distinguishable"
            );
        }

        #[test]
        fn position_extrapolates_only_while_playing() {
            let mut st = state_with("T", true, 10.0, 100.0);
            st.pos_at = Some(Instant::now() - Duration::from_millis(500));
            let played = st.position_us();
            assert!(
                (10_400_000..11_000_000).contains(&played),
                "expected ~10.5s, got {played}"
            );

            st.playing = false;
            st.pos_at = Some(Instant::now() - Duration::from_secs(30));
            assert_eq!(
                st.position_us(),
                10_000_000,
                "a paused player must not keep counting"
            );
        }

        #[test]
        fn position_never_passes_the_end() {
            let mut st = state_with("T", true, 99.0, 100.0);
            st.pos_at = Some(Instant::now() - Duration::from_secs(30));
            assert_eq!(st.position_us(), 100_000_000);
        }

        #[test]
        fn length_is_reported_in_microseconds() {
            let st = state_with("T", false, 0.0, 213.5);
            assert_eq!(
                st.metadata()["mpris:length"],
                OwnedValue::from(213_500_000i64),
                "MPRIS wants microseconds, not seconds"
            );
        }

        #[test]
        fn an_unknown_duration_omits_length_instead_of_claiming_zero() {
            // A live stream has no length, and clients draw a full progress bar
            // for a zero. Absent is the honest answer.
            let st = state_with("T", true, 0.0, 0.0);
            assert!(!st.metadata().contains_key("mpris:length"));
        }

        /// `DesktopEntry` has to name the `.desktop` file that is actually
        /// installed, and the bundler names that after `productName`. Renaming
        /// the app would otherwise cost the icon in every media widget, with
        /// nothing in the source to show for it.
        #[test]
        fn desktop_entry_follows_the_bundled_desktop_file() {
            let conf: serde_json::Value =
                serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
            assert_eq!(
                DESKTOP_ENTRY,
                conf["productName"].as_str().expect("productName"),
                "MPRIS DesktopEntry must be productName, minus the .desktop"
            );
        }

        #[test]
        fn art_is_only_advertised_when_there_is_one() {
            let mut st = state_with("T", true, 0.0, 100.0);
            assert!(!st.metadata().contains_key("mpris:artUrl"));
            st.art = "https://cdn.example/cover.jpg".to_string();
            assert_eq!(
                st.metadata()["mpris:artUrl"],
                text("https://cdn.example/cover.jpg")
            );
        }

        fn track(id: &str, title: &str, playing: bool) -> NowPlaying {
            NowPlaying {
                playing,
                id: id.to_string(),
                title: title.to_string(),
                artist: "Someone".to_string(),
                album: "Somewhere".to_string(),
                dur: 180.0,
                pos: 0.0,
                art: String::new(),
                shuffle: false,
                repeat: false,
                rate: 1.0,
                volume: 1.0,
            }
        }

        /// Reads a property the way a desktop widget would: through
        /// `org.freedesktop.DBus.Properties.Get` on the player interface.
        fn get<T>(conn: &Connection, prop: &str) -> T
        where
            T: TryFrom<OwnedValue>,
            <T as TryFrom<OwnedValue>>::Error: Into<zbus::Error>,
        {
            zbus::blocking::Proxy::new(conn, BUS_NAME, OBJECT_PATH, PLAYER_IFACE)
                .expect("player proxy")
                .get_property(prop)
                .unwrap_or_else(|e| panic!("reading {prop}: {e}"))
        }

        /// Drives the real service over the real session bus: registration,
        /// property reads, method dispatch, the stale-track-id guard, and the
        /// `PropertiesChanged` signal. The bus is the only thing that can prove
        /// any of it — a signature that is wrong in the introspection data, or
        /// a property the macro silently renamed, looks fine in source and
        /// fails only against a client.
        ///
        /// Skipped, loudly, where there is no session bus (a bare CI runner).
        #[test]
        fn the_service_works_over_a_session_bus() {
            let (tx, rx) = mpsc::channel::<Out>();
            let conn = match serve(Arc::new(move |o| {
                let _ = tx.send(o);
            })) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("SKIPPED the_service_works_over_a_session_bus: no session bus ({e})");
                    return;
                }
            };

            // Registered under the name MPRIS clients look for, with both
            // interfaces on the spec's object path.
            let props =
                zbus::blocking::Proxy::new(&conn, BUS_NAME, OBJECT_PATH, PROPERTIES_IFACE).unwrap();
            let introspect: String = {
                let reply = conn
                    .call_method(
                        Some(BUS_NAME),
                        OBJECT_PATH,
                        Some("org.freedesktop.DBus.Introspectable"),
                        "Introspect",
                        &(),
                    )
                    .expect("Introspect");
                reply.body().deserialize().expect("xml")
            };
            assert!(introspect.contains("org.mpris.MediaPlayer2.Player"));
            assert!(introspect.contains("org.mpris.MediaPlayer2\""));
            assert!(introspect.contains("SetPosition"));

            // Nothing loaded: the spec's Stopped + NoTrack.
            let status: String = get::<String>(&conn, "PlaybackStatus");
            assert_eq!(status, "Stopped");

            // Subscribe before the change so the signal cannot be missed.
            let mut signals = props.receive_signal("PropertiesChanged").unwrap();
            std::thread::spawn(|| {
                std::thread::sleep(Duration::from_millis(150));
                update(track("t1", "One More Time", true));
            });

            let msg = signals.next().expect("a PropertiesChanged arrived");
            let (iface, changed, invalidated): (
                String,
                HashMap<String, OwnedValue>,
                Vec<String>,
            ) = msg.body().deserialize().expect("sa{sv}as");
            assert_eq!(iface, PLAYER_IFACE);
            assert!(invalidated.is_empty(), "values are inlined, not invalidated");
            assert!(changed.contains_key("PlaybackStatus"));
            assert!(changed.contains_key("Metadata"));

            // The values a client would then read back.
            let status: String = get::<String>(&conn, "PlaybackStatus");
            assert_eq!(status, "Playing");
            let md: HashMap<String, OwnedValue> = get::<HashMap<String, OwnedValue>>(&conn, "Metadata");
            assert_eq!(md["xesam:title"], text("One More Time"));
            assert_eq!(
                md["xesam:artist"],
                Value::from(vec!["Someone".to_string()]).try_to_owned().unwrap()
            );
            assert_eq!(md["mpris:length"], OwnedValue::from(180_000_000i64));

            // Media keys land on the page's existing action contract.
            for (method, want) in [
                ("Next", Out::Action("next")),
                ("Previous", Out::Action("prev")),
                ("PlayPause", Out::Action("play_pause")),
            ] {
                conn.call_method(Some(BUS_NAME), OBJECT_PATH, Some(PLAYER_IFACE), method, &())
                    .unwrap_or_else(|e| panic!("{method}: {e}"));
                assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap(), want);
            }

            // A seek inside the track that is actually loaded goes through.
            let current = get::<HashMap<String, OwnedValue>>(&conn, "Metadata")["mpris:trackid"].clone();
            let current: ObjectPath = current.try_into().unwrap();
            conn.call_method(
                Some(BUS_NAME),
                OBJECT_PATH,
                Some(PLAYER_IFACE),
                "SetPosition",
                &(&current, 42_000_000i64),
            )
            .unwrap();
            assert_eq!(
                rx.recv_timeout(Duration::from_secs(2)).unwrap(),
                Out::Seek(SeekTarget {
                    abs: Some(42.0),
                    rel: None
                })
            );

            // A seek against a track the client still thinks is loaded is
            // dropped, or it would yank whatever is playing now.
            let stale = ObjectPath::try_from("/org/mpris/MediaPlayer2/Track/9999").unwrap();
            conn.call_method(
                Some(BUS_NAME),
                OBJECT_PATH,
                Some(PLAYER_IFACE),
                "SetPosition",
                &(&stale, 10_000_000i64),
            )
            .unwrap();
            assert!(
                rx.recv_timeout(Duration::from_millis(300)).is_err(),
                "a stale track id must not move playback"
            );

            // Relative seek reaches the app as an offset, not as a position.
            conn.call_method(
                Some(BUS_NAME),
                OBJECT_PATH,
                Some(PLAYER_IFACE),
                "Seek",
                &(-5_000_000i64),
            )
            .unwrap();
            assert_eq!(
                rx.recv_timeout(Duration::from_secs(2)).unwrap(),
                Out::Seek(SeekTarget {
                    abs: None,
                    rel: Some(-5.0)
                })
            );

            // The volume slider a desktop widget draws is wired to the app's
            // own volume, and out-of-range values are clamped rather than
            // rejected. `set_property` reads and writes through the proxy's own
            // interface, so this one has to be the player.
            //
            // The proxy is used for writing only. zbus creates a client-side
            // property cache on the first read and refreshes it from
            // `PropertiesChanged` on a task of its own, so reading the same
            // proxy straight back after a write races that task and can still
            // return the previous value. `get` builds a fresh proxy, which is
            // also what proves the service rather than zbus's cache.
            let player = zbus::blocking::Proxy::new(&conn, BUS_NAME, OBJECT_PATH, PLAYER_IFACE)
                .unwrap();
            player.set_property("Volume", 0.25f64).unwrap();
            assert_eq!(
                rx.recv_timeout(Duration::from_secs(2)).unwrap(),
                Out::Volume(0.25)
            );
            assert_eq!(get::<f64>(&conn, "Volume"), 0.25);
            player.set_property("Volume", 4.0f64).unwrap();
            assert_eq!(
                rx.recv_timeout(Duration::from_secs(2)).unwrap(),
                Out::Volume(1.0),
                "MPRIS volume is 0..1 and a client asking for more must not escape it"
            );
            assert_eq!(get::<f64>(&conn, "Volume"), 1.0);
        }
    }
}
