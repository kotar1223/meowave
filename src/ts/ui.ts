/* Small helpers the TypeScript screens share. */

/** A Material Symbols icon, optionally at a size in px — the markup the
    classic scripts write for icons, byte for byte. */
export const IC = (n: string, s?: number): string =>
  `<span class="material-symbols-rounded" aria-hidden="true"${s ? ` style="font-size:${s}px"` : ""}>${n}</span>`;

/** t() with {name} placeholders filled in. */
export const tf = (k: string, v?: Record<string, unknown>): string => {
  let s = t(k);
  for (const [a, b] of Object.entries(v || {})) s = s.split(`{${a}}`).join(String(b));
  return s;
};
