use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const MC_RESOURCES_URL: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Deserialize)]
pub struct VersionManifest {
    pub versions: Vec<VersionEntry>,
}

#[derive(Debug, Deserialize)]
pub struct VersionEntry {
    pub id: String,
    pub url: String,
    #[serde(rename = "type")]
    pub version_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionJson {
    pub id: String,
    #[serde(rename = "assetIndex")]
    pub asset_index: Option<AssetIndex>,
    pub assets: Option<String>,
    pub downloads: Option<Downloads>,
    pub libraries: Vec<Library>,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<Arguments>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetIndex {
    pub id: String,
    pub url: String,
    #[serde(rename = "totalSize")]
    pub total_size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Downloads {
    pub client: Option<DownloadEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadEntry {
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Library {
    pub name: String,
    pub downloads: Option<LibDownloads>,
    pub rules: Option<Vec<Rule>>,
    pub url: Option<String>,
    pub natives: Option<std::collections::HashMap<String, String>>,
    pub extract: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibDownloads {
    pub artifact: Option<LibArtifact>,
    pub classifiers: Option<std::collections::HashMap<String, LibArtifact>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibArtifact {
    pub path: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Rule {
    pub action: String,
    pub os: Option<OsRule>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OsRule {
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Arguments {
    pub game: Option<Vec<serde_json::Value>>,
    pub jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
pub struct AssetIndexJson {
    pub objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

/// Get the Mojang version JSON for a specific MC version
pub async fn get_version_json(
    client: &reqwest::Client,
    mc_version: &str,
    versions_dir: &Path,
) -> Result<VersionJson, String> {
    let cached = versions_dir.join(mc_version).join(format!("{}.json", mc_version));
    if cached.exists() {
        let data = std::fs::read_to_string(&cached).map_err(|e| e.to_string())?;
        // Check if the cached JSON has classifiers/natives — if not, it was saved by the
        // old serializer that stripped unknown fields. Delete and re-fetch from Mojang.
        if data.contains("\"classifiers\"") || data.contains("\"natives\"") || !data.contains("lwjgl-platform") {
            return serde_json::from_str(&data).map_err(|e| format!("Bad cached version JSON: {}", e));
        } else {
            println!("[McBlox] Cached version JSON missing classifiers/natives, re-downloading...");
            std::fs::remove_file(&cached).ok();
        }
    }

    // Fetch manifest
    let manifest: VersionManifest = client
        .get(VERSION_MANIFEST_URL)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let entry = manifest.versions.iter()
        .find(|v| v.id == mc_version)
        .ok_or(format!("MC version {} not found in Mojang manifest", mc_version))?;

    // Download raw JSON and save it before parsing
    let raw_json = client
        .get(&entry.url)
        .send().await.map_err(|e| e.to_string())?
        .text().await.map_err(|e| e.to_string())?;

    // Cache the raw JSON (preserves all fields including classifiers, natives, etc.)
    std::fs::create_dir_all(cached.parent().unwrap()).ok();
    std::fs::write(&cached, &raw_json).ok();

    let version_json: VersionJson = serde_json::from_str(&raw_json)
        .map_err(|e| format!("Bad version JSON from Mojang: {}", e))?;

    Ok(version_json)
}

/// Download the client JAR
pub async fn download_client_jar(
    client: &reqwest::Client,
    version_json: &VersionJson,
    versions_dir: &Path,
) -> Result<PathBuf, String> {
    let jar_path = versions_dir
        .join(&version_json.id)
        .join(format!("{}.jar", version_json.id));

    if jar_path.exists() {
        return Ok(jar_path);
    }

    let download = version_json.downloads.as_ref()
        .and_then(|d| d.client.as_ref())
        .ok_or("No client download URL in version JSON")?;

    download_file(client, &download.url, &jar_path).await?;
    Ok(jar_path)
}

/// Download all libraries
pub async fn download_libraries(
    client: &reqwest::Client,
    version_json: &VersionJson,
    libraries_dir: &Path,
) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();

    for lib in &version_json.libraries {
        // Check rules — only download if allowed on this OS
        if !should_use_library(lib) {
            continue;
        }

        if let Some(ref downloads) = lib.downloads {
            if let Some(ref artifact) = downloads.artifact {
                let lib_path = libraries_dir.join(&artifact.path);
                if !lib_path.exists() {
                    download_file(client, &artifact.url, &lib_path).await?;
                }
                paths.push(lib_path);
            }
            // Download native classifier JARs (MC 1.12 and earlier)
            if let Some(ref classifiers) = downloads.classifiers {
                let native_classifier = if cfg!(windows) { "natives-windows" }
                    else if cfg!(target_os = "macos") { "natives-macos" }
                    else { "natives-linux" };
                if let Some(native_artifact) = classifiers.get(native_classifier) {
                    let lib_path = libraries_dir.join(&native_artifact.path);
                    if !lib_path.exists() {
                        download_file(client, &native_artifact.url, &lib_path).await?;
                    }
                    paths.push(lib_path);
                }
            }
        } else if let Some(ref url_base) = lib.url {
            // Maven-style URL resolution
            let artifact_path = maven_to_path(&lib.name);
            let url = format!("{}{}", url_base, artifact_path);
            let lib_path = libraries_dir.join(&artifact_path);
            if !lib_path.exists() {
                download_file(client, &url, &lib_path).await?;
            }
            paths.push(lib_path);
        } else {
            // Default Maven central
            let artifact_path = maven_to_path(&lib.name);
            let url = format!("https://libraries.minecraft.net/{}", artifact_path);
            let lib_path = libraries_dir.join(&artifact_path);
            if !lib_path.exists() {
                if let Err(_) = download_file(client, &url, &lib_path).await {
                    // Some libraries may not exist, skip
                    continue;
                }
            }
            paths.push(lib_path);
        }
    }

    Ok(paths)
}

/// Download asset index and assets
pub async fn download_assets(
    client: &reqwest::Client,
    version_json: &VersionJson,
    assets_dir: &Path,
) -> Result<(), String> {
    let asset_index = version_json.asset_index.as_ref()
        .ok_or("No asset index in version JSON")?;

    let index_path = assets_dir.join("indexes").join(format!("{}.json", asset_index.id));

    if !index_path.exists() {
        download_file(client, &asset_index.url, &index_path).await?;
    }

    let index_data = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let index: AssetIndexJson = serde_json::from_str(&index_data)
        .map_err(|e| format!("Bad asset index: {}", e))?;

    let objects_dir = assets_dir.join("objects");

    for (_name, obj) in &index.objects {
        let hash_prefix = &obj.hash[..2];
        let obj_path = objects_dir.join(hash_prefix).join(&obj.hash);
        if !obj_path.exists() {
            let url = format!("{}/{}/{}", MC_RESOURCES_URL, hash_prefix, obj.hash);
            download_file(client, &url, &obj_path).await?;
        }
    }

    Ok(())
}

/// Install Fabric loader for the given MC version
pub async fn install_fabric(
    client: &reqwest::Client,
    mc_version: &str,
    loader_version_override: Option<&str>,
    game_dir: &Path,
    libraries_dir: &Path,
) -> Result<(String, Vec<PathBuf>, Vec<String>, Vec<String>), String> {
    // Use exact version if provided, otherwise fetch latest
    let loader_version = if let Some(v) = loader_version_override {
        v.to_string()
    } else {
        let loaders_url = format!(
            "https://meta.fabricmc.net/v2/versions/loader/{}",
            mc_version
        );
        let loaders: Vec<serde_json::Value> = client
            .get(&loaders_url)
            .send().await.map_err(|e| e.to_string())?
            .json().await.map_err(|e| e.to_string())?;

        let loader = loaders.first()
            .ok_or("No Fabric loader versions available")?;

        loader["loader"]["version"].as_str()
            .ok_or("No loader version")?.to_string()
    };
    println!("[McBlox] Using Fabric loader version: {}", loader_version);

    // Get the profile/version JSON for this Fabric version
    let profile_url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
        mc_version, loader_version
    );
    let profile: serde_json::Value = client
        .get(&profile_url)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let main_class = profile["mainClass"].as_str()
        .unwrap_or("net.fabricmc.loader.impl.launch.knot.KnotClient")
        .to_string();

    // Download Fabric libraries
    let mut fabric_libs = Vec::new();
    if let Some(libs) = profile["libraries"].as_array() {
        for lib in libs {
            let name = lib["name"].as_str().unwrap_or("");
            let url_base = lib["url"].as_str().unwrap_or("https://maven.fabricmc.net/");

            let artifact_path = maven_to_path(name);
            let url = format!("{}{}", url_base, artifact_path);
            let lib_path = libraries_dir.join(&artifact_path);

            if !lib_path.exists() {
                download_file(client, &url, &lib_path).await?;
            }
            fabric_libs.push(lib_path);
        }
    }

    // Save Fabric version JSON
    let fabric_id = format!("fabric-loader-{}-{}", loader_version, mc_version);
    let versions_dir = game_dir.join("versions").join(&fabric_id);
    std::fs::create_dir_all(&versions_dir).ok();
    std::fs::write(
        versions_dir.join(format!("{}.json", fabric_id)),
        serde_json::to_string_pretty(&profile).unwrap_or_default(),
    ).ok();

    Ok((main_class, fabric_libs, vec![], vec![]))
}

/// Install Forge for the given MC version
pub async fn install_forge(
    client: &reqwest::Client,
    mc_version: &str,
    loader_version_override: Option<&str>,
    game_dir: &Path,
    libraries_dir: &Path,
) -> Result<(String, Vec<PathBuf>, Vec<String>, Vec<String>), String> {
    // Use exact version if provided, otherwise look up from Forge promotions
    let forge_version = if let Some(v) = loader_version_override {
        v.to_string()
    } else {
        let promos_url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
        let promos: serde_json::Value = client
            .get(promos_url)
            .send().await.map_err(|e| e.to_string())?
            .json().await.map_err(|e| e.to_string())?;

        let promos_map = promos["promos"].as_object()
            .ok_or("Invalid Forge promotions response")?;

        promos_map.get(&format!("{}-recommended", mc_version))
            .or_else(|| promos_map.get(&format!("{}-latest", mc_version)))
            .and_then(|v| v.as_str())
            .ok_or(format!("No Forge version found for MC {}", mc_version))?
            .to_string()
    };

    let full_version = format!("{}-{}", mc_version, forge_version);
    println!("[McBlox] Installing Forge {}", full_version);

    // Download the Forge installer JAR
    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
        full_version, full_version
    );
    let installer_path = game_dir.join(format!("forge-{}-installer.jar", full_version));
    if !installer_path.exists() {
        download_file(client, &installer_url, &installer_path).await?;
    }

    // Extract version JSON from installer JAR
    let file = std::fs::File::open(&installer_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Bad Forge installer: {}", e))?;

    let version_json: serde_json::Value = {
        // Try "version.json" first (modern Forge), then "install_profile.json" (legacy)
        let entry_name = if archive.by_name("version.json").is_ok() {
            "version.json"
        } else {
            "install_profile.json"
        };
        let entry = archive.by_name(entry_name).map_err(|e| format!("No version info in Forge installer: {}", e))?;
        serde_json::from_reader(entry).map_err(|e| format!("Bad Forge version JSON: {}", e))?
    };

    let main_class = version_json["mainClass"].as_str()
        .unwrap_or("cpw.mods.modlauncher.Launcher")
        .to_string();

    // Extract Forge-specific JVM arguments (--add-opens, --add-exports, etc.)
    let mut forge_jvm_args: Vec<String> = Vec::new();
    if let Some(args) = version_json["arguments"]["jvm"].as_array() {
        for arg in args {
            if let Some(s) = arg.as_str() {
                forge_jvm_args.push(s.to_string());
            }
        }
    }
    
    // Extract Forge-specific game arguments (--launchTarget, --fml.forgeVersion, etc.)
    let mut forge_game_args: Vec<String> = Vec::new();
    if let Some(args) = version_json["arguments"]["game"].as_array() {
        // Modern Forge (1.13+): arguments.game array
        for arg in args {
            if let Some(s) = arg.as_str() {
                forge_game_args.push(s.to_string());
            }
        }
    } else if let Some(mc_args) = version_json["minecraftArguments"].as_str() {
        // Legacy Forge (1.12 and earlier): minecraftArguments string
        // This REPLACES the vanilla minecraftArguments entirely, so we store it
        // as a special marker that build_launch_args will use
        forge_game_args.push("__LEGACY_MC_ARGS__".to_string());
        for part in mc_args.split_whitespace() {
            forge_game_args.push(part.to_string());
        }
    }
    println!("[McBlox] Forge JVM args: {}, game args: {}", forge_jvm_args.len(), forge_game_args.len());

    // Run the Forge installer to process client artifacts (srg, extra, patched)
    // Check if the client-srg JAR exists (indicates installer has been run)
    let srg_path = libraries_dir.join(maven_to_path(
        &format!("net.minecraft:client:{}:srg", 
            version_json["data"]["MCP_VERSION"]["client"].as_str()
                .map(|s| format!("{}-{}", mc_version, s.trim_matches('\'')))
                .unwrap_or_else(|| format!("{}-20230612.114412", mc_version))
        )
    ));
    if !srg_path.exists() {
        println!("[McBlox] Running Forge installer processors (generating client-srg, client-extra, patched)...");
        println!("[McBlox] Expected SRG at: {:?}", srg_path);
        
        // Create dummy launcher_profiles.json that Forge installer expects
        let profiles_path = game_dir.join("launcher_profiles.json");
        if !profiles_path.exists() {
            std::fs::write(&profiles_path, r#"{"profiles":{}}"#).ok();
        }
        // Find Java to run the installer
        let java_exe = if crate::which_java("java.exe") {
            "java.exe".to_string()
        } else {
            // Use bundled Java
            let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
            let java_dir = base.join("McBlox").join("java");
            let mut found = None;
            if let Ok(entries) = std::fs::read_dir(&java_dir) {
                for entry in entries.flatten() {
                    let java = entry.path().join("bin").join("java.exe");
                    if java.exists() {
                        found = Some(java.display().to_string());
                        break;
                    }
                }
            }
            found.ok_or("No Java found to run Forge installer")?
        };
        
        // Run the installer in headless/installClient mode
        let output = std::process::Command::new(&java_exe)
            .arg("-jar")
            .arg(&installer_path)
            .arg("--installClient")
            .arg(game_dir.display().to_string())
            .output()
            .map_err(|e| format!("Failed to run Forge installer: {}", e))?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("[McBlox] Forge installer stdout: {}", &stdout[..stdout.len().min(1000)]);
        println!("[McBlox] Forge installer stderr: {}", &stderr[..stderr.len().min(1000)]);
        
        if !output.status.success() {
            println!("[McBlox] Forge installer exited with: {}", output.status);
            // Don't fail — the installer might partially succeed
        }
    } else {
        println!("[McBlox] Forge client already patched");
    }

    // Download Forge libraries
    let mut forge_libs = Vec::new();
    if let Some(libs) = version_json["libraries"].as_array() {
        for lib in libs {
            let name = lib["name"].as_str().unwrap_or("");
            if name.is_empty() { continue; }

            let artifact_path = maven_to_path(name);

            // Check for explicit URL
            let url = if let Some(downloads) = lib["downloads"]["artifact"]["url"].as_str() {
                if downloads.is_empty() {
                    // Empty URL means it's in the installer
                    let jar_path = libraries_dir.join(&artifact_path);
                    if !jar_path.exists() {
                        let inner_path = format!("maven/{}", artifact_path);
                        extract_from_zip(&installer_path, &inner_path, &jar_path).ok();
                    }
                    forge_libs.push(libraries_dir.join(&artifact_path));
                    continue;
                }
                downloads.to_string()
            } else if let Some(url_base) = lib["url"].as_str() {
                format!("{}{}", url_base, artifact_path)
            } else {
                format!("https://libraries.minecraft.net/{}", artifact_path)
            };

            let lib_path = libraries_dir.join(&artifact_path);
            if !lib_path.exists() {
                if let Err(e) = download_file(client, &url, &lib_path).await {
                    println!("[McBlox] Warning: Forge lib {} download failed: {}", name, e);
                    continue;
                }
            }
            forge_libs.push(lib_path);
        }
    }

    // Also add the Forge universal/client JAR itself
    let forge_jar_path = maven_to_path(&format!("net.minecraftforge:forge:{}", full_version));
    let forge_jar = libraries_dir.join(&forge_jar_path);
    if !forge_jar.exists() {
        let forge_universal_url = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-universal.jar",
            full_version, full_version
        );
        if let Err(_) = download_file(client, &forge_universal_url, &forge_jar).await {
            let inner = format!("maven/{}", forge_jar_path);
            extract_from_zip(&installer_path, &inner, &forge_jar).ok();
        }
    }
    forge_libs.push(forge_jar);

    println!("[McBlox] Forge {} installed ({} libraries), {} JVM args", full_version, forge_libs.len(), forge_jvm_args.len());
    Ok((main_class, forge_libs, forge_jvm_args, forge_game_args))
}

/// Install NeoForge for the given MC version
pub async fn install_neoforge(
    client: &reqwest::Client,
    mc_version: &str,
    loader_version_override: Option<&str>,
    game_dir: &Path,
    libraries_dir: &Path,
) -> Result<(String, Vec<PathBuf>, Vec<String>, Vec<String>), String> {
    // Use exact version if provided, otherwise look up latest
    let nf_version = if let Some(v) = loader_version_override {
        v.to_string()
    } else {
        let versions_url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
        let versions_resp: serde_json::Value = client
            .get(versions_url)
            .send().await.map_err(|e| e.to_string())?
            .json().await.map_err(|e| e.to_string())?;

        let all_versions = versions_resp["versions"].as_array()
            .ok_or("Invalid NeoForge versions response")?;

        let mc_parts: Vec<&str> = mc_version.split('.').collect();
        let nf_prefix = if mc_parts.len() >= 2 {
            let minor = mc_parts[1];
            let patch = mc_parts.get(2).unwrap_or(&"0");
            format!("{}.{}", minor, patch)
        } else {
            mc_version.to_string()
        };

        all_versions.iter().rev()
            .filter_map(|v| v.as_str())
            .find(|v| v.starts_with(&nf_prefix))
            .ok_or(format!("No NeoForge version found for MC {} (prefix {})", mc_version, nf_prefix))?
            .to_string()
    };

    println!("[McBlox] Installing NeoForge {}", nf_version);

    // Download installer
    let installer_url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
        nf_version, nf_version
    );
    let installer_path = game_dir.join("neoforge-installer.jar");
    if !installer_path.exists() {
        download_file(client, &installer_url, &installer_path).await?;
    }

    // Extract version JSON from installer
    let file = std::fs::File::open(&installer_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Bad NeoForge installer: {}", e))?;

    let version_json: serde_json::Value = {
        let entry_name = if archive.by_name("version.json").is_ok() {
            "version.json"
        } else {
            "install_profile.json"
        };
        let entry = archive.by_name(entry_name).map_err(|e| format!("No version info: {}", e))?;
        serde_json::from_reader(entry).map_err(|e| format!("Bad NeoForge version JSON: {}", e))?
    };

    let main_class = version_json["mainClass"].as_str()
        .unwrap_or("cpw.mods.modlauncher.Launcher")
        .to_string();

    // Download NeoForge libraries (same logic as Forge)
    let mut nf_libs = Vec::new();
    if let Some(libs) = version_json["libraries"].as_array() {
        for lib in libs {
            let name = lib["name"].as_str().unwrap_or("");
            if name.is_empty() { continue; }

            let artifact_path = maven_to_path(name);

            let url = if let Some(dl_url) = lib["downloads"]["artifact"]["url"].as_str() {
                if dl_url.is_empty() {
                    let jar_path = libraries_dir.join(&artifact_path);
                    if !jar_path.exists() {
                        let inner = format!("maven/{}", artifact_path);
                        extract_from_zip(&installer_path, &inner, &jar_path).ok();
                    }
                    nf_libs.push(libraries_dir.join(&artifact_path));
                    continue;
                }
                dl_url.to_string()
            } else if let Some(url_base) = lib["url"].as_str() {
                format!("{}{}", url_base, artifact_path)
            } else {
                format!("https://libraries.minecraft.net/{}", artifact_path)
            };

            let lib_path = libraries_dir.join(&artifact_path);
            if !lib_path.exists() {
                if let Err(e) = download_file(client, &url, &lib_path).await {
                    println!("[McBlox] Warning: NeoForge lib {} failed: {}", name, e);
                    continue;
                }
            }
            nf_libs.push(lib_path);
        }
    }

    // Extract NeoForge JVM args
    let mut nf_jvm_args: Vec<String> = Vec::new();
    if let Some(args) = version_json["arguments"]["jvm"].as_array() {
        for arg in args {
            if let Some(s) = arg.as_str() {
                nf_jvm_args.push(s.to_string());
            }
        }
    }

    // Extract NeoForge game args
    let mut nf_game_args: Vec<String> = Vec::new();
    if let Some(args) = version_json["arguments"]["game"].as_array() {
        for arg in args {
            if let Some(s) = arg.as_str() {
                nf_game_args.push(s.to_string());
            }
        }
    }

    println!("[McBlox] NeoForge {} installed ({} libraries)", nf_version, nf_libs.len());
    Ok((main_class, nf_libs, nf_jvm_args, nf_game_args))
}

/// Build the classpath string
pub fn build_classpath(
    client_jar: &Path,
    library_paths: &[PathBuf],
    fabric_libs: &[PathBuf],
) -> String {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut parts: Vec<String> = Vec::new();

    for lib in library_paths {
        parts.push(lib.display().to_string());
    }
    for lib in fabric_libs {
        parts.push(lib.display().to_string());
    }
    parts.push(client_jar.display().to_string());

    parts.join(sep)
}

/// Extract native libraries (.dll, .so, .dylib) from library JARs into natives dir
pub fn extract_natives(
    version_json: &VersionJson,
    libraries_dir: &Path,
    natives_dir: &Path,
) -> Result<(), String> {
    // Clear old natives to avoid cross-version contamination
    if natives_dir.exists() {
        std::fs::remove_dir_all(natives_dir).ok();
    }
    std::fs::create_dir_all(natives_dir).map_err(|e| e.to_string())?;
    
    let native_classifier = if cfg!(windows) { "natives-windows" }
        else if cfg!(target_os = "macos") { "natives-macos" }
        else { "natives-linux" };
    
    for lib in &version_json.libraries {
        if !should_use_library(lib) {
            continue;
        }
        
        if let Some(ref downloads) = lib.downloads {
            // Check for native classifiers first (MC 1.12 style)
            if let Some(ref classifiers) = downloads.classifiers {
                if let Some(ref native_artifact) = classifiers.get(native_classifier) {
                    let lib_path = libraries_dir.join(&native_artifact.path);
                    if lib_path.exists() {
                        println!("[McBlox]   Extracting natives from classifier: {:?}", lib_path.file_name());
                        extract_dlls_from_jar(&lib_path, natives_dir).ok();
                    }
                }
            }
            
            // Check if the main artifact itself is a natives jar (MC 1.13+ style)
            if let Some(ref artifact) = downloads.artifact {
                if artifact.path.contains(native_classifier) {
                    let lib_path = libraries_dir.join(&artifact.path);
                    if lib_path.exists() {
                        println!("[McBlox]   Extracting natives from artifact: {:?}", lib_path.file_name());
                        extract_dlls_from_jar(&lib_path, natives_dir).ok();
                    }
                }
            }
        } else {
            // No downloads section — try maven-style path with natives classifier
            let name = &lib.name;
            if name.contains("natives") {
                let artifact_path = maven_to_path(name);
                let lib_path = libraries_dir.join(&artifact_path);
                if lib_path.exists() {
                    println!("[McBlox]   Extracting natives from maven path: {:?}", lib_path.file_name());
                    extract_dlls_from_jar(&lib_path, natives_dir).ok();
                }
            }
        }
    }
    
    println!("[McBlox] Natives extracted to {:?}", natives_dir);
    Ok(())
}

fn extract_dlls_from_jar(jar_path: &Path, natives_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(jar_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        
        // Extract .dll, .so, .dylib, .jnilib files
        let is_native = name.ends_with(".dll") || name.ends_with(".so") 
            || name.ends_with(".dylib") || name.ends_with(".jnilib");
        
        if is_native && !entry.is_dir() {
            let file_name = std::path::Path::new(&name)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            
            let out_path = natives_dir.join(&file_name);
            if !out_path.exists() {
                if let Ok(mut outfile) = std::fs::File::create(&out_path) {
                    std::io::copy(&mut entry, &mut outfile).ok();
                }
            }
        }
    }
    
    Ok(())
}

/// Build MC launch arguments
pub fn build_launch_args(
    version_json: &VersionJson,
    main_class: &str,
    classpath: &str,
    game_dir: &Path,
    assets_dir: &Path,
    libraries_dir: &Path,
    mc_version: &str,
    username: &str,
    uuid: &str,
    access_token: &str,
    server_address: Option<&str>,
    loader_jvm_args: &[String],
    loader_game_args: &[String],
    min_memory: &str,
    max_memory: &str,
) -> Vec<String> {
    let mut args = Vec::new();
    let libs_str = libraries_dir.display().to_string();
    let natives_str = game_dir.join("natives").display().to_string();

    // JVM args
    args.push(format!("-Xms{}", min_memory));
    args.push(format!("-Xmx{}", max_memory));
    args.push(format!("-Djava.library.path={}", natives_str));
    args.push("-Dminecraft.launcher.brand=McBlox".to_string());
    args.push("-Dminecraft.launcher.version=0.2.0".to_string());

    // Add JVM args from vanilla version JSON
    if let Some(ref arguments) = version_json.arguments {
        if let Some(ref jvm_args) = arguments.jvm {
            for arg in jvm_args {
                if let Some(s) = arg.as_str() {
                    let resolved = s
                        .replace("${library_directory}", &libs_str)
                        .replace("${classpath_separator}", if cfg!(windows) { ";" } else { ":" })
                        .replace("${version_name}", mc_version)
                        .replace("${natives_directory}", &natives_str)
                        .replace("${launcher_name}", "McBlox")
                        .replace("${launcher_version}", "0.2.0");
                    if resolved == "-cp" || resolved.contains("${classpath}") {
                        continue;
                    }
                    args.push(resolved);
                }
            }
        }
    }

    // Add mod loader JVM args (Forge --add-opens, --add-exports, etc.)
    for arg in loader_jvm_args {
        let resolved = arg
            .replace("${library_directory}", &libs_str)
            .replace("${classpath_separator}", if cfg!(windows) { ";" } else { ":" })
            .replace("${version_name}", mc_version)
            .replace("${natives_directory}", &natives_str);
        if resolved == "-cp" || resolved.contains("${classpath}") {
            continue;
        }
        args.push(resolved);
    }

    args.push("-cp".to_string());
    args.push(classpath.to_string());
    args.push(main_class.to_string());

    // Game args
    let asset_index = version_json.assets.as_deref().unwrap_or(mc_version);

    // Check if mod loader provides complete legacy minecraftArguments (replaces vanilla args)
    let loader_has_legacy_args = loader_game_args.first().map(|s| s == "__LEGACY_MC_ARGS__").unwrap_or(false);

    if loader_has_legacy_args {
        // Legacy Forge (1.12 and earlier): loader_game_args contains the full minecraftArguments
        // Skip the first entry (__LEGACY_MC_ARGS__ marker)
        for arg in &loader_game_args[1..] {
            args.push(replace_mc_vars(
                arg, username, uuid, access_token,
                game_dir, assets_dir, asset_index, mc_version,
            ));
        }
    } else {
        // Modern arguments format (1.13+)
        if let Some(ref arguments) = version_json.arguments {
            if let Some(ref game_args) = arguments.game {
                for arg in game_args {
                    if let Some(s) = arg.as_str() {
                        args.push(replace_mc_vars(
                            s, username, uuid, access_token,
                            game_dir, assets_dir, asset_index, mc_version,
                        ));
                    }
                }
            }
        }
        // Legacy format (pre-1.13)
        else if let Some(ref mc_args) = version_json.minecraft_arguments {
            for part in mc_args.split_whitespace() {
                args.push(replace_mc_vars(
                    part, username, uuid, access_token,
                    game_dir, assets_dir, asset_index, mc_version,
                ));
            }
        }

        // Append mod loader game args (Forge: --launchTarget, --fml.forgeVersion, etc.)
        for arg in loader_game_args {
            args.push(arg.clone());
        }
    }

    // Auto-join server
    if let Some(addr) = server_address {
        let parts: Vec<&str> = addr.split(':').collect();
        args.push("--server".to_string());
        args.push(parts[0].to_string());
        if parts.len() > 1 {
            args.push("--port".to_string());
            args.push(parts[1].to_string());
        }
    }

    args
}

// --- Helpers ---

fn replace_mc_vars(
    s: &str,
    username: &str,
    uuid: &str,
    access_token: &str,
    game_dir: &Path,
    assets_dir: &Path,
    asset_index: &str,
    mc_version: &str,
) -> String {
    s.replace("${auth_player_name}", username)
        .replace("${version_name}", mc_version)
        .replace("${game_directory}", &game_dir.display().to_string())
        .replace("${assets_root}", &assets_dir.display().to_string())
        .replace("${assets_index_name}", asset_index)
        .replace("${auth_uuid}", uuid)
        .replace("${auth_access_token}", access_token)
        .replace("${user_type}", "msa")
        .replace("${version_type}", "release")
        .replace("${auth_session}", access_token)
        .replace("${user_properties}", "{}")
        .replace("${game_assets}", &assets_dir.display().to_string())
}

fn should_use_library(lib: &Library) -> bool {
    let rules = match &lib.rules {
        Some(r) => r,
        None => return true,
    };

    let mut allowed = false;
    for rule in rules {
        let matches_os = match &rule.os {
            Some(os) => {
                let target = if cfg!(windows) { "windows" }
                    else if cfg!(target_os = "macos") { "osx" }
                    else { "linux" };
                os.name.as_deref() == Some(target)
            }
            None => true,
        };

        if matches_os {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

fn maven_to_path(name: &str) -> String {
    // Convert "group:artifact:version" to "group/artifact/version/artifact-version.jar"
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return name.replace(':', "/") + ".jar";
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version)
}

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let resp = client.get(url).send().await.map_err(|e| format!("Download failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} for {}", resp.status(), url));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(dest, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// Extract a single file from a ZIP archive to a destination path.
/// Returns Ok(true) if extracted, Ok(false) if entry not found.
fn extract_from_zip(zip_path: &Path, entry_name: &str, dest: &Path) -> Result<bool, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut buf = Vec::new();
    {
        let result = archive.by_name(entry_name);
        match result {
            Ok(mut entry) => {
                std::io::Read::read_to_end(&mut entry, &mut buf).map_err(|e| e.to_string())?;
            }
            Err(_) => return Ok(false),
        }
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(dest, &buf).map_err(|e| e.to_string())?;
    Ok(true)
}
