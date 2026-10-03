/**
 * Meowave Material 3 / Material Symbols Icon Engine
 * Translates Lucide / M3 icon attributes into Google Material Symbols Rounded ligatures.
 * Provides backwards compatibility for `lucide.createIcons()` and full M3 dynamic styling.
 */
(function(window, document) {
  "use strict";

  const LUCIDE_TO_MATERIAL = {
    // Navigation Rail & Sections
    "audio-lines": "graphic_eq",
    "search": "search",
    "list-music": "queue_music",
    "users-round": "group",
    "users": "group",
    "user": "person",
    "user-plus": "person_add",
    "user-minus": "person_remove",
    "user-x": "person_off",
    "radio-tower": "podcasts",
    "trophy": "trophy",
    "circle-user-round": "account_circle",
    "settings": "settings",

    // Playback & Audio Controls
    "play": "play_arrow",
    "pause": "pause",
    "skip-back": "skip_previous",
    "skip-forward": "skip_next",
    "shuffle": "shuffle",
    "repeat": "repeat",
    "repeat-1": "repeat_one",
    "volume-2": "volume_up",
    "volume-1": "volume_down",
    "volume-x": "volume_off",
    "volume": "volume_up",
    "orbit": "spatial_audio",
    "mic-2": "lyrics",
    "mic": "mic",
    "music": "music_note",
    "disc": "album",
    "maximize": "fullscreen",
    "maximize-2": "fullscreen",
    "minimize": "fullscreen_exit",
    "sliders": "tune",
    "sliders-horizontal": "tune",

    // Actions & Buttons
    "heart": "favorite",
    "thumbs-down": "thumb_down",
    "thumbs-up": "thumb_up",
    "list-plus": "playlist_add",
    "list-end": "queue_music",
    "plus": "add",
    "x": "close",
    "close": "close",
    "check": "check",
    "check-circle": "check_circle",
    "chevron-down": "expand_more",
    "chevron-up": "expand_less",
    "chevron-right": "chevron_right",
    "chevron-left": "chevron_left",
    "arrow-left": "arrow_back",
    "arrow-right": "arrow_forward",
    "circle-slash": "block",

    // Library, Media & Files
    "download-cloud": "cloud_download",
    "download": "download",
    "upload-cloud": "cloud_upload",
    "upload": "upload",
    "folder": "folder",
    "file-text": "description",
    "image": "image",
    "image-off": "hide_image",
    "trash-2": "delete",
    "trash": "delete",
    "pencil": "edit",
    "pin": "push_pin",
    "copy": "content_copy",
    "eraser": "ink_eraser",
    "history": "history",
    "timer": "timer",
    "clock": "schedule",

    // Social, Chat & Rooms
    "message-circle": "chat_bubble",
    "message-square": "chat_bubble",
    "message-square-dashed": "chat_bubble_outline",
    "message-square-plus": "add_comment",
    "send": "send",
    "reply": "reply",
    "corner-down-right": "subdirectory_arrow_right",

    // Misc & Utilities
    "sparkles": "auto_awesome",
    "wand-2": "auto_fix_high",
    "key": "key",
    "log-in": "login",
    "log-out": "logout",
    "rotate-ccw": "restart_alt",
    "zap": "bolt",
    "compass": "explore",
    "award": "military_tech",
    "bell": "notifications",
    "info": "info",
    "alert-triangle": "warning",
    "alert-circle": "error"
  };

  function toSymbolName(name) {
    if (!name) return "";
    const clean = String(name).trim();
    if (LUCIDE_TO_MATERIAL[clean]) return LUCIDE_TO_MATERIAL[clean];
    return clean.replace(/-/g, "_");
  }

  function createIcons(options) {
    const opts = options || {};
    const root = opts.root || document;
    const nameAttr = opts.nameAttr || "data-lucide";
    const selector = `[${nameAttr}], [data-icon], [data-ms-icon], i.material-symbols-rounded, span.material-symbols-rounded`;
    
    let targets;
    try {
      targets = root.querySelectorAll(selector);
    } catch (e) {
      return;
    }

    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      const rawName = el.getAttribute(nameAttr) || el.getAttribute("data-icon") || el.getAttribute("data-ms-icon") || el.dataset?.icon || el.textContent?.trim();
      if (!rawName) continue;

      const sym = toSymbolName(rawName);
      if (!sym) continue;

      if (!el.classList.contains("material-symbols-rounded")) {
        el.classList.add("material-symbols-rounded");
      }
      el.classList.remove("lucide", `lucide-${rawName}`);
      el.setAttribute("aria-hidden", "true");
      el.dataset.icon = sym;

      const w = el.getAttribute("width");
      const h = el.getAttribute("height");
      if (w) {
        el.style.fontSize = w + "px";
        el.style.width = w + "px";
        el.style.height = (h || w) + "px";
      }

      if (el.textContent !== sym) {
        el.textContent = sym;
      }
    }
  }

  const m3Icons = {
    createIcons: createIcons,
    toSymbolName: toSymbolName,
    mapping: LUCIDE_TO_MATERIAL
  };

  window.m3Icons = m3Icons;
  window.toMaterialSymbol = toSymbolName;
  // Provide full drop-in compatibility for existing window.lucide callers
  window.lucide = {
    createIcons: createIcons,
    icons: LUCIDE_TO_MATERIAL
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      createIcons();
    });
  } else {
    createIcons();
  }
})(window, document);
