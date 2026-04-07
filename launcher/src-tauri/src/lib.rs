use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::{Emitter, Manager};

mod instance;
mod mc_auth;
mod mc_launcher;

use mc_auth::{McAccount, DeviceCodeResponse};

#[derive(Debug, Clone, Serialize)]
struct LaunchProgress {
    stage: String,
    message: String,
    percent: f32,
}

#[derive(Debug, Clone, Serialize)]
struct LaunchLog {
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchRequest {
    pub game_id: String,
    pub title: String,
    pub modpack_url: String,
    pub mc_version: String,
    pub mod_loader: String,
    pub loader_version: Option<String>,
    pub game_type: String,
    pub server_address: Option<String>,
    pub world_name: Option<String>,
    pub auto_join: Option<bool>,
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

fn get_java_path(java_version: u8) -> Option<String> {
    // 1. Check our bundled Java first (version-matched)
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let bundled = base.join("McBlox").join("java");
    if bundled.exists() {
        // Find javaw.exe matching the requested major version
        if let Ok(entries) = std::fs::read_dir(&bundled) {
            let mut fallback_javaw: Option<String> = None;
            for entry in entries.flatten() {
                let dir_name = entry.file_name().to_string_lossy().to_string();
                let javaw = entry.path().join("bin").join("javaw.exe");
                if !javaw.exists() { continue; }
                // Match Adoptium naming: "jdk-17.0.18+8-jre" or "jdk8u482-b08-jre" (Java 8 has no hyphen)
                let matches = dir_name.contains(&format!("jdk-{}", java_version))
                    || dir_name.contains(&format!("jdk{}u", java_version));
                if matches {
                    return Some(javaw.display().to_string());
                }
                fallback_javaw = Some(javaw.display().to_string());
            }
            // Fallback: check actual java version if folder name didn't match
            if let Some(ref fb) = fallback_javaw {
                if check_java_major_version(fb, java_version) {
                    return fallback_javaw;
                }
            }
        }
    }

    // 2. Check system Java version
    if let Some(system_java) = find_system_java() {
        if check_java_major_version(&system_java, java_version) {
            return Some(system_java);
        }
    }

    None
}

fn find_system_java() -> Option<String> {
    // Check JAVA_HOME
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let javaw = PathBuf::from(&home).join("bin").join("javaw.exe");
        if javaw.exists() {
            return Some(javaw.display().to_string());
        }
    }
    // Check PATH
    if which_java("javaw.exe") {
        return Some("javaw.exe".to_string());
    }
    None
}

fn check_java_major_version(java_path: &str, expected: u8) -> bool {
    let java_exe = java_path.replace("javaw", "java");
    if let Ok(output) = Command::new(&java_exe).arg("-version").output() {
        let version_str = String::from_utf8_lossy(&output.stderr);
        // Parse "openjdk version \"17.0.8\"" or "java version \"21.0.1\""
        if let Some(start) = version_str.find('"') {
            let rest = &version_str[start + 1..];
            if let Some(end) = rest.find('"') {
                let ver = &rest[..end];
                // "17.0.8" → 17, "1.8.0_372" → 8, "21.0.1" → 21
                let major: u8 = if ver.starts_with("1.") {
                    ver.split('.').nth(1).and_then(|s| s.parse().ok()).unwrap_or(0)
                } else {
                    ver.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0)
                };
                return major == expected;
            }
        }
    }
    false
}

fn java_version_for_mc(mc_version: &str) -> u8 {
    let parts: Vec<&str> = mc_version.split('.').collect();
    let minor: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch: u32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
    
    if minor >= 21 {
        21 // 1.21+ needs Java 21
    } else if minor >= 17 || (minor == 16 && patch >= 5) {
        17 // 1.17 to 1.20.x needs Java 17
    } else {
        8  // 1.16.4 and below needs Java 8
    }
}

async fn ensure_java(mc_version: &str) -> Result<String, String> {
    let java_ver = java_version_for_mc(mc_version);
    
    if let Some(java) = get_java_path(java_ver) {
        println!("[McBlox] Found Java for MC {} (need Java {})", mc_version, java_ver);
        return Ok(java);
    }

    println!("[McBlox] Java {} not found, downloading Adoptium JRE {}...", java_ver, java_ver);
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("McBlox")
        .join("java");
    std::fs::create_dir_all(&base).map_err(|e| format!("Failed to create java dir: {}", e))?;

    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk",
        java_ver
    );

    let client = reqwest::Client::builder()
        .user_agent("McBlox/0.2.0")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(url).send().await.map_err(|e| format!("Download failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Adoptium download returned status {}", resp.status()));
    }

    let zip_path = base.join("jre.zip");
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&zip_path, &bytes).map_err(|e| format!("Failed to save JRE: {}", e))?;

    // Extract
    let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Bad JRE zip: {}", e))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.contains("..") { continue; }
        let out_path = base.join(&name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut outfile = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    // Clean up zip
    std::fs::remove_file(&zip_path).ok();

    println!("[McBlox] Java {} installed successfully", java_ver);

    get_java_path(java_ver).ok_or_else(|| "Java was downloaded but javaw.exe not found in extracted files".to_string())
}

