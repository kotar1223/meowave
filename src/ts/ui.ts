/* Small helpers the TypeScript screens share. */

/** A Material Symbols icon, optionally at a size in px — the markup the
    classic scripts write for icons, byte for byte. */
export const IC = (n: string, s?: number): string =>
  `<span class="material-symbols-rounded" aria-hidden="true"${s ? ` style="font-size:${s}px"` : ""}>${n}</span>`;
