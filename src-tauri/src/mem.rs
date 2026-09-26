//! Memory readout for the About panel.
//!
//! The question behind it is "what does this app actually cost", and the honest
//! answer is never just our own process: on Windows WebView2 renders in its own
//! `msedgewebview2.exe` processes, WebKitGTK and WKWebView spawn web processes
//! as well. Reporting only our RSS would advertise ~40 MB for a window that
//! really costs several hundred, so the number is this process plus every
//! descendant, with the split shown so it can be explained.
//!
//! sysinfo walks that tree through one API on all three platforms, which keeps
//! per-OS unsafe code out of this repository.

use std::collections::{HashMap, HashSet};

use sysinfo::{Pid, System};

#[derive(serde::Serialize)]
pub struct MemInfo {
    /// This process alone (backend, proxy, Rust side of everything).
    pub self_mb: u64,
    /// Every descendant: the webview and its renderer/GPU processes.
    pub children_mb: u64,
    /// What the whole window costs.
    pub total_mb: u64,
    /// How many processes went into that number.
    pub procs: usize,
}

const MB: u64 = 1024 * 1024;

/// Walk over the process tree rooted at our own pid.
///
/// sysinfo dropped `Process::children()`; the parent link is the only
/// relationship it still exposes, so the tree is inverted once — every
/// process contributes exactly one entry — and then walked from the root.
fn descendants(sys: &System, root: Pid) -> Vec<Pid> {
    let mut by_parent: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, p) in sys.processes() {
        if let Some(parent) = p.parent() {
            by_parent.entry(parent).or_default().push(*pid);
        }
    }

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut queue = vec![root];
    seen.insert(root);
    while let Some(pid) = queue.pop() {
        let Some(children) = by_parent.get(&pid) else { continue };
        for &child in children {
            if seen.insert(child) {
                out.push(child);
                queue.push(child);
            }
        }
    }
    out
}

/// Reads the footprint on demand — the button in Настройки → О приложении.
/// Polling it would keep a whole `System` snapshot alive for a number nobody
/// is looking at.
#[tauri::command]
pub fn mem_info() -> MemInfo {
    let sys = System::new_all();
    let me = Pid::from_u32(std::process::id());
    let own = sys.process(me).map(|p| p.memory()).unwrap_or(0) / MB;

    // Sum in bytes and convert once: rounding each process first would drop
    // every one of them below a megabyte to zero.
    let kids = descendants(&sys, me);
    let children: u64 = kids
        .iter()
        .filter_map(|pid| sys.process(*pid))
        .map(|p| p.memory())
        .sum::<u64>()
        / MB;

    MemInfo {
        self_mb: own,
        children_mb: children,
        total_mb: own + children,
        procs: kids.len() + 1,
    }
}
