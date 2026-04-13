use std::env;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_positioner::{Position, WindowExt};

const DEFAULT_PORT: u16 = 3847;

struct ServerProcess(Mutex<Option<Child>>);

fn get_port() -> u16 {
    env::var("CONDUCTOR_PORT")
        .or_else(|_| env::var("PORT"))
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

fn project_dir() -> PathBuf {
    // In a .app bundle: Contents/MacOS/locohost -> Resources/_up_/ contains bundled files
    // (Tauri uses _up_ prefix for resources specified with ../ paths)
    if let Ok(exe) = env::current_exe() {
        let resource_dir = exe.parent().unwrap().join("../Resources/_up_");
        if resource_dir.join("server.js").exists() {
            return resource_dir.canonicalize().unwrap_or(resource_dir);
        }
    }

    // In development: use the project root (parent of src-tauri/)
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Resolve the full path to `node`.
/// macOS GUI apps don't inherit the user's shell PATH, so `Command::new("node")`
/// won't find Homebrew/NVM/fnm-installed Node. We check common locations first,
/// then fall back to asking a login shell.
fn find_node() -> Option<String> {
    let candidates = [
        "/opt/homebrew/bin/node",       // Homebrew (Apple Silicon)
        "/usr/local/bin/node",          // Homebrew (Intel) / manual installs
        "/usr/bin/node",                // system node (rare)
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // Ask a login shell for the real PATH (catches NVM, fnm, mise, etc.)
    if let Ok(output) = Command::new("/bin/zsh")
        .args(["-lc", "which node"])
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    None
}

fn start_node_server(port: u16) -> Option<Child> {
    let dir = project_dir();
    let server_js = dir.join("server.js");

    if !server_js.exists() {
        eprintln!("server.js not found at {:?}", server_js);
        return None;
    }

    let node = match find_node() {
        Some(path) => {
            println!("Found node at: {}", path);
            path
        }
        None => {
            eprintln!("node not found — is Node.js installed?");
            return None;
        }
    };

    match Command::new(&node)
        .arg(&server_js)
        .env("PORT", port.to_string())
        .current_dir(&dir)
        .spawn()
    {
        Ok(child) => {
            println!("Started Node.js server (pid {}) on port {}", child.id(), port);
            Some(child)
        }
        Err(e) => {
            eprintln!("Failed to start Node.js server: {}", e);
            None
        }
    }
}

fn load_tray_icon(app: &AppHandle, name: &str) -> Option<Image<'static>> {
    let path = app
        .path()
        .resolve(format!("icons/{name}"), tauri::path::BaseDirectory::Resource)
        .ok()?;
    Image::from_path(&path).ok()
}

#[tauri::command]
fn resize_window(app: AppHandle, height: f64) {
    if let Some(window) = app.get_webview_window("main") {
        let h = (height as u32).clamp(80, 700) + 2;
        let size = window.inner_size().unwrap_or_default();
        let _ = window.set_size(tauri::LogicalSize::new(size.width as f64 / window.scale_factor().unwrap_or(1.0), h as f64));
    }
}

#[tauri::command]
fn open_external(url: String) {
    // Only allow localhost URLs for safety
    if url.starts_with("http://localhost:") || url.starts_with("http://127.0.0.1:") {
        let _ = open::that(&url);
    }
}

#[tauri::command]
fn get_port_cmd() -> u16 {
    get_port()
}

pub fn run() {
    let port = get_port();

    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ServerProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            resize_window,
            open_external,
            get_port_cmd
        ])
        .setup(move |app| {
            // Start the Node.js server
            let child = start_node_server(port);
            let state = app.state::<ServerProcess>();
            *state.0.lock().unwrap() = child;

            // Navigate webview to the Node server (same-origin = no CORS/mixed-content issues)
            // Poll until the server is ready, then redirect
            let app_handle = app.handle().clone();
            let nav_port = port;
            tauri::async_runtime::spawn(async move {
                let url = format!("http://localhost:{}", nav_port);
                for _ in 0..40 {
                    if let Ok(resp) = reqwest::get(&format!("{}/api/health", url)).await {
                        if resp.status().is_success() {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.navigate(url::Url::parse(&url).unwrap());
                            }
                            break;
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
            });

            // Hide dock icon — we're a menubar app
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Build tray menu
            let quit = MenuItemBuilder::with_id("quit", "Quit Locohost").build(app)?;
            let menu = MenuBuilder::new(app).item(&quit).build()?;

            // Build tray icon
            let icon = Image::from_path(
                app.path()
                    .resolve("icons/tray-default.png", tauri::path::BaseDirectory::Resource)
                    .unwrap(),
            )?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Locohost")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        // Kill the Node server before quitting
                        if let Some(state) = app.try_state::<ServerProcess>() {
                            if let Ok(mut guard) = state.0.lock() {
                                if let Some(ref mut child) = *guard {
                                    let _ = child.kill();
                                }
                            }
                        }
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.move_window(Position::TrayCenter);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Poll health API to update tray icon
            let app_handle = app.handle().clone();
            let health_port = port;
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    update_tray_from_health(&app_handle, health_port).await;
                }
            });

            Ok(())
        })
        .on_window_event(|_window, event| {
            // Hide window on blur (click outside) — menubar behavior
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = _window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Locohost");
}

async fn update_tray_from_health(app: &AppHandle, port: u16) {
    let url = format!("http://localhost:{}/api/health", port);
    let Ok(resp) = reqwest::get(&url).await else {
        return;
    };
    let Ok(data) = resp.json::<serde_json::Value>().await else {
        return;
    };

    let severity = data
        .get("summary")
        .and_then(|s| s.get("severity"))
        .and_then(|s| s.as_str())
        .unwrap_or("ok");

    let icon_name = match severity {
        "critical" => "tray-critical.png",
        "warning" => "tray-warning.png",
        _ => "tray-default.png",
    };

    if let Some(icon) = load_tray_icon(app, icon_name) {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_icon(Some(icon));
            let _ = tray.set_icon_as_template(true);
        }
    }
}
