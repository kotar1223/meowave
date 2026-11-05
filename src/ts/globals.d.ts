/* Globals of the classic scripts (app.js, messenger.js, …) that the TypeScript
   modules read. Top-level const/let/function of a classic script live in the
   page's global scope, and a module sees them by name — so these are only
   types, nothing is imported. tests/tier1-features.mjs (F27-02) checks that
   every name declared here is still declared by some classic script: delete
   one there and the test, not the owner's window, finds out. */

interface TauriChannel<T> {
  onmessage: (message: T) => void;
}
interface TauriCore {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  Channel?: new <T = unknown>() => TauriChannel<T>;
}

/** A track as the library keeps it (only the fields the modules touch). */
interface MwTrack {
  id?: string | number;
  /** service: ym, ytm, sc, sp, am, local, … */
  s?: string;
  art?: string | null;
  /** title, artist */
  t?: string;
  a?: string;
  /** "empty" for the placeholder of an empty player; "local" for a file */
  mode?: string;
  fav?: boolean;
  favAt?: number;
  /** chat.ts: a hit from the services, not from the library */
  _remote?: boolean;
  /** duration, seconds */
  d?: number | string;
  /** m3.ts: the track plays from another service than its own (a fallback or the user's pick) */
  _resolved?: boolean;
  _resolvedSvc?: string;
  _resolvedId?: string | number;
  /** a Spotify track played from another service: the Spotify original */
  _spOrig?: MwTrack | null;
  /** the user chose this service: a downloaded file does not stand in for it (app.js offId) */
  _net?: boolean;
  [key: string]: unknown;
}
interface MwPlaylist {
  id?: string;
  name?: string;
  /** A picture chosen for the playlist (else the first track's). */
  cover?: string;
  tracks?: MwTrack[];
  [key: string]: unknown;
}
/** A card on a home-sheet shelf or in search (discover.ts renders them). */
interface MwCard {
  /** track, artist, playlist, album, … */
  kind?: string;
  id?: string;
  /** service */
  s?: string;
  /** title, the line under it */
  t?: string;
  sub?: string;
  art?: string | null;
  /** #rgb… behind the artwork */
  color?: string;
  track?: MwTrack;
  [key: string]: unknown;
}
interface MwShelf {
  title?: string;
  /** service */
  s?: string;
  cards?: MwCard[];
  [key: string]: unknown;
}
/** An entry of app.js's SERVICES. */
interface MwService {
  id: string;
  name?: string;
  /** switched on in Settings → Services */
  on?: boolean;
  /** signed in / has what it needs to play */
  conn?: boolean;
  /** the local library, not a streaming service */
  local?: boolean;
  [key: string]: unknown;
}
/** An artist of the library, as app.js's artistList() groups them. */
interface MwArtist {
  name: string;
  list: MwTrack[];
  art: string | null;
  fav: boolean;
}
interface MwHistoryEntry {
  tr?: MwTrack;
  [key: string]: unknown;
}
interface MwToastAction {
  label: string;
  run?: () => void;
}
interface MwToastOptions {
  icon?: string;
  actions?: MwToastAction[];
}
interface MwToastHandle {
  dismiss?: () => void;
}
/* The dialog of m3.ts (window.mwDialog) — every module opens this one. */
interface MwDialogAction {
  label: string;
  /** a filled button (Enter presses it); tonal — a tonal one; else a text button */
  primary?: boolean;
  tonal?: boolean;
  icon?: string;
  id?: string;
  /** false, or a promise of false, keeps the dialog open */
  run?: (dialog: MwDialogHandle) => unknown;
}
interface MwDialogOptions {
  icon?: string;
  title: string;
  /** HTML, or a node to put in */
  body?: string | Node;
  cls?: string;
  actions?: MwDialogAction[];
}
interface MwModalOptions {
  title: string;
  label?: string;
  sub?: string;
  value?: string;
  placeholder?: string;
  confirm?: string;
  cancel?: string;
  input?: boolean;
  danger?: boolean;
  icon?: string;
  required?: boolean;
  hint?: string;
  max?: number;
  secret?: boolean;
}

