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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibDownloads {
    pub artifact: Option<LibArtifact>,
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
        return serde_json::from_str(&data).map_err(|e| format!("Bad cached version JSON: {}", e));
    }

    // Fetch manifest
    let manifest: VersionManifest = client
        .get(VERSION_MANIFEST_URL)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let entry = manifest.versions.iter()
        .find(|v| v.id == mc_version)
        .ok_or(format!("MC version {} not found in Mojang manifest", mc_version))?;

    let version_json: VersionJson = client
        .get(&entry.url)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    // Cache it
    std::fs::create_dir_all(cached.parent().unwrap()).ok();
    if let Ok(data) = serde_json::to_string_pretty(&serde_json::to_value(&version_json).unwrap_or_default()) {
        std::fs::write(&cached, data).ok();
    }

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
    game_dir: &Path,
    libraries_dir: &Path,
) -> Result<(String, Vec<PathBuf>), String> {
    // Get latest Fabric loader version
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

    let loader_version = loader["loader"]["version"].as_str()
        .ok_or("No loader version")?;

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

    Ok((main_class, fabric_libs))
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

/// Build MC launch arguments
pub fn build_launch_args(
    version_json: &VersionJson,
    main_class: &str,
    classpath: &str,
    game_dir: &Path,
    assets_dir: &Path,
    mc_version: &str,
    username: &str,
    uuid: &str,
    access_token: &str,
    server_address: Option<&str>,
    min_memory: &str,
    max_memory: &str,
) -> Vec<String> {
    let mut args = Vec::new();

    // JVM args
    args.push(format!("-Xms{}", min_memory));
    args.push(format!("-Xmx{}", max_memory));
    args.push(format!("-Djava.library.path={}", game_dir.join("natives").display()));
    args.push("-Dminecraft.launcher.brand=McBlox".to_string());
    args.push("-Dminecraft.launcher.version=0.1.0".to_string());
    args.push("-cp".to_string());
    args.push(classpath.to_string());
    args.push(main_class.to_string());

    // Game args
    let asset_index = version_json.assets.as_deref().unwrap_or(mc_version);

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
