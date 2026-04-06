use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// Azure AD public client ID — same one used by Prism Launcher
// This is a public MSAL client registered for Minecraft auth
const MSA_CLIENT_ID: &str = "c36a9fb6-4f2a-41ff-9ce8-1571f6852085";

const MSA_DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const MSA_TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub msa_refresh_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct MsaTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    #[allow(dead_code)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct XboxAuthResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}

#[derive(Debug, Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxXui>,
}

#[derive(Debug, Deserialize)]
struct XboxXui {
    uhs: String,
}

#[derive(Debug, Deserialize)]
struct McAuthResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct McProfileResponse {
    id: String,
    name: String,
}

/// Step 1: Request a device code from Microsoft
pub async fn request_device_code(client: &reqwest::Client) -> Result<DeviceCodeResponse, String> {
    let params = [
        ("client_id", MSA_CLIENT_ID),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let resp = client
        .post(MSA_DEVICE_CODE_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Device code request failed: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Device code request failed ({}): {}", status, text));
    }

    // Azure AD v2 returns JSON
    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse device code response: {} — raw: {}", e, &text[..200.min(text.len())]))?;

    Ok(DeviceCodeResponse {
        user_code: parsed["user_code"].as_str().unwrap_or_default().to_string(),
        device_code: parsed["device_code"].as_str().unwrap_or_default().to_string(),
        verification_uri: parsed["verification_uri"].as_str()
            .unwrap_or("https://www.microsoft.com/link").to_string(),
        interval: parsed["interval"].as_u64().unwrap_or(5),
        expires_in: parsed["expires_in"].as_u64().unwrap_or(900),
    })
}

/// Step 2: Poll for the MSA token (user enters code in browser)
pub async fn poll_for_msa_token(
    client: &reqwest::Client,
    device_code: &str,
    interval: u64,
) -> Result<(String, Option<String>), String> {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;

        let params = [
            ("client_id", MSA_CLIENT_ID),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ];

        let resp = client
            .post(MSA_TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token poll failed: {}", e))?;

        let text = resp.text().await.map_err(|e| format!("Failed to read token response: {}", e))?;

        // Check if it's a JSON error (authorization_pending) or URL-encoded
        if text.contains("authorization_pending") {
            continue;
        }
        if text.contains("authorization_declined") || text.contains("expired_token") {
            return Err("Authentication was declined or expired.".to_string());
        }

        // Try JSON parse first
        if let Ok(token_resp) = serde_json::from_str::<MsaTokenResponse>(&text) {
            if !token_resp.access_token.is_empty() {
                return Ok((token_resp.access_token, token_resp.refresh_token));
            }
        }

        // Try URL-encoded parse
        let parsed: std::collections::HashMap<String, String> = 
            url::form_urlencoded::parse(text.as_bytes())
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();

        if let Some(token) = parsed.get("access_token") {
            return Ok((token.clone(), parsed.get("refresh_token").cloned()));
        }

        if let Some(err) = parsed.get("error") {
            if err == "authorization_pending" {
                continue;
            }
            return Err(format!("Auth error: {}", err));
        }
    }
}

/// Step 3: MSA token → Xbox Live token
pub async fn authenticate_xbox(
    client: &reqwest::Client,
    msa_token: &str,
) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", msa_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let resp = client
        .post(XBOX_AUTH_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Xbox auth failed: {}", e))?;

    let xbox: XboxAuthResponse = resp.json().await
        .map_err(|e| format!("Failed to parse Xbox response: {}", e))?;

    let uhs = xbox.display_claims.xui.first()
        .map(|x| x.uhs.clone())
        .unwrap_or_default();

    Ok((xbox.token, uhs))
}

/// Step 4: Xbox → XSTS token
pub async fn authenticate_xsts(
    client: &reqwest::Client,
    xbox_token: &str,
) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbox_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let resp = client
        .post(XSTS_AUTH_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if body.contains("2148916233") {
            return Err("This Microsoft account doesn't have an Xbox account. Please create one at xbox.com.".to_string());
        }
        if body.contains("2148916238") {
            return Err("This account belongs to someone under 18. An adult needs to add them to a Microsoft Family group.".to_string());
        }
        return Err(format!("XSTS error ({}): {}", status, body));
    }

    let xsts: XboxAuthResponse = resp.json().await
        .map_err(|e| format!("Failed to parse XSTS response: {}", e))?;

    let uhs = xsts.display_claims.xui.first()
        .map(|x| x.uhs.clone())
        .unwrap_or_default();

    Ok((xsts.token, uhs))
}