fn which_java(cmd: &str) -> bool {
    Command::new("where")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
async fn launch_game(app_handle: tauri::AppHandle, request: LaunchRequest) -> Result<String, String> {
    let emit = |stage: &str, msg: &str, pct: f32| {
        app_handle.emit("launch-progress", LaunchProgress {
            stage: stage.to_string(),
            message: msg.to_string(),
            percent: pct,
        }).ok();
        app_handle.emit("launch-log", LaunchLog { message: msg.to_string() }).ok();
        println!("[McBlox] [{}%] {}", (pct * 100.0) as u32, msg);
    };
    
    emit("auth", "Checking Minecraft authentication...", 0.0);
    println!("[McBlox] ===== LAUNCH GAME START =====");
    println!("[McBlox] Game: {} ({})", request.title, request.game_id);
    println!("[McBlox] Modpack URL: {}", request.modpack_url);
    println!("[McBlox] MC: {} / Loader: {}", request.mc_version, request.mod_loader);

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
    println!("[McBlox] Checking MC auth...");
    let account = mc_auth::load_account()
        .ok_or("Please sign in with your Microsoft account in Settings first.")?;
    println!("[McBlox] Signed in as: {}", account.username);
    emit("auth", &format!("Signed in as {}", account.username), 0.05);

    let client = reqwest::Client::builder()
        .user_agent("McBlox/0.2.0")
        .build()
        .map_err(|e| e.to_string())?;

    // Download modpack if not cached
    let modpack_path = instance_dir.join("modpack.zip");
    if !modpack_path.exists() && !request.modpack_url.is_empty() {
        emit("download", "Downloading modpack...", 0.1);
        println!("[McBlox] Downloading modpack from: {}", request.modpack_url);
        instance::download_modpack(&request.modpack_url, &modpack_path)
            .await
            .map_err(|e| format!("Failed to download modpack: {}", e))?;
        println!("[McBlox] Modpack downloaded successfully");
    } else {
        println!("[McBlox] Modpack already cached or no URL");
    }

    // Extract modpack
    let mods_dir = instance_dir.join("mods");
    if !mods_dir.exists() && modpack_path.exists() {
        emit("extract", "Extracting modpack...", 0.2);
        println!("[McBlox] Extracting modpack...");
        instance::extract_modpack(&modpack_path, &instance_dir)
            .map_err(|e| format!("Failed to extract modpack: {}", e))?;
        println!("[McBlox] Modpack extracted successfully");
    } else {
        println!("[McBlox] Modpack already extracted");
    }

    // Inject McBlox auto-join mod if enabled
    if request.auto_join.unwrap_or(false) {
        let mods_dir = instance_dir.join("mods");
        std::fs::create_dir_all(&mods_dir).ok();
        
        // Write mcblox_config.json
        let config = serde_json::json!({
            "game_type": request.game_type,
            "server_address": request.server_address,
            "world_name": request.world_name,
        });
        let config_path = instance_dir.join("mcblox_config.json");
        std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
            .map_err(|e| format!("Failed to write mcblox config: {}", e))?;
        emit("setup", "Injecting McBlox auto-join mod...", 0.22);
        println!("[McBlox] Wrote mcblox_config.json");

        // Copy the appropriate mod JAR from bundled resources
        let mod_jar_name = match request.mod_loader.as_str() {
            "forge" | "neoforge" => "mcblox-mod-forge.jar",
            _ => "mcblox-mod-fabric.jar",
        };
        let target_jar = mods_dir.join("mcblox-mod.jar");
        
        // Try to find bundled mod JAR in resource dir
        let resource_dir = app_handle.path().resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        let source_jar = resource_dir.join("mods").join(mod_jar_name);
        
        if source_jar.exists() {
            std::fs::copy(&source_jar, &target_jar)
                .map_err(|e| format!("Failed to copy mcblox mod: {}", e))?;
            println!("[McBlox] Injected {} into instance mods", mod_jar_name);
        } else {
            println!("[McBlox] WARNING: McBlox mod JAR not found at {:?}", source_jar);
        }
    }

    // Get MC version JSON from Mojang
    emit("minecraft", "Fetching Minecraft version info...", 0.3);
    println!("[McBlox] Fetching MC {} version manifest...", request.mc_version);
    let version_json = mc_launcher::get_version_json(&client, &request.mc_version, &versions_dir).await?;
    println!("[McBlox] Version manifest loaded: {}", version_json.id);

    // Download client JAR
    emit("minecraft", "Downloading Minecraft client...", 0.35);
    println!("[McBlox] Downloading client JAR...");
    let client_jar = mc_launcher::download_client_jar(&client, &version_json, &versions_dir).await?;
    println!("[McBlox] Client JAR: {:?}", client_jar);

    // Download libraries
    emit("libraries", "Downloading libraries...", 0.4);
    println!("[McBlox] Downloading libraries...");
    let lib_paths = mc_launcher::download_libraries(&client, &version_json, &libraries_dir).await?;
    println!("[McBlox] {} libraries downloaded", lib_paths.len());

    // Download assets
    emit("assets", "Downloading assets...", 0.5);
    println!("[McBlox] Downloading assets...");
    mc_launcher::download_assets(&client, &version_json, &assets_dir).await?;
    println!("[McBlox] Assets downloaded");

    // Install mod loader
    emit("modloader", &format!("Installing {}...", request.mod_loader), 0.65);
    println!("[McBlox] Installing mod loader: {}", request.mod_loader);
    let loader_version = request.loader_version.as_deref();
    let (main_class, loader_libs, loader_jvm_args, loader_game_args) = match request.mod_loader.as_str() {
        "fabric" => mc_launcher::install_fabric(&client, &request.mc_version, loader_version, &base_dir, &libraries_dir).await?,
        "forge" => mc_launcher::install_forge(&client, &request.mc_version, loader_version, &base_dir, &libraries_dir).await?,
        "neoforge" => mc_launcher::install_neoforge(&client, &request.mc_version, loader_version, &base_dir, &libraries_dir).await?,
        _ => (version_json.main_class.clone(), vec![], vec![], vec![]),
    };
    println!("[McBlox] Main class: {}, {} loader libs, {} JVM args, {} game args", main_class, loader_libs.len(), loader_jvm_args.len(), loader_game_args.len());

    // Extract native libraries
    emit("natives", "Extracting native libraries...", 0.75);
    let natives_dir = instance_dir.join("natives");
    println!("[McBlox] Extracting natives...");
    mc_launcher::extract_natives(&version_json, &libraries_dir, &natives_dir)?;

    // Build classpath
    let classpath = mc_launcher::build_classpath(&client_jar, &lib_paths, &loader_libs);
    println!("[McBlox] Classpath entries: {}", classpath.matches(';').count() + 1);

    // Find or download Java
    emit("java", "Checking Java installation...", 0.8);
    println!("[McBlox] Finding Java for MC {}...", request.mc_version);
    let java = ensure_java(&request.mc_version).await?;
    println!("[McBlox] Java: {}", java);

    // Build launch args
    // If auto_join is on, don't pass --server since the mod handles it
    let server_for_args = if request.auto_join.unwrap_or(false) {
        None
    } else {
        request.server_address.as_deref()
    };
    let args = mc_launcher::build_launch_args(
        &version_json,
        &main_class,
        &classpath,
        &instance_dir,
        &assets_dir,
        &libraries_dir,
        &request.mc_version,
        &account.username,
        &account.uuid,
        &account.access_token,
        server_for_args,
        &loader_jvm_args,
        &loader_game_args,
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
    emit("launch", "Launching Minecraft...", 0.95);
    println!("[McBlox] ===== LAUNCHING MINECRAFT =====");
    println!("[McBlox] Java: {}", java);
    println!("[McBlox] Args count: {}", args.len());
    println!("[McBlox] Main class: {}", args.iter().find(|a| !a.starts_with('-') && !a.contains(';') && !a.contains('\\') && !a.contains('/')).unwrap_or(&"???".to_string()));
    println!("[McBlox] Game dir: {:?}", instance_dir);
    
    // Log first few and last few args for debugging
    for (i, arg) in args.iter().enumerate() {
        if i < 10 || i > args.len() - 5 {
            println!("[McBlox]   arg[{}]: {}", i, if arg.len() > 200 { &arg[..200] } else { arg });
        }
    }

    // Use javaw.exe to avoid opening a CMD window, pipe stdout/stderr
    let mut child = Command::new(&java)
        .args(&args)
        .current_dir(&instance_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch Minecraft: {}", e))?;
    
    let pid = child.id();
    println!("[McBlox] Minecraft process spawned with PID: {}", pid);

    // Store the PID so we can stop it later
    {
        let mut guard = RUNNING_GAME.lock().unwrap();
        *guard = Some(RunningGame {
            pid,
            game_id: request.game_id.clone(),
        });
    }
    
    // Spawn a background thread to stream stdout/stderr to the frontend
    let app_handle_bg = app_handle.clone();
    let game_id_bg = request.game_id.clone();
    std::thread::spawn(move || {
        use std::io::BufRead;
        
        // Read stdout in a thread
        if let Some(stdout) = child.stdout.take() {
            let app = app_handle_bg.clone();
            let reader = std::io::BufReader::new(stdout);
            std::thread::spawn(move || {
                for line in reader.lines() {
                    if let Ok(line) = line {
                        app.emit("mc-output", serde_json::json!({ "line": line, "stream": "stdout" })).ok();
                    }
                }
            });
        }
        
        if let Some(stderr) = child.stderr.take() {
            let app = app_handle_bg.clone();
            let reader = std::io::BufReader::new(stderr);
            std::thread::spawn(move || {
                for line in reader.lines() {
                    if let Ok(line) = line {
                        app.emit("mc-output", serde_json::json!({ "line": line, "stream": "stderr" })).ok();
                    }
                }
            });
        }
        
        // Wait for the process to exit
        let status = child.wait();
        let code = status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
        println!("[McBlox] Minecraft exited with code {}", code);
        
        // Clear running game state
        {
            let mut guard = RUNNING_GAME.lock().unwrap();
            if guard.as_ref().map(|g| &g.game_id) == Some(&game_id_bg) {
                *guard = None;
            }
        }
        
        app_handle_bg.emit("mc-exited", serde_json::json!({ "code": code, "game_id": game_id_bg })).ok();
    });

    // Wait briefly to check for immediate crashes
    std::thread::sleep(std::time::Duration::from_secs(8));
    
    // Check if process is still running
    let still_running = {
        let guard = RUNNING_GAME.lock().unwrap();
        guard.as_ref().map(|g| &g.game_id) == Some(&request.game_id)
    };
    
    if still_running {
        emit("running", "Minecraft is running!", 1.0);
        println!("[McBlox] Minecraft is running (PID {})", pid);
    } else {
        emit("error", "Minecraft exited (code: 1). Check logs if it didn't start.", 1.0);
    }

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

#[tauri::command]
async fn clear_all_instances() -> Result<String, String> {
    let instances_dir = get_instances_dir();
    let mut count = 0u32;
    let mut freed: u64 = 0;
    if instances_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&instances_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    freed += dir_size(&entry.path());
                    std::fs::remove_dir_all(entry.path()).ok();
                    count += 1;
                }
            }
        }
    }
    Ok(format!("Cleared {} instances, freed {}", count, format_bytes(freed)))
}

