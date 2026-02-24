use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemKind, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

const MAX_RECENT: usize = 10;

/// Holds a file path queued by macOS "Open With" before the frontend was ready.
struct PendingFile(Mutex<Option<String>>);

/// Ordered list of recently opened file paths (most recent first).
struct RecentFiles(Mutex<Vec<String>>);

// ── Path helpers ──────────────────────────────────────────────────────────────

fn path_basename(path: &str) -> &str {
    path.rfind(|c| c == '/' || c == '\\')
        .map(|i| &path[i + 1..])
        .unwrap_or(path)
}

fn recent_storage_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("recent-files.json"))
}

// ── Persistence ───────────────────────────────────────────────────────────────

fn load_recent_from_disk(app: &tauri::AppHandle) -> Vec<String> {
    let Some(path) = recent_storage_path(app) else {
        return vec![];
    };
    let Ok(content) = std::fs::read_to_string(&path) else {
        return vec![];
    };
    serde_json::from_str::<Vec<String>>(&content)
        .unwrap_or_default()
        .into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .take(MAX_RECENT)
        .collect()
}

fn save_recent_to_disk(app: &tauri::AppHandle, files: &[String]) {
    let Some(path) = recent_storage_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(files) {
        let _ = std::fs::write(&path, json);
    }
}

// ── Dynamic menu rebuild ──────────────────────────────────────────────────────

