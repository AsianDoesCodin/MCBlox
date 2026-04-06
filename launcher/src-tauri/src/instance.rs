use std::io::Write;
use std::path::Path;

/// Resolve a modpack URL to a direct download link
pub async fn resolve_download_url(url: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder()
        .user_agent("McBlox/0.1.0")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;

    // Modrinth: https://modrinth.com/modpack/<slug>
    if url.contains("modrinth.com/modpack/") {
        let slug = url.split("/modpack/").last()
            .and_then(|s| s.split(&['/', '?'][..]).next())
            .ok_or("Invalid Modrinth URL")?;

        // Get latest version
        let api_url = format!("https://api.modrinth.com/v2/project/{}/version", slug);
        let versions: Vec<serde_json::Value> = client.get(&api_url)
            .send().await?
            .json().await?;

        let version = versions.first().ok_or("No versions found on Modrinth")?;
        let file = version["files"].as_array()
            .and_then(|f| f.iter().find(|f| f["primary"].as_bool().unwrap_or(false)).or(f.first()))
            .ok_or("No files in Modrinth version")?;

        return Ok(file["url"].as_str().ok_or("No URL in Modrinth file")?.to_string());
    }

    // CurseForge: https://www.curseforge.com/minecraft/modpacks/<slug>
    if url.contains("curseforge.com/minecraft/modpacks/") {
        let slug = url.split("/modpacks/").last()
            .and_then(|s| s.split(&['/', '?'][..]).next())
            .ok_or("Invalid CurseForge URL")?;

        // CurseForge API requires an API key, use the public search endpoint
        let search_url = format!(
            "https://api.curseforge.com/v1/mods/search?gameId=432&slug={}",
            slug
        );
        // Note: CurseForge API requires $2b7...key header. For now, return the URL as-is
        // and let the user provide a direct download link instead
        println!("[McBlox] CurseForge API requires auth key — using URL as-is");
        return Ok(url.to_string());
    }

    // Google Drive: https://drive.google.com/file/d/<ID>/...
    if url.contains("drive.google.com/file/d/") {
        let file_id = url.split("/file/d/").last()
            .and_then(|s| s.split('/').next())
            .ok_or("Invalid Google Drive URL")?;

        return Ok(format!(
            "https://drive.google.com/uc?export=download&id={}&confirm=t",
            file_id
        ));
    }

    // MediaFire: https://www.mediafire.com/file/<id>/...
    if url.contains("mediafire.com/file/") {
        // Scrape the direct download link from the page
        let page = client.get(url).send().await?.text().await?;
        // Look for the download button href
        if let Some(start) = page.find("href=\"https://download") {
            let link_start = start + 6;
            if let Some(end) = page[link_start..].find('"') {
                return Ok(page[link_start..link_start + end].to_string());
            }
        }
        return Err("Could not find MediaFire download link".into());
    }

    // Direct link — return as-is
    Ok(url.to_string())
}

/// Download a modpack from URL to local path
pub async fn download_modpack(url: &str, dest: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let download_url = resolve_download_url(url).await?;

    let client = reqwest::Client::builder()
        .user_agent("McBlox/0.1.0")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;

    let response = client.get(&download_url).send().await?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()).into());
    }

    let bytes = response.bytes().await?;
    let mut file = std::fs::File::create(dest)?;
    file.write_all(&bytes)?;

    Ok(())
}

/// Extract a modpack zip into the instance directory
pub fn extract_modpack(zip_path: &Path, instance_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();

        // Security: prevent path traversal
        if name.contains("..") {
            continue;
        }

        let out_path = instance_dir.join(&name);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }

    Ok(())
}
