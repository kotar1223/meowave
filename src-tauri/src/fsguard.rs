//! Is another app full screen next to the mini player?
//!
//! The mini player stays above every window, which is exactly wrong over a
//! full-screen game or video: it sat on top of them (round 6: "it broke full
//! screen everywhere"). While the mini player is pinned the frontend asks
//! this every couple of seconds and lets go of always-on-top for as long as
//! the answer is yes.

/// True while the foreground window of another process covers the whole
/// monitor the mini player is on.
#[tauri::command]
pub fn other_fullscreen(window: tauri::WebviewWindow) -> bool {
    #[cfg(target_os = "windows")]
    {
        match window.hwnd() {
            Ok(h) => win::foreground_fullscreen(h.0 as isize),
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // X11/Wayland compositors and macOS already keep a full-screen
        // window above "keep above" ones.
        let _ = window;
        false
    }
}

#[cfg(target_os = "windows")]
#[allow(non_snake_case, clippy::upper_case_acronyms)]
mod win {
    use std::ffi::c_void;

    type HWND = *mut c_void;
    type HMONITOR = *mut c_void;
    type BOOL = i32;

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct RECT {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[repr(C)]
    struct MONITORINFO {
        cbSize: u32,
        rcMonitor: RECT,
        rcWork: RECT,
        dwFlags: u32,
    }

    const MONITOR_DEFAULTTONULL: u32 = 0;

    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> HWND;
        fn GetShellWindow() -> HWND;
        fn GetDesktopWindow() -> HWND;
        fn GetWindowThreadProcessId(hWnd: HWND, lpdwProcessId: *mut u32) -> u32;
        fn IsWindowVisible(hWnd: HWND) -> BOOL;
        fn IsZoomed(hWnd: HWND) -> BOOL;
        fn IsIconic(hWnd: HWND) -> BOOL;
        fn GetClassNameW(hWnd: HWND, lpClassName: *mut u16, nMaxCount: i32) -> i32;
        fn GetWindowRect(hWnd: HWND, lpRect: *mut RECT) -> BOOL;
        fn MonitorFromWindow(hwnd: HWND, dwFlags: u32) -> HMONITOR;
        fn GetMonitorInfoW(hMonitor: HMONITOR, lpmi: *mut MONITORINFO) -> BOOL;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcessId() -> u32;
    }

    pub fn foreground_fullscreen(own: isize) -> bool {
        // SAFETY: plain Win32 queries on window handles; every out-pointer
        // points at a live, correctly sized local.
        unsafe {
            let fg = GetForegroundWindow();
            if fg.is_null() || fg as isize == own || fg == GetShellWindow() || fg == GetDesktopWindow() {
                return false;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, &mut pid);
            if pid == GetCurrentProcessId() || IsWindowVisible(fg) == 0 || IsIconic(fg) != 0 {
                return false;
            }
            // A maximised window spans the monitor too once the taskbar
            // auto-hides; full screen is never "zoomed".
            if IsZoomed(fg) != 0 {
                return false;
            }
            // The desktop and the taskbar span it as well.
            let mut buf = [0u16; 64];
            let n = GetClassNameW(fg, buf.as_mut_ptr(), buf.len() as i32).max(0) as usize;
            let class = String::from_utf16_lossy(&buf[..n.min(buf.len())]);
            if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                return false;
            }
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONULL);
            // Full screen on another monitor leaves the mini player alone.
            if mon.is_null() || mon != MonitorFromWindow(own as HWND, MONITOR_DEFAULTTONULL) {
                return false;
            }
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                rcMonitor: RECT::default(),
                rcWork: RECT::default(),
                dwFlags: 0,
            };
            let mut r = RECT::default();
            if GetMonitorInfoW(mon, &mut mi) == 0 || GetWindowRect(fg, &mut r) == 0 {
                return false;
            }
            let m = mi.rcMonitor;
            r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
        }
    }
}