/// Clear and repopulate the "Open Recent" submenu from the current RecentFiles state.
fn rebuild_recent_menu(app: &tauri::AppHandle) {
    let Some(menu) = app.menu() else { return };
    let Some(item_kind) = menu.get("open_recent") else { return };
    let MenuItemKind::Submenu(submenu) = item_kind else { return };

    // Remove every existing item from the submenu.
    if let Ok(items) = submenu.items() {
        for item in items {
            let _ = match item {
                MenuItemKind::MenuItem(i) => submenu.remove(&i),
                MenuItemKind::Predefined(i) => submenu.remove(&i),
                MenuItemKind::Check(i) => submenu.remove(&i),
                MenuItemKind::Icon(i) => submenu.remove(&i),
                MenuItemKind::Submenu(i) => submenu.remove(&i),
            };
        }
    }

    let files = app.state::<RecentFiles>().0.lock().unwrap().clone();

    if files.is_empty() {
        if let Ok(item) = MenuItem::with_id(app, "no_recent", "No Recent Items", false, None::<&str>) {
            let _ = submenu.append(&item);
        }
    } else {
        for (i, path) in files.iter().enumerate() {
            let label = path_basename(path);
            let id = format!("recent_{i}");
            if let Ok(item) = MenuItem::with_id(app, id, label, true, None::<&str>) {
                let _ = submenu.append(&item);
            }
        }
        if let Ok(sep) = PredefinedMenuItem::separator(app) {
            let _ = submenu.append(&sep);
        }
        if let Ok(clear) = MenuItem::with_id(app, "clear_recent", "Clear Recent Items", true, None::<&str>) {
            let _ = submenu.append(&clear);
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Called by the frontend after opening a file; pushes it to the top of
/// the recent list (deduplicated) and rebuilds the native menu.
#[tauri::command]
fn add_recent_file(app: tauri::AppHandle, path: String) {
    {
        let state = app.state::<RecentFiles>();
        let mut files = state.0.lock().unwrap();
        files.retain(|p| p != &path);   // remove existing occurrence
        files.insert(0, path);           // push to front
        files.truncate(MAX_RECENT);
        save_recent_to_disk(&app, &files);
    }
    rebuild_recent_menu(&app);
}

/// Returns and clears the file path that was pending before the frontend loaded.
#[tauri::command]
fn get_opened_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Install the Quick Look generator for markdown preview in Finder.
#[tauri::command]
fn install_quicklook_plugin(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;

        let src = resource_dir.join("resources").join("UpDownQuickLook.app");
        if !src.exists() {
            let alt_src = resource_dir.join("UpDownQuickLook.app");
            if !alt_src.exists() {
                return Err(format!(
                    "Quick Look app not found in app bundle. Checked:\n  {}\n  {}",
                    src.display(),
                    alt_src.display()
                ));
            }
            return install_ql_from(&alt_src);
        }
        return install_ql_from(&src);
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Quick Look is only available on macOS".to_string())
    }
}

#[cfg(target_os = "macos")]
fn install_ql_from(src: &std::path::Path) -> Result<String, String> {
    use std::fs;
    use std::process::Command;

    let home = std::env::var("HOME").map_err(|_| "Cannot determine HOME directory".to_string())?;
    let apps_dir = PathBuf::from(&home).join("Applications");

    if !apps_dir.exists() {
        fs::create_dir_all(&apps_dir)
            .map_err(|e| format!("Failed to create {}: {}", apps_dir.display(), e))?;
    }

    let dest = apps_dir.join("UpDownQuickLook.app");

    if dest.exists() {
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to remove old Quick Look app: {}", e))?;
    }

    copy_dir_recursive(src, &dest)
        .map_err(|e| format!("Failed to copy Quick Look app: {}", e))?;

    let appex = dest.join("Contents").join("PlugIns").join("UpDownPreview.appex");
    if appex.exists() {
        let path = appex.to_string_lossy();
        let _ = Command::new("pluginkit").args(["-a", path.as_ref()]).output();
        let _ = Command::new("pluginkit")
            .args(["-e", "use", "-i", "com.noam.updown.quicklook.preview"])
            .output();
    }

    let _ = Command::new("/usr/bin/open").arg(&dest).output();
    Ok(format!("Quick Look extension installed to {}", dest.display()))
}

#[cfg(target_os = "macos")]
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    use std::fs;
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

// ── Frontend bridge ───────────────────────────────────────────────────────────

fn open_file_in_running_app(app: &tauri::AppHandle, path_str: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let escaped = path_str.replace('\\', "\\\\").replace('\'', "\\'");
        let js = format!("window.__openFile && window.__openFile('{}')", escaped);
        let _ = window.eval(&js);
    }
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(PendingFile(Mutex::new(None)))
        .manage(RecentFiles(Mutex::new(vec![])))
        .invoke_handler(tauri::generate_handler![
            get_opened_file,
            install_quicklook_plugin,
            add_recent_file
        ])
        .setup(|app| {
            // Load persisted recent files and seed state.
            let initial_recent = load_recent_from_disk(app.handle());
            *app.state::<RecentFiles>().0.lock().unwrap() = initial_recent.clone();

            // ── App menu ──────────────────────────────────────────────────────
            let about_item = MenuItem::with_id(app, "about", "About UpDown", true, None::<&str>)?;

            let app_menu = SubmenuBuilder::new(app, "UpDown")
                .item(&about_item)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None::<&str>)?)
                .item(&PredefinedMenuItem::hide_others(app, None::<&str>)?)
                .item(&PredefinedMenuItem::show_all(app, None::<&str>)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None::<&str>)?)
                .build()?;

            // ── File menu ─────────────────────────────────────────────────────
            let open_item = MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
            let save_item = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_as_item = MenuItem::with_id(app, "save_as", "Save As…", true, Some("CmdOrCtrl+Shift+S"))?;
            let install_ql_item = MenuItem::with_id(app, "install_quicklook", "Install Quick Look Plugin…", true, None::<&str>)?;

            // Build the "Open Recent" submenu.
            let mut recent_builder = SubmenuBuilder::new(app, "Open Recent").id("open_recent");
            if initial_recent.is_empty() {
                let no_recent = MenuItem::with_id(app, "no_recent", "No Recent Items", false, None::<&str>)?;
                recent_builder = recent_builder.item(&no_recent);
            } else {
                for (i, path) in initial_recent.iter().enumerate() {
                    let label = path_basename(path);
                    let id = format!("recent_{i}");
                    let item = MenuItem::with_id(app, id, label, true, None::<&str>)?;
                    recent_builder = recent_builder.item(&item);
                }
                let clear_init = MenuItem::with_id(app, "clear_recent", "Clear Recent Items", true, None::<&str>)?;
                recent_builder = recent_builder.separator().item(&clear_init);
            }
            let recent_submenu = recent_builder.build()?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&open_item)
                .item(&recent_submenu)
                .separator()
                .item(&save_item)
                .item(&save_as_item)
                .separator()
                .item(&install_ql_item)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None::<&str>)?)
                .build()?;

            // ── Edit menu ─────────────────────────────────────────────────────
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None::<&str>)?)
                .item(&PredefinedMenuItem::redo(app, None::<&str>)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None::<&str>)?)
                .item(&PredefinedMenuItem::copy(app, None::<&str>)?)
                .item(&PredefinedMenuItem::paste(app, None::<&str>)?)
                .item(&PredefinedMenuItem::select_all(app, None::<&str>)?)
                .build()?;

            // ── View menu ─────────────────────────────────────────────────────
            let toggle_folder_item = MenuItem::with_id(app, "toggle_folder", "Toggle Folder Panel", true, Some("CmdOrCtrl+B"))?;
            let source_item = MenuItem::with_id(app, "view_source", "Source", true, Some("CmdOrCtrl+1"))?;
            let preview_item = MenuItem::with_id(app, "view_preview", "Preview", true, Some("CmdOrCtrl+2"))?;
            let split_item = MenuItem::with_id(app, "view_split", "Split", true, Some("CmdOrCtrl+3"))?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&toggle_folder_item)
                .separator()
                .item(&source_item)
                .item(&preview_item)
                .item(&split_item)
                .build()?;

            // ── Window menu ───────────────────────────────────────────────────
            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None::<&str>)?)
                .item(&PredefinedMenuItem::maximize(app, None::<&str>)?)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(app, None::<&str>)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            match id {
                "about" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.eval("window.__menuAction && window.__menuAction('about')");
                    }
                }
                "install_quicklook" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.eval("window.__menuAction && window.__menuAction('installQuickLook')");
                    }
                }
                "clear_recent" => {
                    {
                        let state = app.state::<RecentFiles>();
                        let mut files = state.0.lock().unwrap();
                        files.clear();
                        save_recent_to_disk(app, &files);
                    }
                    rebuild_recent_menu(app);
                }
                id if id.starts_with("recent_") => {
                    if let Ok(idx) = id["recent_".len()..].parse::<usize>() {
                        let path = app
                            .state::<RecentFiles>()
                            .0
                            .lock()
                            .unwrap()
                            .get(idx)
                            .cloned();
                        if let Some(path) = path {
                            open_file_in_running_app(app, &path);
                        }
                    }
                }
                "open" | "save" | "save_as" | "toggle_folder"
                | "view_source" | "view_preview" | "view_split" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let action = match id {
                            "open" => "open",
                            "save" => "save",
                            "save_as" => "saveAs",
                            "toggle_folder" => "toggleFolder",
                            "view_source" => "viewSource",
                            "view_preview" => "viewPreview",
                            "view_split" => "viewSplit",
                            _ => return,
                        };
                        let js = format!(
                            "window.__menuAction && window.__menuAction('{}')",
                            action
                        );
                        let _ = w.eval(&js);
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = event {
            let files: Vec<PathBuf> = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect();

            if let Some(file) = files.first() {
                let path_str = file.to_string_lossy().to_string();

                if let Some(state) = app_handle.try_state::<PendingFile>() {
                    *state.0.lock().unwrap() = Some(path_str.clone());
                }

                open_file_in_running_app(app_handle, &path_str);
            }
        }
    });
}
