use std::io::Write;
use std::path::Path;

/// Download a modpack from URL to local path
pub async fn download_modpack(url: &str, dest: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let response = reqwest::get(url).await?;

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
