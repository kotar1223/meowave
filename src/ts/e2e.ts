/* e2e.ts — Meowave end-to-end encryption — the primitives, nothing else.
   Was src/e2e.js until step 2 of the stack rewrite; the algorithm, the wire
   format and the names the messenger calls (window.MWE2E) are unchanged.

   No DOM, no network, no app state: messenger.ts decides who a message is for
   and where it goes; this file only seals and opens. Plain WebCrypto, so it
   runs the same in WebView2, WKWebView, WebKitGTK, Android WebView, a browser
   and Node (F26-06 imports this file and round-trips real keys).

   Each device has its own P-256 key pair. The private half stays on the device
   (exported as JWK into localStorage by the caller — CryptoKey objects cannot
   be put in IndexedDB on every webview we ship to); the public half is
   published in public.e2e_devices.

   seal(): the message gets a fresh 256-bit content key and AES-GCM. The content
   key is then wrapped once per recipient device, ECIES style: an ephemeral
   P-256 key, ECDH with that device's public key, HKDF-SHA-256 over a random
   salt with the slot name as info, AES-GCM around the content key. Every
   wrapped entry is self-contained (ephemeral public key, salt, iv, wrapped
   key), so a device can later add entries for its own new devices without
   touching the ciphertext.

   additionalData binds the ciphertext to its conversation and author: a sealed
   message moved into another chat, or attributed to someone else, fails to
   open instead of showing up there.

   Nothing here waits for the classic scripts: messenger.ts imports MWE2E and
   calls it only from inside its functions, long after the page has loaded;
   main.ts imports this module first, so window.MWE2E is there before
   DOMContentLoaded. */

/** A public key as published in public.e2e_devices. */
export interface E2EPub { kty: string; crv: string; x?: string; y?: string }
/** This device: what the caller keeps in localStorage. */
export interface E2EDevice { id: string; priv: JsonWebKey; pub: E2EPub; at: number }
/** One recipient device: slot "<uid>:<device>" and its imported public key. */
export interface E2ETarget { slot: string; pub: CryptoKey }
/** The e2e column of a messages row: version, iv and one wrapped key per slot. */
export interface E2EBox { v: number; iv: string; k: Record<string, string> }
export interface E2ERow { ciphertext?: string | null; e2e?: E2EBox | null }

type Bytes = Uint8Array<ArrayBuffer>;

const C = globalThis.crypto as Crypto | undefined;
const subtle = C && C.subtle;
const EC = { name: "ECDH", namedCurve: "P-256" };
const te = new TextEncoder(), td = new TextDecoder();
const INFO = "meowave-e2e/1|";

const rnd = (n: number): Bytes => C!.getRandomValues(new Uint8Array(n));
function b64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}
function ub64(s: unknown): Bytes {
  const b = atob(String(s || ""));
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
const b64url = (u8: Uint8Array): string => b64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function cat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const supported = (): boolean => !!(subtle && typeof C!.getRandomValues === "function" && typeof TextEncoder !== "undefined");

/* A new device: id + key pair. The caller stores it; nothing here persists. */
async function newDevice(): Promise<E2EDevice> {
  const kp = await subtle!.generateKey(EC, true, ["deriveBits"]) as CryptoKeyPair;
  const priv = await subtle!.exportKey("jwk", kp.privateKey);
  const pub = await subtle!.exportKey("jwk", kp.publicKey);
  return { id: b64url(rnd(16)), priv, pub: { kty: "EC", crv: "P-256", x: pub.x, y: pub.y }, at: Date.now() };
}

const importPriv = (jwk: JsonWebKey): Promise<CryptoKey> => subtle!.importKey("jwk", { ...jwk, ext: true }, EC, false, ["deriveBits"]);
function importPub(jwk: E2EPub | null | undefined): Promise<CryptoKey> {
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) return Promise.reject(new Error("bad public key"));
  return subtle!.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true }, EC, true, []);
}

async function kek(priv: CryptoKey, pub: CryptoKey, salt: Bytes, slot: string, usage: KeyUsage): Promise<CryptoKey> {
  const bits = await subtle!.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hk = await subtle!.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle!.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: te.encode(INFO + slot) },
    hk, { name: "AES-GCM", length: 256 }, false, [usage]);
}

