// Downloads ffmpeg for bundling with the installer.
//
//   node scripts/fetch-ffmpeg.mjs
//   -> src-tauri/ffmpeg/ffmpeg-<target-triple>(.exe)  (+ LICENSE.txt)
//
// Why bundle at all: "download with processing" and the mp3 remux both need
// ffmpeg, and telling a user to install it themselves means the feature is
// broken for most of them. has_ffmpeg() still falls back to PATH, so a system
// copy keeps working.
//
// Per-platform builds:
//   * Windows / Linux — BtbN's **lgpl static** release. Static: one binary, no
//     DLL/SO set to keep in sync. LGPL rather than gpl: no x264/x265, and
//     nothing here touches video, which is what makes redistribution inside a
//     closed installer clean. Both variants carry libmp3lame, equalizer and
//     atempo — the whole requirement.
//   * macOS — BtbN publishes no macOS builds. The script exits successfully
//     without downloading anything and the app falls back to `brew install
//     ffmpeg` (local.rs probes /opt/homebrew/bin before PATH), so packaging
//     still works; only "download with processing" needs the local install.
//
// The download is verified against the checksums.sha256 published in the same
// GitHub release (same origin, HTTPS). gyan.dev was rejected as a source:
// two downloads produced two different digests, neither matching its own
// published .sha256 file.
//
// The target-triple suffix is what Tauri's `externalBin` expects. It strips the
// suffix at bundle time, so the installed file is plain `ffmpeg(.exe)` next to
// the app executable — exactly where local.rs::ffmpeg_bin looks first.
//
// The binary is NOT committed: it is ~110 MB. CI runs this before building.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = "BtbN/FFmpeg-Builds";
const BASE = `https://github.com/${REPO}/releases/download/latest`;

const root = resolve(import.meta.dirname, "..");
const outDir = join(root, "src-tauri", "ffmpeg");

/** Host triple, straight from the compiler that will build the app. */
function hostTriple() {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const m = out.match(/^host:\s*(\S+)$/m);
  if (!m) throw new Error("could not read the host triple from `rustc -vV`");
  return m[1];
}

/** BtbN asset name for a Rust triple, or null when that platform must use a
    system ffmpeg (today: macOS, which BtbN does not build). Windows ships as
    .zip, Linux as .tar.xz — see archiveKind(). */
function assetFor(triple) {
  if (triple.startsWith("x86_64-pc-windows")) return "ffmpeg-master-latest-win64-lgpl.zip";
  if (triple.startsWith("aarch64-pc-windows")) return "ffmpeg-master-latest-winarm64-lgpl.zip";
  if (triple.startsWith("x86_64-unknown-linux")) return "ffmpeg-master-latest-linux64-lgpl.tar.xz";
  if (triple.startsWith("aarch64-unknown-linux")) return "ffmpeg-master-latest-linuxarm64-lgpl.tar.xz";
  return null;
}

const triple = hostTriple();
const ASSET = assetFor(triple);

// The sidecar name Tauri expects on disk for this host.
const exePath = join(outDir, `ffmpeg-${triple}${triple.includes("windows") ? ".exe" : ""}`);
const stampPath = join(outDir, ".sha256");

const force = process.argv.includes("--force");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function get(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

if (!ASSET) {
  // No bundled build for this platform. Succeed anyway so `npm run build`
  // keeps working; local.rs finds a system ffmpeg or reports the feature off.
  console.log(
    `no prebuilt ffmpeg for ${triple}.\n` +
      `The app will use a system copy if present:\n` +
      `  brew install ffmpeg        (macOS)\n` +
      `  sudo apt install ffmpeg    (Debian/Ubuntu)\n`,
  );
  process.exit(0);
}

/** The digest the release itself publishes for our asset. */
async function wantedDigest() {
  const text = (await get(`${BASE}/checksums.sha256`)).toString("utf8");
  for (const line of text.split(/\r?\n/)) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === ASSET) return hash.toLowerCase();
  }
  throw new Error(`${ASSET} is not listed in checksums.sha256`);
}

/** Extracts the one entry whose name ends with entrySuffix to destPath,
    using whatever the platform offers, keeping the zero-dependency promise:
      Windows (.zip)  -> PowerShell .NET ZipFile (always present)
      Linux (.tar.xz) -> system tar; python3's tarfile as the fallback for
                         images without xz-utils
      macOS           -> not reached (BtbN ships no macOS builds) */
