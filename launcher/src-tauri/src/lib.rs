use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

mod instance;
mod mc_auth;
mod mc_launcher;

use mc_auth::{McAccount, DeviceCodeResponse};

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchRequest {
    pub game_id: String,
    pub title: String,
    pub modpack_url: String,
    pub mc_version: String,
    pub mod_loader: String,
    pub game_type: String,
    pub server_address: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchStatus {
    pub stage: String,
    pub progress: f64,
    pub message: String,
}

fn get_instances_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("McBlox").join("instances")
}

fn get_java_path() -> Option<String> {
    // Check common Java locations on Windows
    let candidates = vec![
        // JAVA_HOME env var
        std::env::var("JAVA_HOME").ok().map(|h| format!("{}\\bin\\javaw.exe", h)),
        // Commonly installed paths
        Some("javaw.exe".to_string()), // On PATH
    ];

    for candidate in candidates.into_iter().flatten() {
        let path = PathBuf::from(&candidate);
        if path.exists() || which_java(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn which_java(cmd: &str) -> bool {
    Command::new("where")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
async fn launch_game(request: LaunchRequest) -> Result<String, String> {
    let base_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("McBlox");
    let instances_dir = base_dir.join("instances");
    let instance_dir = instances_dir.join(&request.game_id);
    let libraries_dir = base_dir.join("libraries");
    let assets_dir = base_dir.join("assets");
    let versions_dir = base_dir.join("versions");

    // Create dirs
    std::fs::create_dir_all(&instance_dir).map_err(|e| format!("Failed to create instance dir: {}", e))?;
    std::fs::create_dir_all(&libraries_dir).ok();
    std::fs::create_dir_all(&assets_dir).ok();
    std::fs::create_dir_all(&versions_dir).ok();

    // Check MC auth
    let account = mc_auth::load_account()
        .ok_or("Please sign in with your Microsoft account in Settings first.")?;

    let client = reqwest::Client::builder()
        .user_agent("McBlox/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    // Download modpack if not cached
    let modpack_path = instance_dir.join("modpack.zip");
    if !modpack_path.exists() && !request.modpack_url.is_empty() {
        instance::download_modpack(&request.modpack_url, &modpack_path)
            .await
            .map_err(|e| format!("Failed to download modpack: {}", e))?;
    }

    // Extract modpack
    let mods_dir = instance_dir.join("mods");
    if !mods_dir.exists() && modpack_path.exists() {
        instance::extract_modpack(&modpack_path, &instance_dir)
            .map_err(|e| format!("Failed to extract modpack: {}", e))?;
    }

    // Get MC version JSON from Mojang
    let version_json = mc_launcher::get_version_json(&client, &request.mc_version, &versions_dir).await?;

    // Download client JAR
    let client_jar = mc_launcher::download_client_jar(&client, &version_json, &versions_dir).await?;

    // Download libraries
    let lib_paths = mc_launcher::download_libraries(&client, &version_json, &libraries_dir).await?;

    // Download assets
    mc_launcher::download_assets(&client, &version_json, &assets_dir).await?;

    // Install mod loader (Fabric for now)
    let (main_class, fabric_libs) = if request.mod_loader == "fabric" {
        mc_launcher::install_fabric(&client, &request.mc_version, &base_dir, &libraries_dir).await?
    } else {
        (version_json.main_class.clone(), vec![])
    };

    // Build classpath
    let classpath = mc_launcher::build_classpath(&client_jar, &lib_paths, &fabric_libs);

    // Find Java
    let java = get_java_path()
        .ok_or("Java not found. Please install Java 17+ and make sure it's on your PATH or set JAVA_HOME.")?;

    // Build launch args
    let args = mc_launcher::build_launch_args(
        &version_json,
        &main_class,
        &classpath,
        &instance_dir,
        &assets_dir,
        &request.mc_version,
        &account.username,
        &account.uuid,
        &account.access_token,
        request.server_address.as_deref(),
        "2G",
        "4G",
    );

    // Save instance metadata
    let meta = serde_json::json!({
        "game_id": request.game_id,
        "title": request.title,
        "mc_version": request.mc_version,
        "mod_loader": request.mod_loader,
        "game_type": request.game_type,
        "server_address": request.server_address,
        "modpack_url": request.modpack_url,
        "installed_at": chrono_now(),
    });
    let meta_path = instance_dir.join("mcblox.json");
    std::fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap())
        .map_err(|e| format!("Failed to save metadata: {}", e))?;

    // Launch Minecraft!
    Command::new(&java)
        .args(&args)
        .current_dir(&instance_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch Minecraft: {}", e))?;

    Ok(format!("Launching {} as {}...", request.title, account.username))
}

fn chrono_now() -> String {
    // Simple timestamp without chrono dependency
    format!("{:?}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs())
}

#[tauri::command]
async fn get_instances() -> Result<Vec<serde_json::Value>, String> {
    let instances_dir = get_instances_dir();
    if !instances_dir.exists() {
        return Ok(vec![]);
    }

    let mut instances = vec![];
    let entries = std::fs::read_dir(&instances_dir)
        .map_err(|e| format!("Failed to read instances: {}", e))?;

    for entry in entries.flatten() {
        let meta_path = entry.path().join("mcblox.json");
        if meta_path.exists() {
            if let Ok(data) = std::fs::read_to_string(&meta_path) {
                if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&data) {
                    instances.push(meta);
                }
            }
        }
    }

    Ok(instances)
}

#[tauri::command]
async fn delete_instance(game_id: String) -> Result<(), String> {
    let instance_dir = get_instances_dir().join(&game_id);
    if instance_dir.exists() {
        std::fs::remove_dir_all(&instance_dir)
            .map_err(|e| format!("Failed to delete instance: {}", e))?;
    }
    Ok(())
}

// --- Microsoft/Minecraft Auth ---

use std::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct McAuthStatus {
    state: String, // "idle", "waiting_code", "polling", "authenticating", "done", "error"
    error: Option<String>,
    account: Option<McAccount>,
}

struct McAuthState(Mutex<McAuthStatus>);

#[tauri::command]
async fn mc_auth_start_device_flow(state: tauri::State<'_, McAuthState>) -> Result<DeviceCodeResponse, String> {
    {
        let mut s = state.0.lock().unwrap();
        *s = McAuthStatus { state: "waiting_code".to_string(), error: None, account: None };
    }
    let client = reqwest::Client::new();
    match mc_auth::request_device_code(&client).await {
        Ok(code) => {
            let mut s = state.0.lock().unwrap();
            s.state = "polling".to_string();
            Ok(code)
        }
        Err(e) => {
            let mut s = state.0.lock().unwrap();
            *s = McAuthStatus { state: "error".to_string(), error: Some(e.clone()), account: None };
            Err(e)
        }
    }
}

#[tauri::command]
async fn mc_auth_poll(device_code: String, interval: u64, state: tauri::State<'_, McAuthState>) -> Result<McAccount, String> {
    let client = reqwest::Client::new();
    
    let (msa_token, refresh_token) = match mc_auth::poll_for_msa_token(&client, &device_code, interval).await {
        Ok(v) => v,
        Err(e) => {
            let mut s = state.0.lock().unwrap();
            *s = McAuthStatus { state: "error".to_string(), error: Some(e.clone()), account: None };
            return Err(e);
        }
    };

    {
        let mut s = state.0.lock().unwrap();
        s.state = "authenticating".to_string();
    }

    let account = match mc_auth::full_auth_flow(&client, &msa_token, refresh_token).await {
        Ok(a) => a,
        Err(e) => {
            let mut s = state.0.lock().unwrap();
            *s = McAuthStatus { state: "error".to_string(), error: Some(e.clone()), account: None };
            return Err(e);
        }
    };

    mc_auth::save_account(&account)?;
    
    {
        let mut s = state.0.lock().unwrap();
        *s = McAuthStatus { state: "done".to_string(), error: None, account: Some(account.clone()) };
    }
    Ok(account)
}

#[tauri::command]
async fn mc_auth_status(state: tauri::State<'_, McAuthState>) -> Result<McAuthStatus, String> {
    let s = state.0.lock().unwrap();
    Ok(s.clone())
}

#[tauri::command]
async fn mc_auth_get_account() -> Result<Option<McAccount>, String> {
    Ok(mc_auth::load_account())
}

#[tauri::command]
async fn mc_auth_refresh() -> Result<McAccount, String> {
    let existing = mc_auth::load_account().ok_or("No saved account")?;
    let refresh = existing.msa_refresh_token.ok_or("No refresh token")?;
    let client = reqwest::Client::new();
    let account = mc_auth::refresh_auth(&client, &refresh).await?;
    mc_auth::save_account(&account)?;
    Ok(account)
}

#[tauri::command]
async fn mc_auth_logout(state: tauri::State<'_, McAuthState>) -> Result<(), String> {
    {
        let mut s = state.0.lock().unwrap();
        *s = McAuthStatus { state: "idle".to_string(), error: None, account: None };
    }
    mc_auth::delete_account()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(McAuthState(Mutex::new(McAuthStatus { state: "idle".to_string(), error: None, account: None })))
        .invoke_handler(tauri::generate_handler![
            launch_game,
            get_instances,
            delete_instance,
            mc_auth_start_device_flow,
            mc_auth_poll,
            mc_auth_status,
            mc_auth_get_account,
            mc_auth_refresh,
            mc_auth_logout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