/* targets: [{slot:"<uid>:<device>", pub:CryptoKey}] -> {slot: entry} */
async function wrapFor(targets: E2ETarget[], cek: Bytes): Promise<Record<string, string>> {
  const eph = await subtle!.generateKey(EC, true, ["deriveBits"]) as CryptoKeyPair;
  const epk = new Uint8Array(await subtle!.exportKey("raw", eph.publicKey)); // 65 bytes
  const k: Record<string, string> = {};
  for (const t of targets) {
    const salt = rnd(16), iv = rnd(12);
    const w = await kek(eph.privateKey, t.pub, salt, t.slot, "encrypt");
    const wrapped = new Uint8Array(await subtle!.encrypt({ name: "AES-GCM", iv }, w, cek));
    k[t.slot] = b64(cat(epk, salt, iv, wrapped));
  }
  return k;
}

async function unwrap(e2e: E2EBox | null | undefined, slot: string, priv: CryptoKey): Promise<Bytes | null> {
  const entry = e2e && e2e.k && e2e.k[slot];
  if (!entry) return null;
  const raw = ub64(entry);
  if (raw.length < 65 + 16 + 12 + 16) throw new Error("bad key entry");
  const epk = await subtle!.importKey("raw", raw.subarray(0, 65), EC, true, []);
  const w = await kek(priv, epk, raw.subarray(65, 81), slot, "decrypt");
  return new Uint8Array(await subtle!.decrypt({ name: "AES-GCM", iv: raw.subarray(81, 93) }, w, raw.subarray(93)));
}

/* -> {ciphertext, e2e:{v, iv, k}} ready for the messages row. */
async function seal(targets: E2ETarget[], payload: unknown, aad?: string): Promise<{ ciphertext: string; e2e: E2EBox }> {
  if (!targets || !targets.length) throw new Error("no recipients");
  const cek = rnd(32), iv = rnd(12);
  const ck = await subtle!.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await subtle!.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(aad || "") },
    ck, te.encode(JSON.stringify(payload))));
  const k = await wrapFor(targets, cek);
  cek.fill(0);
  return { ciphertext: b64(ct), e2e: { v: 1, iv: b64(iv), k } };
}

/* null when this device holds no key for the message; throws when it does
   and the message does not open (tampered, or bound to another chat). */
async function open(row: E2ERow | null | undefined, slot: string, priv: CryptoKey, aad?: string): Promise<unknown> {
  if (!row || !row.e2e || !row.ciphertext) return null;
  const cek = await unwrap(row.e2e, slot, priv);
  if (!cek) return null;
  const ck = await subtle!.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  cek.fill(0);
  const pt = await subtle!.decrypt({ name: "AES-GCM", iv: ub64(row.e2e.iv), additionalData: te.encode(aad || "") },
    ck, ub64(row.ciphertext));
  return JSON.parse(td.decode(pt));
}

/* New entries for more devices, from a device that can already open it. */
async function rewrap(e2e: E2EBox | null | undefined, slot: string, priv: CryptoKey, targets: E2ETarget[]): Promise<Record<string, string> | null> {
  const cek = await unwrap(e2e, slot, priv);
  if (!cek) return null;
  const k = await wrapFor(targets, cek);
  cek.fill(0);
  return k;
}

/* Short, human-comparable fingerprint of a public key (settings → devices). */
async function fingerprint(jwk: E2EPub): Promise<string> {
  const h = new Uint8Array(await subtle!.digest("SHA-256", te.encode(`${jwk.x}.${jwk.y}`)));
  return Array.from(h.subarray(0, 8), b => b.toString(16).padStart(2, "0")).join("").toUpperCase().replace(/(.{4})(?!$)/g, "$1 ");
}

export const MWE2E = { supported, newDevice, importPriv, importPub, seal, open, rewrap, fingerprint };

declare global {
  interface Window { MWE2E?: typeof MWE2E }
}

if (typeof window !== "undefined") window.MWE2E = MWE2E;