/// Step 5: XSTS → Minecraft access token
pub async fn authenticate_minecraft(
    client: &reqwest::Client,
    xsts_token: &str,
    user_hash: &str,
) -> Result<String, String> {
    let body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_token)
    });

    let resp = client
        .post(MC_AUTH_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MC auth failed: {}", e))?;

    let mc: McAuthResponse = resp.json().await
        .map_err(|e| format!("Failed to parse MC auth response: {}", e))?;

    Ok(mc.access_token)
}

/// Step 6: Get Minecraft profile (username + UUID)
pub async fn get_minecraft_profile(
    client: &reqwest::Client,
    mc_token: &str,
) -> Result<(String, String), String> {
    let resp = client
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {}", mc_token))
        .send()
        .await
        .map_err(|e| format!("Profile request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err("This Microsoft account doesn't own Minecraft Java Edition.".to_string());
    }

    let profile: McProfileResponse = resp.json().await
        .map_err(|e| format!("Failed to parse profile: {}", e))?;

    Ok((profile.name, profile.id))
}

/// Full auth flow: Device code → MSA → Xbox → XSTS → MC token → Profile
pub async fn full_auth_flow(
    client: &reqwest::Client,
    msa_token: &str,
    refresh_token: Option<String>,
) -> Result<McAccount, String> {
    // Xbox Live
    let (xbox_token, _uhs) = authenticate_xbox(client, msa_token).await?;

    // XSTS
    let (xsts_token, user_hash) = authenticate_xsts(client, &xbox_token).await?;

    // Minecraft
    let mc_token = authenticate_minecraft(client, &xsts_token, &user_hash).await?;

    // Profile
    let (username, uuid) = get_minecraft_profile(client, &mc_token).await?;

    Ok(McAccount {
        username,
        uuid,
        access_token: mc_token,
        msa_refresh_token: refresh_token,
    })
}

/// Refresh an existing session using the MSA refresh token
pub async fn refresh_auth(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<McAccount, String> {
    let params = [
        ("client_id", MSA_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let resp = client
        .post(MSA_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    let text = resp.text().await.map_err(|e| format!("Failed to read refresh response: {}", e))?;

    // Try JSON first
    if let Ok(token_resp) = serde_json::from_str::<MsaTokenResponse>(&text) {
        if !token_resp.access_token.is_empty() {
            return full_auth_flow(client, &token_resp.access_token, token_resp.refresh_token).await;
        }
    }

    // Try URL-encoded
    let parsed: std::collections::HashMap<String, String> = 
        url::form_urlencoded::parse(text.as_bytes())
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

    if let Some(token) = parsed.get("access_token") {
        return full_auth_flow(client, token, parsed.get("refresh_token").cloned()).await;
    }

    Err("Failed to refresh token. Please sign in again.".to_string())
}

/// Save account to disk
pub fn save_account(account: &McAccount) -> Result<(), String> {
    let path = get_accounts_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(account).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load saved account
pub fn load_account() -> Option<McAccount> {
    let path = get_accounts_path();
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

/// Delete saved account
pub fn delete_account() -> Result<(), String> {
    let path = get_accounts_path();
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn get_accounts_path() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("McBlox").join("accounts.json")
}
