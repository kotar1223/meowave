/**
 * Material You (Material Design 3) Dynamic Theme Generator
 * Implements tonal palette derivation and the 29 M3 color roles.
 */
export function hexToRgb(hex) {
    let clean = hex.replace("#", "");
    if (clean.length === 3) {
        clean = clean.split("").map((c) => c + c).join("");
    }
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
export function rgbToHex(r, g, b) {
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
export function hexToHsl(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}
export function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 60) {
        r = c;
        g = x;
        b = 0;
    }
    else if (h >= 60 && h < 120) {
        r = x;
        g = c;
        b = 0;
    }
    else if (h >= 120 && h < 180) {
        r = 0;
        g = c;
        b = x;
    }
    else if (h >= 180 && h < 240) {
        r = 0;
        g = x;
        b = c;
    }
    else if (h >= 240 && h < 300) {
        r = x;
        g = 0;
        b = c;
    }
    else {
        r = c;
        g = 0;
        b = x;
    }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
/**
 * Generate M3 tonal steps (0 to 100) for a given base hue and chroma
 */
export function getTone(h, s, tone) {
    // Map tone directly to lightness with gentle chroma adjustment for contrast
    const adjustedS = s * (tone > 10 && tone < 90 ? 1 : 0.8);
    return hslToHex(h, adjustedS, tone);
}
export function generateM3Scheme(seedHex, isDark = true) {
    const base = hexToHsl(seedHex);
    const h = base.h;
    const s = Math.max(30, base.s);
    // Palettes
    const p = (tone) => getTone(h, s, tone);
    const sec = (tone) => getTone(h, s * 0.45, tone);
    const tert = (tone) => getTone((h + 60) % 360, s * 0.65, tone);
    const n = (tone) => getTone(h, 8, tone);
    const nv = (tone) => getTone(h, 16, tone);
    const err = (tone) => getTone(20, 85, tone);
    if (isDark) {
        return {
            primary: p(80),
            onPrimary: p(20),
            primaryContainer: p(30),
            onPrimaryContainer: p(90),
            secondary: sec(80),
            onSecondary: sec(20),
            secondaryContainer: sec(30),
            onSecondaryContainer: sec(90),
            tertiary: tert(80),
            onTertiary: tert(20),
            tertiaryContainer: tert(30),
            onTertiaryContainer: tert(90),
            surface: n(6),
            onSurface: n(90),
            surfaceVariant: nv(30),
            onSurfaceVariant: nv(80),
            surfaceDim: n(6),
            surfaceBright: n(24),
            surfaceContainerLowest: n(4),
            surfaceContainer: n(12),
            surfaceContainerHigh: n(17),
            surfaceContainerHighest: n(22),
            outline: nv(60),
            outlineVariant: nv(30),
            error: err(80),
            onError: err(20),
            errorContainer: err(30),
            onErrorContainer: err(90)
        };
    }
    else {
        return {
            primary: p(40),
            onPrimary: p(100),
            primaryContainer: p(90),
            onPrimaryContainer: p(10),
            secondary: sec(40),
            onSecondary: sec(100),
            secondaryContainer: sec(90),
            onSecondaryContainer: sec(10),
            tertiary: tert(40),
            onTertiary: tert(100),
            tertiaryContainer: tert(90),
            onTertiaryContainer: tert(10),
            surface: n(98),
            onSurface: n(10),
            surfaceVariant: nv(90),
            onSurfaceVariant: nv(30),
            surfaceDim: n(87),
            surfaceBright: n(98),
            surfaceContainerLowest: n(100),
            surfaceContainer: n(94),
            surfaceContainerHigh: n(92),
            surfaceContainerHighest: n(90),
            outline: nv(50),
            outlineVariant: nv(80),
            error: err(40),
            onError: err(100),
            errorContainer: err(90),
            onErrorContainer: err(10)
        };
    }
}
export function applyTheme(seedHex, isDark = true) {
    const scheme = generateM3Scheme(seedHex, isDark);
    const root = document.documentElement;
    for (const [role, value] of Object.entries(scheme)) {
        const cssVarName = `--md-sys-color-${role.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
        root.style.setProperty(cssVarName, value);
    }
    // Bind to legacy theme tokens for cross-compatibility
    const [r, g, b] = hexToRgb(scheme.primary);
    root.style.setProperty("--accent", scheme.primary);
    root.style.setProperty("--accent-rgb", `${r} ${g} ${b}`);
    root.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.16)`);
    root.style.setProperty("--ring", `rgba(${r}, ${g}, ${b}, 0.35)`);
    renderTonalPaletteDemo(seedHex);
    return scheme;
}
export function renderTonalPaletteDemo(seedHex) {
    const container = document.getElementById("tonal-swatches");
    if (!container)
        return;
    const base = hexToHsl(seedHex);
    const tones = [95, 90, 80, 70, 50, 40, 30, 20, 10];
    const tonesHtml = tones.map((t) => {
        const col = getTone(base.h, base.s, t);
        const textCol = t > 60 ? "#000000" : "#ffffff";
        return `<div class="tonal-swatch" style="background:${col};color:${textCol};" title="Tone ${t}: ${col}">
      <b>${t}</b>
      <span>${col}</span>
    </div>`;
    }).join("");
    container.innerHTML = tonesHtml;
}
export function initThemePicker() {
    const pills = document.querySelectorAll("[data-color]");
    const customPicker = document.getElementById("custom-seed-picker");
    const setActive = (color) => {
        pills.forEach((p) => p.classList.toggle("active", p.dataset.color?.toLowerCase() === color.toLowerCase()));
        const isDark = document.documentElement.dataset.theme !== "light";
        applyTheme(color, isDark);
    };
    pills.forEach((pill) => {
        pill.addEventListener("click", () => {
            const col = pill.dataset.color;
            if (col) {
                setActive(col);
                if (customPicker)
                    customPicker.value = col;
            }
        });
    });
    if (customPicker) {
        customPicker.addEventListener("input", (e) => {
            const col = e.target.value;
            setActive(col);
        });
    }
    // Initial render
    const initial = document.querySelector(".palette-pill.active")?.dataset.color || "#a855f7";
    const isDark = document.documentElement.dataset.theme !== "light";
    applyTheme(initial, isDark);
}
