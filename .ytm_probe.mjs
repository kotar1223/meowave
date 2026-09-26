// Temporary probe #2: is the ANDROID player client consistently OK, and do
// the returned urls actually stream? Deleted after the review.
import { readFileSync } from "node:fs";

const KEY = "AIzaSyAOghZGza2MQSZkY_zfZ370N-PUdXEo8AI";
const UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";
const ids = JSON.parse(readFileSync("/tmp/ytm_ids.json", "utf8")).slice(0, 6);

for (const videoId of ids) {
  const body = {
    context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, osName: "Android", osVersion: "14", hl: "en", gl: "US" } },
    videoId,
    playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
    contentCheckOk: true,
    racyCheckOk: true,
  };
  try {
    const r = await fetch(`https://youtubei.googleapis.com/youtubei/v1/player?key=${KEY}&prettyPrint=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Format-Version": "2", "User-Agent": UA },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    const status = j.playabilityStatus?.status;
    const audio = (j.streamingData?.adaptiveFormats || []).filter((f) => (f.mimeType || "").startsWith("audio/"));
    const plain = audio.filter((f) => f.url);
    const kinds = [...new Set(plain.map((f) => (f.mimeType || "").split(";")[0]))];
    let bytes = "-", ctype = "-";
    const best = plain.slice().sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    if (best?.url) {
      const g = await fetch(best.url, { headers: { Range: "bytes=0-2047", "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
      bytes = (await g.arrayBuffer()).byteLength;
      ctype = g.status + " " + (g.headers.get("content-type") || "");
    }
    console.log(`${videoId} status=${status} audio=${audio.length} plain=${plain.length} containers=[${kinds}] bytes=${bytes} (${ctype})`);
  } catch (e) {
    console.log(`${videoId} ERROR ${e.message}`);
  }
}