/** What mwDialog() hands back. */
interface MwDialogHandle {
  el: HTMLElement;
  body: HTMLElement;
  closed: boolean;
  close(): void;
  setActions(actions?: MwDialogAction[] | null): void;
}
/** The signed-in Supabase user (app.js sbUser). */
interface MwUser {
  id: string;
  [key: string]: unknown;
}
/** A row of the profiles table: your own (app.js sbProfile) or someone else's. */
interface MwProfile {
  id?: string;
  banner_url?: string | null;
  prefs?: { banner?: unknown; [key: string]: unknown } | null;
  [key: string]: unknown;
}
/** The part of the Supabase client (vendor/supabase.js, app.js sb) the modules use. */
interface MwSupabase {
  from(table: string): { upsert(row: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }> };
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<unknown>;
      upload(path: string, body: Blob, options?: Record<string, unknown>): Promise<{ error: { message?: string } | null }>;
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
}
/** A chat partner as messenger.js caches them (a profiles row). */
interface MwPeer {
  id?: string;
  username?: string;
  [key: string]: unknown;
}
/** A conversation (messenger.js msConvNew). */
interface MwConv {
  /** "dm" or "room" */
  kind: string;
  peer: string | null;
  /** the log on screen, while it is open */
  root: HTMLElement | null;
  /** the message being answered */
  reply: { id?: string | number } | null;
  [key: string]: unknown;
}
/** messenger.js's state (MS). */
interface MwMessenger {
  threads: { peer: string; [key: string]: unknown }[];
  friends: string[] | null;
  peers: Map<string, MwPeer>;
  conv: MwConv | null;
  [key: string]: unknown;
}

/* The parts of Tauri's JavaScript API the modules use. */
interface TauriPosition { x: number; y: number }
interface TauriSize { width: number; height: number }
interface TauriMonitor {
  scaleFactor?: number;
  position: TauriPosition;
  size: TauriSize;
  /** the monitor without the taskbar */
  workArea?: { position: TauriPosition; size: TauriSize };
}
/** m3.ts: the mini player moves, resizes and pins the window; the icon picker sets its icon. */
interface TauriWindow {
  scaleFactor(): Promise<number>;
  outerPosition(): Promise<TauriPosition>;
  innerSize(): Promise<TauriSize>;
  setPosition(position: object): Promise<void>;
  setSize(size: object): Promise<void>;
  setMinSize(size: object | null): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  isMaximized(): Promise<boolean>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  startDragging?(): Promise<void>;
  setIcon?(icon: unknown): Promise<void>;
}
/** LogicalSize and PhysicalPosition: in __TAURI__.dpi, and in __TAURI__.window as well. */
interface TauriDpi {
  LogicalSize?: new (width: number, height: number) => object;
  PhysicalPosition?: new (x: number, y: number) => object;
}
interface TauriWindowApi extends TauriDpi {
  getCurrentWindow?(): TauriWindow;
  /** the name in Tauri 1 */
  getCurrent?(): TauriWindow;
  currentMonitor?(): Promise<TauriMonitor | null>;
}
interface TauriGlobal {
  core?: TauriCore;
  webview?: { getCurrentWebview?: () => { setZoom(scale: number): Promise<void> } };
  window?: TauriWindowApi;
  dpi?: TauriDpi;
  /** Image.new(rgba, width, height) */
  image?: { Image?: { "new"?: (rgba: Uint8Array, width: number, height: number) => Promise<unknown> } };
}

interface Window {
  __TAURI__?: TauriGlobal;
  /** app.js: relabels the page in LANG; m3.ts and discover.ts wrap it to relabel their own parts too. */
  applyI18n?: () => void;
  /** app.js: the service search is narrowed to ("" — all of them). */
  searchScope?: () => string;
}

/** A value of the interface designer (custom.ts): #rrggbb, a number, or one of an item's options. */
type MwCzValue = string | number;
/** The designer's values: a — shared, d — dark theme colours, l — light theme colours. */
interface MwCzStore {
  a: Record<string, MwCzValue>;
  d: Record<string, MwCzValue>;
  l: Record<string, MwCzValue>;
}
/** m3.ts: the mini player — always on top or not, and the card's own size and place (physical px). */
interface MwMiniCfg {
  pin?: boolean;
  w?: number;
  h?: number;
  x?: number;
  y?: number;
}
/** discover.ts: My Wave's settings — source, character, mood, language (waveCfg() repairs them). */
interface MwWaveCfg {
  src?: string;
  div?: string;
  mood?: string;
  lang?: string;
}
/** S.x: the settings saved with S that have no field of their own. */
interface MwStateX {
  /** custom.ts: the interface designer */
  cz?: MwCzStore;
  /** custom.ts: the preset applied last ("" once something is changed by hand) */
  czp?: string;
  /** m3.ts */
  mini?: MwMiniCfg;
  /** m3.ts: false — a track YouTube refuses is not played from another service */
  ytmAlt?: boolean;
  /** m3.ts: the app icon (classic, clear-auto, ocean …) */
  appIcon?: string;
  /** discover.ts */
  wave?: MwWaveCfg;
  [key: string]: unknown;
}
/** What app.js's lyricsFor() knows about a track's lyrics. */
interface MwLyrics {
  /** idle, loading, done, none … */
  state: string;
  synced?: boolean;
  lines?: { at?: number | null; text?: string }[];
  [key: string]: unknown;
}