function extract(archivePath, entrySuffix, destPath) {
  if (process.platform === "win32") {
    const ps = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
      `$z=[System.IO.Compression.ZipFile]::OpenRead('${archivePath.replace(/'/g, "''")}');`,
      `$e=$z.Entries | Where-Object { $_.FullName -like '*${entrySuffix}' } | Select-Object -First 1;`,
      "if(-not $e){ $z.Dispose(); throw 'entry not found' };",
      `[System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,'${destPath.replace(/'/g, "''")}', $true);`,
      "$z.Dispose();",
    ].join(" ");
    execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    return;
  }
  const dir = resolve(destPath, "..");
  try {
    // Resolve the exact member first (the archive nests everything under one
    // top folder), then pull just that file.
    const listing = execFileSync("tar", ["-tJf", archivePath], { encoding: "utf8" });
    const member = listing.split(/\r?\n/).find((n) => n.endsWith(entrySuffix));
    if (!member) throw new Error(`${entrySuffix} not found in ${archivePath}`);
    execFileSync("tar", ["-xJf", archivePath, "-C", dir, member], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    const landed = join(dir, member);
    if (landed !== destPath) {
      rmSync(destPath, { force: true });
      execFileSync("mv", [landed, destPath]);
    }
  } catch (e) {
    if (e?.code === "ENOENT") throw e;
    // Minimal systems ship python3 even where xz-utils is absent.
    execFileSync(
      "python3",
      [
        "-c",
        `import tarfile,sys,shutil
t=tarfile.open(sys.argv[1]); m=[x for x in t.getmembers() if x.name.endswith(sys.argv[2])]
assert m, "entry not found"
with open(sys.argv[3],"wb") as f: shutil.copyfileobj(t.extractfile(m[0]), f)`,
        archivePath,
        entrySuffix,
        destPath,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    chmodSync(destPath, 0o755);
  }
}

const digest = await wantedDigest();

if (!force && existsSync(exePath) && existsSync(stampPath)) {
  if (readFileSync(stampPath, "utf8").trim() === digest) {
    const mb = (statSync(exePath).size / 1048576).toFixed(0);
    console.log(`ffmpeg (${triple}) already current (${mb} MB). --force to redownload.`);
    process.exit(0);
  }
}

console.log(`Downloading ${ASSET} …`);
const zip = await get(`${BASE}/${ASSET}`);

const got = sha256(zip);
if (got !== digest) {
  throw new Error(`checksum mismatch\n  expected ${digest}\n  got      ${got}`);
}
console.log(`sha256 ok (${(zip.length / 1048576).toFixed(0)} MB)`);

mkdirSync(outDir, { recursive: true });
const binName = triple.includes("windows") ? "ffmpeg.exe" : "ffmpeg";
const licEntry = "/LICENSE.txt";
const zipPath = join(outDir, "_ffmpeg.zip");
writeFileSync(zipPath, zip);
try {
  extract(zipPath, `/bin/${binName}`, exePath);
  // Shipped alongside the binary: LGPL requires the licence to travel with it.
  try {
    extract(zipPath, licEntry, join(outDir, "LICENSE.txt"));
  } catch {}
} finally {
  rmSync(zipPath, { force: true });
}
if (!triple.includes("windows")) chmodSync(exePath, 0o755);

writeFileSync(stampPath, digest + "\n");

// A binary that cannot do what we need is worse than no binary, because the UI
// would offer the feature and then fail on use.
const probe = (args) => execFileSync(exePath, args, { encoding: "utf8" });
const out = probe(["-hide_banner", "-encoders"]);
if (!/libmp3lame/.test(out)) throw new Error("this ffmpeg has no libmp3lame encoder");
const filters = probe(["-hide_banner", "-filters"]);
for (const f of ["atempo", "equalizer"]) {
  if (!new RegExp(`\\s${f}\\s`).test(filters)) throw new Error(`this ffmpeg has no ${f} filter`);
}
console.log(`ffmpeg -> ${exePath} (${(statSync(exePath).size / 1048576).toFixed(0)} MB)`);
console.log("libmp3lame, atempo and equalizer present.");
