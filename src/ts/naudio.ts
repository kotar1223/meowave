/* The native audio engine's stand-in for <audio> (was src/naudio.js; moved
   to TypeScript in step 2 of the stack rewrite, behaviour unchanged).

   The Rust engine (src-tauri/src/audio) reads the stream ahead into memory,
   decodes it, runs the equaliser, levelling, 3D and reverb, and plays to the
   output device itself — so a busy page, a slow webview media stack or a
   starved Web Audio thread can no longer turn into crackles and dropouts.
   app.js was written against an HTMLMediaElement; this object has the same
   surface (src, load, play, pause, currentTime, duration, paused, ended,
   readyState, networkState, error, buffered, the same events), so the player
   logic did not fork. Events carry the engine's own generation number, and a
   message about a previous track is dropped. */

/** What the engine sends on the channel (src-tauri/src/audio/engine.rs). */
export type EngineMessage =
  | { k: "t"; g: number; st: string; p?: number; d?: number; b?: number; lv?: number; sp?: string; u?: number }
  | { k: "meta"; g: number; d?: number; codec?: string; sr?: number }
  | { k: "playing"; g: number }
  | { k: "waiting"; g: number }
  | { k: "seeked"; g: number; t?: number }
  | { k: "ended"; g: number }
  | { k: "error"; g: number; kind: string; msg?: string }
  | { k: "dev"; name: string; sr: number; ch: number; fmt: string }
  | { k: "devlost"; msg?: string };

export interface OutputDevice {
  name: string;
  sr: number;
  ch: number;
  fmt: string;
}

/** Settings for the chain (see audio_set): pre, eq, vol, norm/normTau, fade,
    boost, lim, sp, rv, rate, viz. */
export type ChainSettings = Record<string, unknown>;

const core = (): TauriCore | undefined => window.__TAURI__?.core;
const call = <T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const c = core();
  return c ? c.invoke<T>(cmd, args) : Promise.reject(new Error("no tauri"));
};

/* One queue for every command: each is sent once the previous one has been
   handled, so "fade to silence, then fade in" or "open, then play" cannot
   arrive the other way round. They are tiny, synchronous commands — the
   queue adds well under a millisecond. */
