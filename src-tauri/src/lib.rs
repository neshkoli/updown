use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
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

            // File menu with Open and Save As
            let open_item =
                MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
            let save_as_item =
                MenuItem::with_id(app, "save_as", "Save As…", true, Some("CmdOrCtrl+Shift+S"))?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&open_item)
                .item(&save_as_item)
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
                "open" | "save_as" | "toggle_folder" | "view_source" | "view_preview" | "view_split" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let action = match id {
                            "open" => "open",
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
