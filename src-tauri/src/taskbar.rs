//! Windows Taskbar Thumbnail Toolbar (playback controls beneath thumbnail preview)
//! and SMTC integration.

#[cfg(target_os = "windows")]
#[allow(non_snake_case, dead_code, clippy::upper_case_acronyms, clippy::manual_range_contains)]
mod win {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use tauri::{Emitter, WebviewWindow};

    pub type HWND = *mut c_void;
    pub type HICON = *mut c_void;
    pub type HBITMAP = *mut c_void;
    pub type BOOL = i32;
    pub type HRESULT = i32;

    pub const S_OK: HRESULT = 0;
    pub const WM_COMMAND: u32 = 0x0111;
    pub const WM_USER: u32 = 0x0400;
    pub const WM_UPDATE_PLAYING: u32 = WM_USER + 101;
    pub const WM_NCDESTROY: u32 = 0x0082;
    pub const THBN_CLICKED: usize = 0x1800;

    pub const THB_ICON: u32 = 0x2;
    pub const THB_TOOLTIP: u32 = 0x4;
    pub const THB_FLAGS: u32 = 0x8;
    pub const THBF_ENABLED: u32 = 0x0;

    #[repr(C)]
    pub struct GUID {
        pub data1: u32,
        pub data2: u16,
        pub data3: u16,
        pub data4: [u8; 8],
    }

    pub const CLSID_TASKBAR_LIST: GUID = GUID {
        data1: 0x56FDF344,
        data2: 0xFD6D,
        data3: 0x11d0,
        data4: [0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90],
    };

    pub const IID_ITASKBAR_LIST3: GUID = GUID {
        data1: 0xEA1AFB91,
        data2: 0x9E28,
        data3: 0x4B86,
        data4: [0x90, 0xE9, 0x9E, 0x9F, 0x8A, 0x5E, 0xEF, 0xAF],
    };

    #[repr(C)]
    pub struct THUMBBUTTON {
        pub dwMask: u32,
        pub iId: u32,
        pub iBitmap: u32,
        pub hIcon: HICON,
        pub szTip: [u16; 260],
        pub dwFlags: u32,
    }

    #[repr(C)]
    pub struct ICONINFO {
        pub fIcon: BOOL,
        pub xHotspot: u32,
        pub yHotspot: u32,
        pub hbmMask: HBITMAP,
        pub hbmColor: HBITMAP,
    }

