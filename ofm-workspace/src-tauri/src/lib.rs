#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            #[cfg(desktop)]
            {
                let _ = _app.handle().plugin(tauri_plugin_updater::Builder::new().build());
            }
            // On desktop, associate our custom URL scheme at runtime so auth
            // deep links (ofm://auth/callback) reach the running app during dev.
            // In a packaged .app the scheme also comes from the generated
            // Info.plist. Errors here are non-fatal (e.g. unsupported paths).
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
