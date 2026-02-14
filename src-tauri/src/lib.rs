use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

/// Holds a file path queued by macOS "Open With" before the frontend was ready.
struct PendingFile(Mutex<Option<String>>);

/// Tauri command: returns and clears the pending file path (if any).
/// Called by the frontend on DOMContentLoaded to pick up a file that
/// triggered the app launch.
#[tauri::command]
fn get_opened_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Tauri command: install the Quick Look generator for markdown preview in Finder.
/// Copies UpDownMarkdown.qlgenerator from the app bundle's resources to
/// ~/Library/QuickLook/ and refreshes the Quick Look generator list.
#[tauri::command]
fn install_quicklook_plugin(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        // Resolve the bundled UpDownQuickLook.app from the app's resource directory
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

    // Create ~/Applications/ if it doesn't exist
    if !apps_dir.exists() {
        fs::create_dir_all(&apps_dir)
            .map_err(|e| format!("Failed to create {}: {}", apps_dir.display(), e))?;
    }

    let dest = apps_dir.join("UpDownQuickLook.app");

    // Remove existing version if present
    if dest.exists() {
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to remove old Quick Look app: {}", e))?;
    }

    // Copy the .app bundle (recursive directory copy)
    copy_dir_recursive(src, &dest)
        .map_err(|e| format!("Failed to copy Quick Look app: {}", e))?;

    // Open the app briefly so macOS discovers the embedded extension
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

/// Forward a file path to the frontend for the "app already running" case.
/// Uses window.eval() which works reliably when the page is already loaded.
fn open_file_in_running_app(app: &tauri::AppHandle, path_str: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let escaped = path_str.replace('\\', "\\\\").replace('\'', "\\'");
        let js = format!("window.__openFile && window.__openFile('{}')", escaped);
        let _ = window.eval(&js);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(PendingFile(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_opened_file, install_quicklook_plugin])
        .setup(|app| {
            // App menu (first submenu becomes the app menu on macOS)
            let app_menu = SubmenuBuilder::new(app, "UpDown")
                .item(&PredefinedMenuItem::about(app, None::<&str>, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None::<&str>)?)
                .item(&PredefinedMenuItem::hide_others(app, None::<&str>)?)
                .item(&PredefinedMenuItem::show_all(app, None::<&str>)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None::<&str>)?)
                .build()?;

            // File menu with Open, Save, and Save As
            let open_item =
                MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
            let save_item =
                MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_as_item =
                MenuItem::with_id(app, "save_as", "Save As…", true, Some("CmdOrCtrl+Shift+S"))?;

            let install_ql_item = MenuItem::with_id(
                app,
                "install_quicklook",
                "Install Quick Look Plugin…",
                true,
                None::<&str>,
            )?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&open_item)
                .item(&save_item)
                .item(&save_as_item)
                .separator()
                .item(&install_ql_item)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None::<&str>)?)
                .build()?;

            // Edit menu with standard editing items
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None::<&str>)?)
                .item(&PredefinedMenuItem::redo(app, None::<&str>)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None::<&str>)?)
                .item(&PredefinedMenuItem::copy(app, None::<&str>)?)
                .item(&PredefinedMenuItem::paste(app, None::<&str>)?)
                .item(&PredefinedMenuItem::select_all(app, None::<&str>)?)
                .build()?;

            // View menu
            let toggle_folder_item =
                MenuItem::with_id(app, "toggle_folder", "Toggle Folder Panel", true, Some("CmdOrCtrl+B"))?;
            let source_item =
                MenuItem::with_id(app, "view_source", "Source", true, Some("CmdOrCtrl+1"))?;
            let preview_item =
                MenuItem::with_id(app, "view_preview", "Preview", true, Some("CmdOrCtrl+2"))?;
            let split_item =
                MenuItem::with_id(app, "view_split", "Split", true, Some("CmdOrCtrl+3"))?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&toggle_folder_item)
                .separator()
                .item(&source_item)
                .item(&preview_item)
                .item(&split_item)
                .build()?;

            // Window menu
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
                "install_quicklook" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let js = "window.__menuAction && window.__menuAction('installQuickLook')";
                        let _ = window.eval(js);
                    }
                }
                "open" | "save" | "save_as" | "toggle_folder" | "view_source" | "view_preview" | "view_split" => {
                    if let Some(window) = app.get_webview_window("main") {
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
                        let _ = window.eval(&js);
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Handle OS file-open events (macOS "Open With" / double-click .md files)
    app.run(|app_handle, event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = event {
            let files: Vec<PathBuf> = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect();

            if let Some(file) = files.first() {
                let path_str = file.to_string_lossy().to_string();

                // Store in state (for the "app launching" case — frontend
                // will call get_opened_file command after page loads)
                if let Some(state) = app_handle.try_state::<PendingFile>() {
                    *state.0.lock().unwrap() = Some(path_str.clone());
                }

                // Also try eval (for the "app already running" case —
                // page is loaded, __openFile exists)
                open_file_in_running_app(app_handle, &path_str);
            }
        }
    });
}
