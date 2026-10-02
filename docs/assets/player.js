/**
 * Interactive Demo Player for Meowave Landing Page
 * Simulates playback with visualizer, karaoke lyrics, and seek control.
 */
export const DEMO_TRACKS = [
    {
        id: "1",
        title: "Get Lucky",
        artist: "Daft Punk ft. Pharrell Williams",
        album: "Random Access Memories",
        duration: 248,
        service: "sp",
        serviceName: "Spotify",
        art: "assets/icon.png",
        lyrics: [
            { at: 0, text: "Like the legend of the phoenix" },
            { at: 4, text: "All ends with beginnings" },
            { at: 8, text: "What keeps the planet spinning" },
            { at: 12, text: "The force from the beginning" },
            { at: 16, text: "We've come too far to give up who we are" },
            { at: 24, text: "So let's raise the bar and our cups to the stars" },
            { at: 32, text: "She's up all night 'til the sun" },
            { at: 36, text: "I'm up all night to get some" },
            { at: 40, text: "She's up all night for good fun" },
            { at: 44, text: "I'm up all night to get lucky" }
        ]
    },
    {
        id: "2",
        title: "Звезда по имени Солнце",
        artist: "Кино",
        album: "Звезда по имени Солнце",
        duration: 225,
        service: "ym",
        serviceName: "Яндекс Музыка",
        art: "assets/icon.png",
        lyrics: [
            { at: 0, text: "Белый снег, серый лёд, на растрескавшейся земле" },
            { at: 8, text: "Одеялом лоскутным на ней — город в дорожной петле" },
            { at: 16, text: "А над городом плывут облака, закрывая небесный свет" },
            { at: 24, text: "А над городом — жёлтый дым, городу две тысячи лет" },
            { at: 32, text: "Прожитых под светом Звезды по имени Солнце…" }
        ]
    },
    {
        id: "3",
        title: "Blinding Lights",
        artist: "The Weeknd",
        album: "After Hours",
        duration: 200,
        service: "ytm",
        serviceName: "YouTube Music",
        art: "assets/icon.png",
        lyrics: [
            { at: 0, text: "Yeah..." },
            { at: 6, text: "I've been tryna call" },
            { at: 10, text: "I've been on my own for long enough" },
            { at: 14, text: "Maybe you can show me how to love, maybe" },
            { at: 20, text: "I'm going through withdrawals" },
            { at: 26, text: "You don't even have to do too much" },
            { at: 30, text: "You can turn me on with just a touch, baby" },
            { at: 36, text: "I look around and Sin City's cold and empty" },
            { at: 42, text: "No one's around to judge me" },
            { at: 46, text: "I can't see clearly when you're gone" }
        ]
    }
];
export class DemoPlayer {
    currentTrackIdx = 0;
    isPlaying = false;
    currentTime = 14;
    animationFrameId = 0;
    lastTimestamp = 0;
    // DOM Elements
    playBtn = null;
    prevBtn = null;
    nextBtn = null;
    titleEl = null;
    artistEl = null;
    timeEl = null;
    seekEl = null;
    lyricsContainer = null;
    canvas = null;
    ctx = null;
    srvChip = null;
    constructor() {
        this.playBtn = document.getElementById("demo-play-btn");
        this.prevBtn = document.getElementById("demo-prev-btn");
        this.nextBtn = document.getElementById("demo-next-btn");
        this.titleEl = document.getElementById("demo-track-title");
        this.artistEl = document.getElementById("demo-track-artist");
        this.timeEl = document.getElementById("demo-track-time");
        this.seekEl = document.getElementById("demo-seek-bar");
        this.lyricsContainer = document.getElementById("demo-lyrics-list");
        this.canvas = document.getElementById("demo-visualizer-canvas");
        this.srvChip = document.getElementById("demo-track-srv");
        if (this.canvas) {
            this.ctx = this.canvas.getContext("2d");
            this.resizeCanvas();
            window.addEventListener("resize", () => this.resizeCanvas());
        }
        this.bindEvents();
        this.updateTrackUI();
        this.startLoop();
    }
    resizeCanvas() {
        if (!this.canvas)
            return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        if (this.ctx) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }
    bindEvents() {
        this.playBtn?.addEventListener("click", () => this.togglePlay());
        this.prevBtn?.addEventListener("click", () => this.prevTrack());
        this.nextBtn?.addEventListener("click", () => this.nextTrack());
        if (this.seekEl) {
            this.seekEl.addEventListener("input", (e) => {
                const val = Number(e.target.value);
                this.currentTime = (val / 100) * this.currentTrack.duration;
                this.updateTimeDisplay();
                this.syncLyrics();
            });
        }
        // Row selection in mock playlist
        document.querySelectorAll(".mrow").forEach((row, i) => {
            row.addEventListener("click", () => {
                this.currentTrackIdx = i % DEMO_TRACKS.length;
                this.currentTime = 0;
                this.isPlaying = true;
                this.updateTrackUI();
            });
        });
    }
    get currentTrack() {
        return DEMO_TRACKS[this.currentTrackIdx];
    }
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        this.updatePlayStateUI();
    }
    nextTrack() {
        this.currentTrackIdx = (this.currentTrackIdx + 1) % DEMO_TRACKS.length;
        this.currentTime = 0;
        this.updateTrackUI();
    }
    prevTrack() {
        this.currentTrackIdx = (this.currentTrackIdx - 1 + DEMO_TRACKS.length) % DEMO_TRACKS.length;
        this.currentTime = 0;
        this.updateTrackUI();
    }
    updateTrackUI() {
        const tr = this.currentTrack;
        if (this.titleEl)
            this.titleEl.textContent = tr.title;
        if (this.artistEl)
            this.artistEl.textContent = `${tr.artist} · ${tr.album}`;
        if (this.srvChip) {
            this.srvChip.textContent = tr.serviceName;
            this.srvChip.setAttribute("data-srv", tr.service);
        }
        document.querySelectorAll(".mrow").forEach((row, i) => {
            row.setAttribute("data-on", String(i === this.currentTrackIdx));
        });
        this.renderLyrics();
        this.updatePlayStateUI();
        this.updateTimeDisplay();
    }
    updatePlayStateUI() {
        if (!this.playBtn)
            return;
        this.playBtn.innerHTML = this.isPlaying
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>`;
        this.playBtn.setAttribute("aria-label", this.isPlaying ? "Pause" : "Play");
    }
    formatTime(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    }
    updateTimeDisplay() {
        if (this.timeEl) {
            this.timeEl.textContent = `${this.formatTime(this.currentTime)} / ${this.formatTime(this.currentTrack.duration)}`;
        }
        if (this.seekEl) {
            const pct = (this.currentTime / this.currentTrack.duration) * 100;
            this.seekEl.value = pct.toFixed(1);
            this.seekEl.style.setProperty("--fill", `${pct}%`);
        }
    }
    renderLyrics() {
        if (!this.lyricsContainer)
            return;
        this.lyricsContainer.innerHTML = this.currentTrack.lyrics.map((l, i) => `<p class="demo-lyric-line" data-idx="${i}" data-at="${l.at}">
        <span class="ly-text">${l.text}</span>
      </p>`).join("");
    }
    syncLyrics() {
        if (!this.lyricsContainer)
            return;
        const lines = this.currentTrack.lyrics;
        let activeIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (this.currentTime >= lines[i].at) {
                activeIdx = i;
            }
            else {
                break;
            }
        }
        const elements = this.lyricsContainer.querySelectorAll(".demo-lyric-line");
        elements.forEach((el, i) => {
            const isActive = i === activeIdx;
            el.classList.toggle("active", isActive);
            if (isActive) {
                const nextLine = lines[i + 1];
                const lineDuration = nextLine ? (nextLine.at - lines[i].at) : 4;
                const progress = Math.min(100, Math.max(0, ((this.currentTime - lines[i].at) / Math.max(0.2, lineDuration)) * 100));
                el.style.setProperty("--karaoke-pct", `${progress.toFixed(1)}%`);
                // Smooth scroll into view inside container
                const cont = this.lyricsContainer;
                if (cont && el instanceof HTMLElement) {
                    const top = el.offsetTop - cont.offsetTop - cont.clientHeight / 2 + el.clientHeight / 2;
                    cont.scrollTo({ top, behavior: "smooth" });
                }
            }
            else {
                el.style.setProperty("--karaoke-pct", i < activeIdx ? "100%" : "0%");
            }
        });
    }
    startLoop() {
        this.lastTimestamp = performance.now();
        const frame = (now) => {
            const dt = (now - this.lastTimestamp) / 1000;
            this.lastTimestamp = now;
            if (this.isPlaying) {
                this.currentTime += dt;
                if (this.currentTime >= this.currentTrack.duration) {
                    this.nextTrack();
                }
                else {
                    this.updateTimeDisplay();
                    this.syncLyrics();
                }
            }
            this.drawVisualizer(now);
            this.animationFrameId = requestAnimationFrame(frame);
        };
        this.animationFrameId = requestAnimationFrame(frame);
    }
    drawVisualizer(now) {
        if (!this.ctx || !this.canvas)
            return;
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);
        const barCount = 36;
        const spacing = 4;
        const barWidth = (w - (barCount - 1) * spacing) / barCount;
        const t = now / 1000;
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#a855f7";
        ctx.fillStyle = accentColor;
        for (let i = 0; i < barCount; i++) {
            let height = 4;
            if (this.isPlaying) {
                const wave1 = Math.sin(t * 5 + i * 0.28);
                const wave2 = Math.cos(t * 3.2 - i * 0.45);
                const beat = (Math.sin(t * 8) + 1) * 0.3;
                height = Math.max(6, (Math.abs(wave1 * 0.6 + wave2 * 0.4) + beat) * (h * 0.85));
            }
            else {
                height = 4 + Math.sin(t * 1.5 + i * 0.2) * 2;
            }
            const x = i * (barWidth + spacing);
            const y = h - height;
            const radius = Math.min(barWidth / 2, 4);
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, height, [radius, radius, 0, 0]);
            ctx.fill();
        }
    }
}