#[tauri::command]
async fn get_storage_info() -> Result<serde_json::Value, String> {
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("McBlox");
    let instances = base.join("instances");
    let libraries = base.join("libraries");
    let assets = base.join("assets");
    let java = base.join("java");

    Ok(serde_json::json!({
        "instances": dir_size(&instances),
        "libraries": dir_size(&libraries),
        "assets": dir_size(&assets),
        "java": dir_size(&java),
        "total": dir_size(&base),
        "path": base.display().to_string(),
    }))
}

fn dir_size(path: &std::path::Path) -> u64 {
    if !path.exists() { return 0; }
    let mut total: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += p.metadata().map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                total += dir_size(&p);
            }
        }
    }
    total
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 { return format!("{} B", bytes); }
    if bytes < 1024 * 1024 { return format!("{:.1} KB", bytes as f64 / 1024.0); }
    if bytes < 1024 * 1024 * 1024 { return format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)); }
    format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
}

// --- Running game state ---

use std::sync::Mutex;

struct RunningGame {
    pid: u32,
    game_id: String,
}

static RUNNING_GAME: std::sync::LazyLock<Mutex<Option<RunningGame>>> = 
    std::sync::LazyLock::new(|| Mutex::new(None));

#[tauri::command]
async fn stop_game() -> Result<String, String> {
    let game = {
        let mut guard = RUNNING_GAME.lock().unwrap();
        guard.take()
    };
    if let Some(game) = game {
        #[cfg(windows)]
        {
            // Kill the process tree (MC may have child processes)
            std::process::Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &game.pid.to_string()])
                .output()
                .ok();
        }
        #[cfg(not(windows))]
        {
            unsafe { libc::kill(game.pid as i32, libc::SIGTERM); }
        }
        Ok(format!("Stopped game {}", game.game_id))
    } else {
        Ok("No game running".to_string())
    }
}

#[tauri::command]
async fn is_game_running() -> Result<Option<String>, String> {
    let guard = RUNNING_GAME.lock().unwrap();
    Ok(guard.as_ref().map(|g| g.game_id.clone()))
}

// --- Microsoft/Minecraft Auth ---

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(McAuthState(Mutex::new(McAuthStatus { state: "idle".to_string(), error: None, account: None })))
        .invoke_handler(tauri::generate_handler![
            launch_game,
            stop_game,
            is_game_running,
            get_instances,
            delete_instance,
            clear_all_instances,
            get_storage_info,
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