/* app.js */
declare const I18N: Record<string, Record<string, string>> & { ru: Record<string, string>; en: Record<string, string> };
declare const t: (key: string) => string;
declare const S: { pspeed?: number | string; view?: string; banner?: string; current?: MwTrack | null; playing: boolean; pos: number; dur: number; x: MwStateX; [key: string]: unknown };
declare const AB: { bass: number; mid: number; high: number; lvl: number; beat: number; [key: string]: number };
declare const BOOT: { done: boolean; reduce: boolean };
declare const TAURI: TauriCore | undefined;
declare const inv: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T> | undefined;
declare const esc: (s: unknown) => string;
declare let TRACKS: MwTrack[];
declare let PLAYLISTS: MwPlaylist[];
declare let HISTORY: MwHistoryEntry[];
declare function toast(msg: string, ms?: number, opt?: MwToastOptions): MwToastHandle | null | undefined;
declare function showModal(options: MwModalOptions): Promise<string | boolean | null>;
declare function seg(id: string, fn: (value: string, button: HTMLButtonElement) => void): void;
declare function setSeg(id: string, value: string | number): void;
declare function setParticlesEnabled(on: boolean): void;
declare function draw(level: number): void;
declare function resize(): void;
declare function fieldAccent(): [number, number, number];
declare function oklchOf(rgb: readonly number[]): [number, number, number];
declare function oklchLin(L: number, C: number, H: number): [number, number, number];
declare function save(): void;
declare const askText: (title: string, value?: string, o?: Partial<MwModalOptions>) => Promise<string | null>;
declare const askConfirm: (title: string, confirm: string, danger?: boolean, o?: Partial<MwModalOptions>) => Promise<true | null>;
declare function paintSeg(seg: Element | null): void;
declare function paintRange(r: HTMLInputElement): void;
declare function paintRail(): void;
declare function renderLib(): void;
declare let LANG: string;
declare const SERVICES: MwService[];
/** The playlist open in the library ("" or null — the list of playlists). */
declare let plOpen: string | null;
declare const icons: () => unknown;
declare const empty: (icon: string, head: string, sub?: string) => string;
declare const cssUrlRaw: (s: unknown) => string;
declare function row(tr: MwTrack, extra?: string, removable?: boolean, rmPid?: string | null): string;
declare function xlistSet(key: string, name: string, tracks: MwTrack[]): void;
declare function listFor(key: string): MwTrack[] | null;
declare function setTrack(tr: MwTrack, play?: boolean, openFull?: boolean, ctx?: string, keepQueue?: boolean, isBack?: boolean): Promise<unknown>;
declare function go(view: string): void;
declare function search(query: string, silent?: boolean): Promise<unknown>;
declare function artistList(): MwArtist[];
declare let sb: MwSupabase | null;
declare let sbUser: MwUser | null;
declare let sbProfile: MwProfile | null;
declare function pushPrefs(): void;
declare function renderProfile(savedVals?: Record<string, unknown>): void;
declare const uploadBanner: (f: File) => Promise<unknown>;
declare function fillProfileSettings(): void;
declare function openSettings(tab?: string): void;
declare const avat: (p: MwPeer | MwProfile | null | undefined, size?: number, status?: unknown) => string;
/** never undefined: an unknown id gets a stand-in, so callers read .name straight off */
declare const svc: (id: string | undefined) => MwService;
declare let queue: MwTrack[];
declare const cssEsc: (s: unknown) => string;
declare const coverStyle: (url?: string | null, l1?: unknown, l2?: unknown) => string;
declare function queueFav(tr: MwTrack, on: boolean): void;
declare function autoDownload(tr: MwTrack, playlistName: string | null): unknown;
declare function renderWaveHint(): void;
declare function searchRemote(query: string, only?: unknown): Promise<MwTrack[] | null | undefined>;
declare function stripTrack(tr: MwTrack | null | undefined): MwTrack | null;
/* … read by m3.ts */
declare const A: { audio: { paused: boolean; currentTime: number } | null; [key: string]: unknown };
/** how far ahead of the audio a synced line lights up, seconds */
declare const LY_LEAD: number;
/** track matching: of(a, b) — how surely b is the same recording as a (0…1), null when it is not */
declare const MWM: {
  of(a: MwTrack, b: MwTrack): number | null;
  /** lower case, Latin letters for Cyrillic ones, no accents or punctuation */
  fold(s: unknown): string;
  /** a title without what platforms bolt onto it (feat., [Remastered], - Radio Edit) */
  core(s: unknown): string;
  /** one key for every copy of a recording across services */
  key(tr: MwTrack): string;
  [key: string]: unknown;
};
/** where the queue came from ("wave" — the wave) */
declare let PLAYCTX: { key?: string; [key: string]: unknown };
/** service id → its logo, as HTML */
declare const SVC_ICONS: Record<string, string>;
/** trackKey()s a silent fallback has been tried for */
declare const fallbackAttempted: Set<string>;
/** the full-screen player */
declare const fp: HTMLElement;
declare const fmt: (s: number) => string;
declare const sprKey: (tr: MwTrack) => string;
declare function cleanMusicTitle(artist?: string, title?: string): { query: string; [key: string]: unknown };
declare function closeFP(): void;
declare function closeSettings(instant?: boolean): void;
declare function settingsIsOpen(): boolean;
declare function fetchLyrics(tr: MwTrack): Promise<unknown>;
declare function getLyricOffset(tr: MwTrack): number;
declare function lyricsFor(tr: MwTrack): MwLyrics | null | undefined;
declare function humanStreamError(why: string): string;
declare function load(tr: MwTrack, auto?: boolean, resumePos?: number): unknown;
declare function next(userInitiated?: boolean): unknown;
declare function prev(): unknown;
declare function toggle(): unknown;
declare function seekSeconds(pos: number): void;
declare function paint(): void;
declare function renderNP(): void;
declare function sync(): void;
declare function sameTrack(a: MwTrack | null | undefined, b: MwTrack | null | undefined): boolean;
declare function trackKey(tr: MwTrack): string;
/** Spotify tracks resolved to another service, by sprKey() */
declare function sprMap(): Map<string, unknown>;
declare function sprSave(): void;
/* … read by discover.ts */
declare const RM: boolean;
declare let FAV_ARTISTS: string[];
declare function toggleFavArtist(name: string): void;
declare const favTracks: () => MwTrack[];
declare function isDisliked(tr: MwTrack | null | undefined): boolean;
/** can a track of this service play right now */
declare const playOn: (id: string | undefined) => boolean;
/** the first of several artists ("A, B", "A feat. B") */
declare const sprPrimary: (a: unknown) => string;
/** where a Spotify track really plays from */
declare function sprResolve(tr: MwTrack, force?: boolean): Promise<{ s?: string; id?: string | number; [key: string]: unknown } | null | undefined>;
declare const cssUrl: (s: unknown) => string;
/** the wave's own list, and what of it has played this session */
declare let WAVE: MwTrack[];
declare const WAVE_SESSION_PLAYED: Set<string>;
declare function ensureStreamPort(): Promise<unknown>;
declare function startWave(): Promise<void>;
/** the wave from the library, when no service can make one */
declare function startWaveLegacy(): Promise<void>;
declare function renderFPBody(): void;
declare function renderSrv(): void;
declare function openArtist(name: string): void;
declare function renderArtist(name: string): void;
declare function setShuffle(on: boolean): void;
declare function mergeLocal(added: MwTrack[]): void;
declare function applyFPSettings(): void;
declare function importRows(rows: MwTrack[], svcId: string | null, name: string, asFavorites: boolean, src?: unknown): Promise<unknown>;

/* messenger.js */
declare const MS: MwMessenger;
declare const msMe: () => string;
declare const msName: (p: MwPeer | null | undefined) => string;
declare function msErr(e: unknown): string;
declare function msCtx(c: MwConv, mode: string | null, row?: unknown): void;
declare function msPost(c: MwConv, payload: Record<string, unknown>, replyTo: unknown): Promise<unknown>;
declare function msSend(c: MwConv, payload: Record<string, unknown>, replyTo: unknown): Promise<{ error?: unknown } | null | undefined>;
declare function msConvNew(kind: string, id: unknown): MwConv;
declare function msLoadThreads(): Promise<unknown>;
declare function msPaintList(showFriends?: boolean): void;
declare function msLoadFriends(force?: boolean): Promise<unknown>;
declare function msEnsurePeers(ids: string[]): Promise<unknown>;
