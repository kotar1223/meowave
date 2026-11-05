/* Globals of the classic scripts (app.js, m3.js, …) that the TypeScript
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
  art?: string;
  /** title, artist */
  t?: string;
  a?: string;
  /** "empty" for the placeholder of an empty player; "local" for a file */
  mode?: string;
  fav?: boolean;
  favAt?: number;
  /** chat.ts: a hit from the services, not from the library */
  _remote?: boolean;
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
/** A card on a home-sheet shelf or in search (discover.js renders them). */
interface MwCard {
  /** track, artist, playlist, album, … */
  kind?: string;
  id?: string;
  /** title */
  t?: string;
  track?: MwTrack;
  [key: string]: unknown;
}
interface MwShelf {
  title?: string;
  cards?: MwCard[];
  [key: string]: unknown;
}
/** An entry of app.js's SERVICES. */
interface MwService {
  id: string;
  name?: string;
  /** switched on in Settings → Services */
  on?: boolean;
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
interface MwDialogAction {
  label: string;
  primary?: boolean;
  icon?: string;
  run?: () => void;
}
interface MwDialogOptions {
  icon?: string;
  title: string;
  body?: string;
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

/** What mwDialog() hands back (m3.js). */
interface MwDialogHandle {
  el: HTMLElement;
  body: HTMLElement;
  closed: boolean;
  close(): void;
  setActions(actions: MwDialogAction[]): void;
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

interface Window {
  __TAURI__?: { core?: TauriCore; webview?: { getCurrentWebview?: () => { setZoom(scale: number): Promise<void> } } };
  /** m3.js: the one Material 3 dialog every module uses. */
  mwDialog?: (options: MwDialogOptions) => MwDialogHandle;
  /** m3.js: Material 3 helpers; copyText falls back to execCommand where the Clipboard API is refused. */
  MW3?: { copyText?: (text: string) => Promise<boolean>; [key: string]: unknown };
  /** app.js: the service search is narrowed to ("" — all of them). */
  searchScope?: () => string;
  /** discover.js: the home sheet; its shelf renderer registers the cards for its own click handler. */
  MWDISC?: { shelvesHTML?: (shelves: MwShelf[]) => string; [key: string]: unknown };
}

/** A value of the interface designer (custom.ts): #rrggbb, a number, or one of an item's options. */
type MwCzValue = string | number;
/** The designer's values: a — shared, d — dark theme colours, l — light theme colours. */
interface MwCzStore {
  a: Record<string, MwCzValue>;
  d: Record<string, MwCzValue>;
  l: Record<string, MwCzValue>;
}
/** S.x: the settings saved with S that have no field of their own. */
interface MwStateX {
  /** custom.ts: the interface designer */
  cz?: MwCzStore;
  /** custom.ts: the preset applied last ("" once something is changed by hand) */
  czp?: string;
  [key: string]: unknown;
}

/* app.js */
declare const I18N: Record<string, Record<string, string>> & { ru: Record<string, string>; en: Record<string, string> };
declare const t: (key: string) => string;
declare const S: { pspeed?: number | string; view?: string; banner?: string; current?: MwTrack | null; x: MwStateX; [key: string]: unknown };
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
declare const svc: (id: string) => MwService | undefined;
declare let queue: MwTrack[];
declare const cssEsc: (s: unknown) => string;
declare const coverStyle: (url?: string | null, l1?: unknown, l2?: unknown) => string;
declare function queueFav(tr: MwTrack, on: boolean): void;
declare function autoDownload(tr: MwTrack, playlistName: string | null): unknown;
declare function renderWaveHint(): void;
declare function searchRemote(query: string, only?: unknown): Promise<MwTrack[] | null | undefined>;
declare function stripTrack(tr: MwTrack | null | undefined): MwTrack | null;

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