let queue: Promise<unknown> = Promise.resolve();
const send = (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
  const p = queue.then(() => call(cmd, args));
  /* A call that never answers must not hold up everything after it. */
  queue = Promise.race([p, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  return p;
};
const now = () => performance.now();

/* Track generations (echoed back by the engine) and the order of play / pause
   / open: IPC calls may overtake one another, the engine drops stale ones. */
let SEQ = 0;
let OP = 0;

class Ranges {
  private readonly _e: number;
  constructor(end: number) { this._e = end > 0 ? end : 0; }
  get length(): number { return this._e > 0 ? 1 : 0; }
  start(): number { return 0; }
  end(): number { return this._e; }
}

interface MediaErrorLike {
  /** MEDIA_ERR_NETWORK = 2, MEDIA_ERR_DECODE = 3 */
  code: number;
  message: string;
  kind: string;
}

export class NativeAudio extends EventTarget {
  isNative = true;
  id = "meowave-native-audio";
  _src = "";
  _cur = "";
  _gen = 0;
  _dirty = false;
  /* Position as last reported and when: between reports it is extrapolated
     while playing, so lyrics and the progress bar move smoothly. */
  _pos = 0;
  _at = 0;
  _dur = NaN;
  _st = "pause";
  _buf = 0;
  _paused = true;
  _ended = false;
  _seeking = false;
  _seekT = 0;
  _rs = 0;
  _ns = 0;
  _err: MediaErrorLike | null = null;
  _rate = 1;
  defaultPlaybackRate = 1;
  _tu = 0;
  _opening = 0;
  _openAt = 0;
  /** Set before load() to open the file at that second (resuming mid-track). */
  startAt = 0;
  /** Ramp of the next play(): a fade-in, or the 12 ms that only avoids a click. */
  fadeIn = 0.012;
  volume = 1;
  muted = false;
  preservesPitch = false;
  autoplay = false;
  preload = "auto";
  crossOrigin: string | null = null;
  /* Loudness of the equaliser output (dB, for levelling), the spectrum for
     the visuals, the output device. */
  lv = -120;
  spec = new Uint8Array(256);
  _specAt = 0;
  dev: OutputDevice | null = null;
  codec = "";
  sr = 0;
  underruns = 0;
  /** An AnalyserNode look-alike over the engine's spectrum. */
  an = {
    fftSize: 512,
    frequencyBinCount: 256,
    smoothingTimeConstant: 0.84,
    getByteFrequencyData: (a: Uint8Array) => this._spectrum(a),
    getFloatTimeDomainData: (a: Float32Array) => { a.fill(0); },
    connect() {},
    disconnect() {},
  };

  _fire(type: string, detail?: unknown): void {
    this.dispatchEvent(detail === undefined ? new Event(type) : new CustomEvent(type, { detail }));
  }

  get src(): string { return this._src; }
  set src(v: string | null | undefined) {
    this._src = v ? String(v) : "";
    /* An element starts loading by itself once src is set; app.js calls
       load() right away, and this only covers the case where it does not. */
    if (!this._dirty) {
      this._dirty = true;
      queueMicrotask(() => { if (this._dirty) this.load(); });
    }
  }
  get currentSrc(): string { return this._cur; }
  getAttribute(n: string): string | null { return n === "src" ? this._src || null : null; }
  setAttribute(n: string, v: string): void { if (n === "src") this.src = v; }
  removeAttribute(n: string): void { if (n === "src") this.src = ""; }
  hasAttribute(n: string): boolean { return n === "src" && !!this._src; }
  canPlayType(): string { return ""; }

  load(): void {
    this._dirty = false;
    const g = (this._gen = ++SEQ);
    this._cur = this._src;
    const at = Math.max(0, +this.startAt || 0);
    this.startAt = 0;
    this._pos = at; this._at = now(); this._dur = NaN; this._st = "pause"; this._buf = 0;
    this._ended = false; this._seeking = false; this._err = null; this._paused = true;
    this.codec = ""; this.sr = 0;
    if (!this._cur) {
      this._rs = 0; this._ns = 0; this._opening = 0;
      send("audio_stop").catch(() => {});
      this._fire("emptied");
      return;
    }
    this._rs = 0; this._ns = 2; this._opening = g; this._openAt = at;
    /* The open waits for the end of this task: a play() right after load()
       rides along in it instead of racing it. */
    queueMicrotask(() => {
      if (this._gen !== g || this._opening !== g) return;
      this._opening = 0;
      send("audio_open", { url: this._cur, gen: g, at: this._openAt, play: !this._paused, op: ++OP })
        .catch((e) => this._failed(g, "network", String(e)));
    });
    this._fire("loadstart");
  }

  play(): Promise<void> {
    if (this._dirty) this.load();
    if (!this._cur) {
      const e = new Error("No source");
      e.name = "NotSupportedError";
      return Promise.reject(e);
    }
    if (this._ended) { this._ended = false; this._seek(0); }
    const was = this._paused;
    this._paused = false;
    if (!this._opening) send("audio_play", { fade: this.fadeIn || 0.012, op: ++OP }).catch(() => {});
    this.fadeIn = 0.012;
    if (was) { this._at = now(); this._fire("play"); }
    return Promise.resolve();
  }

  pause(): void {
    if (this._paused) return;
    this._pos = this.currentTime; this._at = now(); this._paused = true;
    if (!this._opening) send("audio_pause", { fade: 0.012, op: ++OP }).catch(() => {});
    this._fire("pause");
  }

  get paused(): boolean { return this._paused; }
  get ended(): boolean { return this._ended; }
  get seeking(): boolean { return this._seeking; }
  get readyState(): number { return this._rs; }
  get networkState(): number { return this._ns; }
  get error(): MediaErrorLike | null { return this._err; }
  get duration(): number { return this._dur; }
  get buffered(): Ranges { return new Ranges(this._buf); }
  get seekable(): Ranges { return new Ranges(Number.isFinite(this._dur) ? this._dur : 0); }

  get currentTime(): number {
    if (this._paused || this._seeking || this._st !== "play") return this._pos;
    /* Never more than a third of a second past the last report: a stall the
       engine has not reported yet must not run the clock away. */
    let p = this._pos + Math.min(0.35, (now() - this._at) / 1000) * this._rate;
    if (Number.isFinite(this._dur)) p = Math.min(p, this._dur);
    return p;
  }
  set currentTime(v: number) { this._seek(+v || 0); }
  fastSeek(v: number): void { this._seek(+v || 0); }

  _seek(t: number): void {
    if (!this._cur) return;
    t = Math.max(0, t);
    if (Number.isFinite(this._dur)) t = Math.min(t, Math.max(0, this._dur - 0.05));
    this._ended = false; this._seeking = true; this._seekT = t; this._pos = t; this._at = now();
    this._fire("seeking");
    if (this._opening) {
      /* Not opened yet: it opens right there. */
      this._openAt = t;
      queueMicrotask(() => {
        if (this._seeking && this._seekT === t) { this._seeking = false; this._fire("seeked"); }
      });
      return;
    }
    send("audio_seek", { gen: this._gen, t }).catch(() => {});
  }

  get playbackRate(): number { return this._rate; }
  set playbackRate(r: number) {
    r = Math.max(0.25, Math.min(4, +r || 1));
    if (r === this._rate) return;
    this._pos = this.currentTime; this._at = now(); this._rate = r;
    send("audio_set", { p: { rate: r } }).catch(() => {});
    this._fire("ratechange");
  }

  _spectrum(a: Uint8Array): void {
    /* No fresh spectrum (paused, hidden, between reports): fall away the way
       an analyser's smoothing does, instead of freezing the last frame. */
    if (now() - this._specAt > 120) {
      const s = this.spec;
      for (let i = 0; i < s.length; i++) s[i] = (s[i]! * 0.86) | 0;
    }
    a.set(a.length >= this.spec.length ? this.spec : this.spec.subarray(0, a.length));
  }

  _failed(g: number, kind: string, msg?: string): void {
    if (g !== this._gen) return;
    if (kind === "unsupported") { this._ns = 3; this._fire("unsupported", { msg }); return; }
    this._err = { code: kind === "decode" ? 3 : 2, message: String(msg || kind), kind };
    this._ns = 3;
    this._fire("error");
  }

  _msg(m: EngineMessage | null | undefined): void {
    if (!m || typeof m !== "object") return;
    switch (m.k) {
      case "t": {
        if (Number.isFinite(m.lv)) this.lv = m.lv!;
        if (m.sp) {
          try {
            const b = atob(m.sp), s = this.spec, n = Math.min(b.length, s.length);
            for (let i = 0; i < n; i++) s[i] = b.charCodeAt(i);
            this._specAt = now();
          } catch { /* a malformed frame is just skipped */ }
        }
        if (Number.isFinite(m.u)) this.underruns = m.u!;
        if (m.g !== this._gen) return;
        this._buf = +(m.b ?? 0) || 0;
        if (!this._seeking && m.st !== "end" && Number.isFinite(m.p)) { this._pos = m.p!; this._at = now(); }
        this._st = m.st;
        if (Number.isFinite(m.d) && m.d! > 0 && Math.abs(m.d! - (this._dur || 0)) > 0.01) {
          this._dur = m.d!;
          this._fire("durationchange");
        }
        if (!this._paused && !this._seeking && m.st === "play" && now() - this._tu >= 240) {
          this._tu = now();
          this._fire("timeupdate");
        }
        return;
      }
      case "meta":
        if (m.g !== this._gen) return;
        this._dur = Number.isFinite(m.d) && m.d! > 0 ? m.d! : NaN;
        this.codec = m.codec || "";
        this.sr = m.sr || 0;
        this._rs = 4; this._ns = 1;
        for (const e of ["loadedmetadata", "durationchange", "loadeddata", "canplay", "canplaythrough"]) this._fire(e);
        return;
      case "playing":
        if (m.g !== this._gen) return;
        this._rs = 4;
        if (!this._paused) { this._st = "play"; this._at = now(); this._fire("playing"); }
        return;
      case "waiting":
        if (m.g !== this._gen) return;
        this._pos = this.currentTime; this._at = now(); this._st = "wait"; this._rs = 2;
        this._fire("waiting");
        return;
      case "seeked":
        if (m.g !== this._gen) return;
        if (!this._seeking || Math.abs((+(m.t ?? 0) || 0) - this._seekT) > 0.01) return;
        this._seeking = false; this._pos = +(m.t ?? 0) || 0; this._at = now();
        this._fire("seeked");
        this._fire("timeupdate");
        return;
      case "ended": {
        if (m.g !== this._gen) return;
        const was = !this._paused;
        this._ended = true; this._paused = true; this._st = "end";
        if (Number.isFinite(this._dur)) this._pos = this._dur;
        this._fire("timeupdate");
        if (was) this._fire("pause");
        this._fire("ended");
        return;
      }
      case "error":
        this._failed(m.g, m.kind, m.msg);
        return;
      case "dev":
        this.dev = { name: m.name, sr: m.sr, ch: m.ch, fmt: m.fmt };
        this._fire("devicechange", this.dev);
        return;
      case "devlost":
        this.dev = null;
        this._fire("devicelost", { msg: m.msg });
        return;
    }
  }

  /** One channel for the engine's whole lifetime. */
  subscribe(): Promise<unknown> {
    const C = core()?.Channel;
    if (!C) return Promise.reject(new Error("no IPC channel"));
    const ch = new C<EngineMessage>();
    ch.onmessage = (m) => {
      try { this._msg(m); } catch (e) { console.warn("[meowave] native audio:", e); }
    };
    return call("audio_subscribe", { channel: ch });
  }

  set(p: ChainSettings): Promise<unknown> { return send("audio_set", { p }).catch(() => {}); }

  preloadUrl(url: string): void { if (url) send("audio_preload", { url }).catch(() => {}); }
}

/* While the native engine plays, nothing plays in the page — and WebView2
   (Windows) and WKWebView (macOS) only hand the system media controls (the
   overlay, the media keys, Now Playing) to a page whose media is playing.
   This element plays silence while the engine plays, so navigator.mediaSession
   keeps working; it never reaches the speakers as anything but zeros. */
function silentWav(sec: number): string {
  const sr = 8000, n = sr * sec, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(b, 44).fill(128);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
const KEEP: { el: HTMLAudioElement | null; on: boolean } = { el: null, on: false };
export function keepAlive(on: boolean): void {
  if (!("mediaSession" in navigator)) return;
  if (on === KEEP.on) return;
  KEEP.on = on;
  if (!KEEP.el) {
    const a = (KEEP.el = document.createElement("audio"));
    a.id = "meowave-session-keepalive"; a.loop = true; a.preload = "auto"; a.style.display = "none";
    a.src = silentWav(20);
    document.body.appendChild(a);
  }
  if (on) KEEP.el.play().catch(() => {});
  else KEEP.el.pause();
}

declare global {
  interface Window {
    MWNative?: { NativeAudio: typeof NativeAudio; keepAlive: typeof keepAlive };
  }
}

/* Defined right away: app.js asks for it while it starts. */
window.MWNative = { NativeAudio, keepAlive };
