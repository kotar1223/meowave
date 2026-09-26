# Development shell for Meowave on NixOS.
#
#   nix-shell --run 'npm run dev'     # run the app
#   nix-shell                         # or enter and type commands by hand
#
# Everything the Linux build and the WebKitGTK webview need: the GTK/WebKit
# stack for compiling Tauri, and the GStreamer plugins the webview plays audio
# through (without base/good/libav the window opens but <audio> stays silent).
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = with pkgs; [
    pkg-config dbus glib gtk3 webkitgtk_4_1 libsoup_3
    libayatana-appindicator librsvg openssl
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
    gst_all_1.gst-libav
  ];
}
