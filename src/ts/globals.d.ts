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
  tracks?: MwTrack[];
  [key: string]: unknown;
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

interface Window {
  __TAURI__?: { core?: TauriCore };
  /** m3.js: the one Material 3 dialog every module uses. */
  mwDialog?: (options: MwDialogOptions) => unknown;
  /** custom.js: a particle colour picked in the interface designer. */
  CZ_FIELD?: [number, number, number] | null;
}

/* app.js */
declare const I18N: Record<string, Record<string, string>> & { ru: Record<string, string>; en: Record<string, string> };
declare const t: (key: string) => string;
declare const S: { pspeed?: number | string; view?: string; [key: string]: unknown };
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