    #[repr(C)]
    pub struct ITaskbarList3Vtbl {
        pub query_interface: unsafe extern "system" fn(this: *mut c_void, riid: *const GUID, ppv: *mut *mut c_void) -> HRESULT,
        pub add_ref: unsafe extern "system" fn(this: *mut c_void) -> u32,
        pub release: unsafe extern "system" fn(this: *mut c_void) -> u32,
        pub hr_init: unsafe extern "system" fn(this: *mut c_void) -> HRESULT,
        pub add_tab: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND) -> HRESULT,
        pub delete_tab: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND) -> HRESULT,
        pub activate_tab: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND) -> HRESULT,
        pub set_active_alt: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND) -> HRESULT,
        pub mark_fullscreen_window: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, f: BOOL) -> HRESULT,
        pub set_progress_value: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, c: u64, t: u64) -> HRESULT,
        pub set_progress_state: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, f: u32) -> HRESULT,
        pub register_tab: unsafe extern "system" fn(this: *mut c_void, tab: HWND, mdi: HWND) -> HRESULT,
        pub unregister_tab: unsafe extern "system" fn(this: *mut c_void, tab: HWND) -> HRESULT,
        pub set_tab_order: unsafe extern "system" fn(this: *mut c_void, tab: HWND, before: HWND) -> HRESULT,
        pub set_tab_active: unsafe extern "system" fn(this: *mut c_void, tab: HWND, mdi: HWND, f: u32) -> HRESULT,
        pub thumb_bar_add_buttons: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, c: u32, p: *const THUMBBUTTON) -> HRESULT,
        pub thumb_bar_update_buttons: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, c: u32, p: *const THUMBBUTTON) -> HRESULT,
        pub thumb_bar_set_image_list: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, himl: *mut c_void) -> HRESULT,
        pub set_overlay_icon: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, icon: HICON, tip: *const u16) -> HRESULT,
        pub set_thumbnail_tooltip: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, tip: *const u16) -> HRESULT,
        pub set_thumbnail_clip: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, clip: *const c_void) -> HRESULT,
    }

    #[repr(C)]
    pub struct ITaskbarList3 {
        pub lpVtbl: *const ITaskbarList3Vtbl,
    }

    pub type SubclassProc = unsafe extern "system" fn(
        hwnd: HWND,
        msg: u32,
        wparam: usize,
        lparam: isize,
        id_subclass: usize,
        ref_data: usize,
    ) -> isize;

    #[link(name = "ole32")]
    extern "system" {
        fn CoInitialize(pv: *mut c_void) -> HRESULT;
        fn CoCreateInstance(
            rclsid: *const GUID,
            pUnkOuter: *mut c_void,
            dwClsContext: u32,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> HRESULT;
    }

    #[link(name = "user32")]
    extern "system" {
        fn RegisterWindowMessageW(lpString: *const u16) -> u32;
        fn PostMessageW(hWnd: HWND, Msg: u32, wParam: usize, lParam: isize) -> BOOL;
        fn CreateIconIndirect(piconinfo: *mut ICONINFO) -> HICON;
        fn DestroyIcon(hicon: HICON) -> BOOL;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateBitmap(nWidth: i32, nHeight: i32, nPlanes: u32, nBitCount: u32, lpBits: *const c_void) -> HBITMAP;
        fn DeleteObject(ho: *mut c_void) -> BOOL;
    }

    #[link(name = "comctl32")]
    extern "system" {
        fn SetWindowSubclass(
            hWnd: HWND,
            pfnSubclass: SubclassProc,
            uIdSubclass: usize,
            dwRefData: usize,
        ) -> BOOL;
        fn RemoveWindowSubclass(
            hWnd: HWND,
            pfnSubclass: SubclassProc,
            uIdSubclass: usize,
        ) -> BOOL;
        fn DefSubclassProc(hWnd: HWND, uMsg: u32, wParam: usize, lParam: isize) -> isize;
    }

    static MAIN_WINDOW: OnceLock<WebviewWindow> = OnceLock::new();
    static mut TASKBAR_INSTANCE: *mut ITaskbarList3 = std::ptr::null_mut();
    static mut HWND_CACHE: HWND = std::ptr::null_mut();
    static mut ICON_PREV: HICON = std::ptr::null_mut();
    static mut ICON_PLAY: HICON = std::ptr::null_mut();
    static mut ICON_PAUSE: HICON = std::ptr::null_mut();
    static mut ICON_NEXT: HICON = std::ptr::null_mut();
    static mut WM_TASKBAR_BUTTON_CREATED: u32 = 0;
    static BUTTONS_ADDED: AtomicBool = AtomicBool::new(false);
    static CURRENT_PLAYING: AtomicBool = AtomicBool::new(false);

    pub fn to_u16_buf(s: &str) -> [u16; 260] {
        let mut buf = [0u16; 260];
        for (i, c) in s.encode_utf16().take(259).enumerate() {
            buf[i] = c;
        }
        buf
    }

    pub fn create_rgba_icon<F>(draw: F) -> HICON
    where
        F: Fn(i32, i32) -> bool,
    {
        const W: i32 = 20;
        const H: i32 = 20;
        let mut color_pixels = [0u32; (W * H) as usize];
        let mut mask_bytes = [0u8; 80];
        let stride = 4usize;

        for y in 0..H {
            for x in 0..W {
                let inside = draw(x, y);
                let idx = (y * W + x) as usize;
                if inside {
                    color_pixels[idx] = 0xFFFFFFFF; // Opaque White
                } else {
                    color_pixels[idx] = 0x00000000;
                    let byte_idx = (y as usize) * stride + (x as usize / 8);
                    let bit = 7 - (x % 8);
                    mask_bytes[byte_idx] |= 1 << bit;
                }
            }
        }

        unsafe {
            let hbm_color = CreateBitmap(W, H, 1, 32, color_pixels.as_ptr() as _);
            let hbm_mask = CreateBitmap(W, H, 1, 1, mask_bytes.as_ptr() as _);
            let mut info = ICONINFO {
                fIcon: 1,
                xHotspot: 0,
                yHotspot: 0,
                hbmMask: hbm_mask,
                hbmColor: hbm_color,
            };
            let icon = CreateIconIndirect(&mut info);
            DeleteObject(hbm_color);
            DeleteObject(hbm_mask);
            icon
        }
    }

    unsafe fn ensure_icons() {
        if ICON_PREV.is_null() {
            ICON_PREV = create_rgba_icon(|x, y| {
                (x >= 3 && x <= 4 && y >= 4 && y <= 15)
                || (x >= 6 && x <= 15 && ((y as f32 - 9.5).abs() <= ((15 - x) as f32) * 0.65))
            });
        }
        if ICON_PLAY.is_null() {
            ICON_PLAY = create_rgba_icon(|x, y| {
                x >= 6 && x <= 15 && ((y as f32 - 9.5).abs() <= ((x - 5) as f32) * 0.65)
            });
        }
        if ICON_PAUSE.is_null() {
            ICON_PAUSE = create_rgba_icon(|x, y| {
                y >= 4 && y <= 15 && ((x >= 5 && x <= 8) || (x >= 11 && x <= 14))
            });
        }
        if ICON_NEXT.is_null() {
            ICON_NEXT = create_rgba_icon(|x, y| {
                (x >= 4 && x <= 13 && ((y as f32 - 9.5).abs() <= ((x - 4) as f32) * 0.65))
                || (x >= 15 && x <= 16 && y >= 4 && y <= 15)
            });
        }
    }

    unsafe fn ensure_taskbar() -> *mut ITaskbarList3 {
        if !TASKBAR_INSTANCE.is_null() {
            return TASKBAR_INSTANCE;
        }
        let _ = CoInitialize(std::ptr::null_mut());
        let mut tbl: *mut c_void = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &CLSID_TASKBAR_LIST,
            std::ptr::null_mut(),
            1, // CLSCTX_INPROC_SERVER
            &IID_ITASKBAR_LIST3,
            &mut tbl,
        );
        if hr != S_OK || tbl.is_null() {
            return std::ptr::null_mut();
        }
        let taskbar = tbl as *mut ITaskbarList3;
        if ((*(*taskbar).lpVtbl).hr_init)(tbl) != S_OK {
            return std::ptr::null_mut();
        }
        TASKBAR_INSTANCE = taskbar;
        TASKBAR_INSTANCE
    }

    unsafe fn add_or_update_buttons(hwnd: HWND) {
        let taskbar = ensure_taskbar();
        if taskbar.is_null() || hwnd.is_null() {
            return;
        }
        ensure_icons();

        let playing = CURRENT_PLAYING.load(Ordering::Relaxed);
        let play_icon = if playing { ICON_PAUSE } else { ICON_PLAY };
        let play_tip = if playing { "Пауза" } else { "Воспроизведение" };

        let buttons = [
            THUMBBUTTON {
                dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
                iId: 1,
                iBitmap: 0,
                hIcon: ICON_PREV,
                szTip: to_u16_buf("Предыдущий трек"),
                dwFlags: THBF_ENABLED,
            },
            THUMBBUTTON {
                dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
                iId: 2,
                iBitmap: 0,
                hIcon: play_icon,
                szTip: to_u16_buf(play_tip),
                dwFlags: THBF_ENABLED,
            },
            THUMBBUTTON {
                dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
                iId: 3,
                iBitmap: 0,
                hIcon: ICON_NEXT,
                szTip: to_u16_buf("Следующий трек"),
                dwFlags: THBF_ENABLED,
            },
        ];

        let hr = ((*(*taskbar).lpVtbl).thumb_bar_add_buttons)(
            taskbar as *mut c_void,
            hwnd,
            3,
            buttons.as_ptr(),
        );
        if hr == S_OK {
            BUTTONS_ADDED.store(true, Ordering::Relaxed);
        } else {
            let _ = ((*(*taskbar).lpVtbl).thumb_bar_update_buttons)(
                taskbar as *mut c_void,
                hwnd,
                3,
                buttons.as_ptr(),
            );
            BUTTONS_ADDED.store(true, Ordering::Relaxed);
        }
    }

    unsafe fn update_play_pause(hwnd: HWND, playing: bool) {
        CURRENT_PLAYING.store(playing, Ordering::Relaxed);
        if !BUTTONS_ADDED.load(Ordering::Relaxed) {
            add_or_update_buttons(hwnd);
            return;
        }
        let taskbar = ensure_taskbar();
        if taskbar.is_null() || hwnd.is_null() {
            return;
        }
        ensure_icons();

        let play_icon = if playing { ICON_PAUSE } else { ICON_PLAY };
        let tip = if playing { "Пауза" } else { "Воспроизведение" };

        let btn = THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: 2,
            iBitmap: 0,
            hIcon: play_icon,
            szTip: to_u16_buf(tip),
            dwFlags: THBF_ENABLED,
        };

        let _ = ((*(*taskbar).lpVtbl).thumb_bar_update_buttons)(
            taskbar as *mut c_void,
            hwnd,
            1,
            &btn,
        );
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: usize,
        lparam: isize,
        _id_subclass: usize,
        _ref_data: usize,
    ) -> isize {
        if WM_TASKBAR_BUTTON_CREATED != 0 && msg == WM_TASKBAR_BUTTON_CREATED {
            add_or_update_buttons(hwnd);
            return 0;
        }
        if msg == WM_UPDATE_PLAYING {
            let playing = wparam != 0;
            update_play_pause(hwnd, playing);
            return 0;
        }
        if msg == WM_COMMAND && ((wparam >> 16) & 0xFFFF) == THBN_CLICKED {
            let btn_id = (wparam & 0xFFFF) as u32;
            if let Some(w) = MAIN_WINDOW.get() {
                match btn_id {
                    1 => { let _ = w.emit("meowave://media-action", "prev"); }
                    2 => { let _ = w.emit("meowave://media-action", "play_pause"); }
                    3 => { let _ = w.emit("meowave://media-action", "next"); }
                    _ => {}
                }
            }
            return 0;
        }
        if msg == WM_NCDESTROY {
            RemoveWindowSubclass(hwnd, subclass_proc, 4242);
            return DefSubclassProc(hwnd, msg, wparam, lparam);
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    pub fn init(window: &WebviewWindow) {
        let _ = MAIN_WINDOW.set(window.clone());
        let hwnd_raw = match window.hwnd() {
            Ok(h) => h.0 as HWND,
            Err(_) => return,
        };

        unsafe {
            HWND_CACHE = hwnd_raw;
            let msg_name: Vec<u16> = "TaskbarButtonCreated\0".encode_utf16().collect();
            WM_TASKBAR_BUTTON_CREATED = RegisterWindowMessageW(msg_name.as_ptr());

            SetWindowSubclass(hwnd_raw, subclass_proc, 4242, 0);
            add_or_update_buttons(hwnd_raw);
        }
    }

    pub fn set_playing(playing: bool) {
        CURRENT_PLAYING.store(playing, Ordering::Relaxed);
        unsafe {
            if !HWND_CACHE.is_null() {
                let _ = PostMessageW(
                    HWND_CACHE,
                    WM_UPDATE_PLAYING,
                    if playing { 1 } else { 0 },
                    0,
                );
            }
        }
    }

    pub fn test_icons_valid() -> bool {
        let prev = create_rgba_icon(|x, y| x > y);
        let valid = !prev.is_null();
        if valid {
            unsafe {
                DestroyIcon(prev);
            }
        }
        valid
    }
}

#[tauri::command]
pub fn taskbar_set_playing(playing: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    win::set_playing(playing);
    let _ = playing;
    Ok(())
}

pub fn init_window(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    win::init(window);
    let _ = window;
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    #[test]
    #[cfg(target_os = "windows")]
    fn test_taskbar_icons_creation() {
        assert!(win::test_icons_valid(), "create_rgba_icon should return a valid non-null HICON");
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_thumbbutton_layout() {
        assert_eq!(std::mem::size_of::<win::THUMBBUTTON>(), 552);
        assert_eq!(std::mem::align_of::<win::THUMBBUTTON>(), 8);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_to_u16_buf() {
        let buf = win::to_u16_buf("Test Tip");
        assert_eq!(buf[0], 'T' as u16);
        assert_eq!(buf[1], 'e' as u16);
        assert_eq!(buf[2], 's' as u16);
        assert_eq!(buf[3], 't' as u16);
        assert_eq!(buf[4], ' ' as u16);
        assert_eq!(buf[5], 'T' as u16);
        assert_eq!(buf[6], 'i' as u16);
        assert_eq!(buf[7], 'p' as u16);
        assert_eq!(buf[8], 0);
        assert_eq!(buf[259], 0);
    }
}

