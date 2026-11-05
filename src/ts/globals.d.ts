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
  storage: { from(bucket: string): { remove(paths: string[]): Promise<unknown> } };
}

interface Window {
  __TAURI__?: { core?: TauriCore };
  /** m3.js: the one Material 3 dialog every module uses. */
  mwDialog?: (options: MwDialogOptions) => MwDialogHandle;
  /** custom.js: a particle colour picked in the interface designer. */
  CZ_FIELD?: [number, number, number] | null;
  /** app.js: the service search is narrowed to ("" — all of them). */
  searchScope?: () => string;
  /** discover.js: the home sheet; its shelf renderer registers the cards for its own click handler. */
  MWDISC?: { shelvesHTML?: (shelves: MwShelf[]) => string; [key: string]: unknown };
}

/* app.js */
declare const I18N: Record<string, Record<string, string>> & { ru: Record<string, string>; en: Record<string, string> };
declare const t: (key: string) => string;
declare const S: { pspeed?: number | string; view?: string; banner?: string; [key: string]: unknown };
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
