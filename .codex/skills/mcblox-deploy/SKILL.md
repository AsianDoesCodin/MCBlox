---
name: mcblox-deploy
description: Deploy and release McBlox launcher and website. Use when building the Tauri app, bumping versions, signing releases, uploading to GitHub Releases, deploying GitHub Pages, updating latest.json for the auto-updater, or troubleshooting release issues.
---

# McBlox Deploy

## Project

- Repo: `github.com/AsianDoesCodin/MCBlox`
- Launcher: Tauri v2 app in `launcher/`
- Website: static site in `docs/`, deployed to GitHub Pages at `https://www.mcblox.online`
- Backend: hosted Supabase; no deploy step

## Release Checklist

Before a launcher release:

1. Read current version from `launcher/package.json`; next patch release is current + `0.0.1`.
2. Ensure `launcher/` dependencies are installed with `npm install`.
3. Confirm Rust is available with `rustc --version`.
4. Confirm GitHub CLI auth with `gh auth status`.
5. Do not commit `docs-old/`; it is a local archive only.

## Launcher Release

Update version in all three files:

- `launcher/package.json`: `"version"`
- `launcher/src-tauri/tauri.conf.json`: `"version"`
- `launcher/src-tauri/Cargo.toml`: `version` under `[package]`

Build from `launcher/`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content ~/.tauri/mcblox2.key -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri build
```

The signing key has no password. Use an empty password if prompted.

### Mandatory Signing Prompt Rule

In Codex on Joshua's Windows machine, the signer password prompt is not usable in hidden/background shell commands, even when `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is set to an empty string.

Therefore, after `npm run tauri build` finishes bundling and there is a `.nsis.zip` but no `.nsis.zip.sig`, **do not retry `npm run tauri build` in the hidden shell**. Treat the hidden signer prompt as the expected result every time.

Never phrase this as conditional uncertainty such as "if the hidden signer hangs." It always hangs in Codex on Joshua's Windows machine. Once the versioned `.nsis.zip` exists and the matching `.nsis.zip.sig` does not, immediately stop the hidden build processes and open the visible signer window.

The expected hidden build stopping point is output like:

- `Finished 2 bundles at:`
- `.nsis.zip (updater)`
- no matching `.nsis.zip.sig`

At that point the build is waiting for the signing password prompt. Codex must stop the stuck hidden build processes and open a **visible interactive PowerShell window specifically so Joshua can press Enter** at the empty-password prompt.

If the versioned `.nsis.zip` already exists, skip rebuilding and go straight to the visible signing window.

Stop any stuck `node`/Tauri build processes first:

```powershell
Get-Process | Where-Object { $_.ProcessName -match 'node|npm|tauri' } |
  Stop-Process -Force
```

Then create and launch a visible signing window:

```powershell
$script = @'
Set-Location "C:\Users\Joshua\Desktop\Minecraft Stuff\McBlox\launcher"
$version = "0.4.18"
$zip = "src-tauri\target\release\bundle\nsis\McBlox_${version}_x64-setup.nsis.zip"
$sigPath = "$zip.sig"

$sig = npx tauri signer sign $zip -f "$HOME\.tauri\mcblox2.key"
[System.IO.File]::WriteAllText($sigPath, ($sig -join "`n").Trim() + "`n", (New-Object System.Text.UTF8Encoding $false))
Write-Host "Signature written to $sigPath" -ForegroundColor Green
Read-Host "Press Enter to close this signer window"
'@

$path = Join-Path $env:TEMP "mcblox-sign-$version.ps1"
[System.IO.File]::WriteAllText($path, $script, (New-Object System.Text.UTF8Encoding $false))
Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $path)
```

Tell Joshua: "A visible PowerShell signer window is open. Press Enter when it shows `Password:`. Tell me when it says the signature was written."

After Joshua confirms, verify the signature exists before publishing:

```powershell
Get-Item "src-tauri\target\release\bundle\nsis\McBlox_<version>_x64-setup.nsis.zip.sig"
```

Expected Windows NSIS outputs:

- `launcher/src-tauri/target/release/bundle/nsis/McBlox_<version>_x64-setup.exe`
- `launcher/src-tauri/target/release/bundle/nsis/McBlox_<version>_x64-setup.nsis.zip`
- `launcher/src-tauri/target/release/bundle/nsis/McBlox_<version>_x64-setup.nsis.zip.sig`

Create `latest.json` using the `.nsis.zip.sig` contents:

```json
{
  "version": "<version>",
  "notes": "<brief changelog>",
  "pub_date": "<ISO 8601 UTC timestamp>",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of .nsis.zip.sig>",
      "url": "https://github.com/AsianDoesCodin/MCBlox/releases/download/v<version>/McBlox_<version>_x64-setup.nsis.zip"
    }
  }
}
```

Write `latest.json` without BOM:

```powershell
[System.IO.File]::WriteAllText("latest.json", $json, (New-Object System.Text.UTF8Encoding $false))
```

Upload release assets:

```powershell
gh release create v<version> --title "v<version>" --notes "<changelog>" `
  "launcher/src-tauri/target/release/bundle/nsis/McBlox_<version>_x64-setup.exe" `
  "launcher/src-tauri/target/release/bundle/nsis/McBlox_<version>_x64-setup.nsis.zip" `
  "latest.json"
```

Update an existing release:

```powershell
gh release upload v<version> <files> --clobber
```

Verify the GitHub release, `latest.json` signature and URL, and auto-update from an older installed version.

## Website Deploy

Website changes live in `docs/` and deploy from `master` through GitHub Pages.

1. Change files in `docs/`.
2. Bump `?v=YYYYMMDD` cache-busting query params for changed scripts/styles.
3. Commit and push to `master`.
4. Verify `https://www.mcblox.online` after Pages rebuilds.

Key files:

- `docs/index.html`: landing/download page
- `docs/supabase-client.js`: shared Supabase auth client
- `docs/dashboard.html` and `docs/dashboard.js`: creator game management
- `docs/admin.html` and `docs/admin.js`: admin review panel
- `docs/game.html` and `docs/game.js`: game detail page
- `docs/publish.html` and `docs/publish.js`: publish wizard
- `docs/style.css`: global styles
- `docs/CNAME`: custom domain; do not delete

## Gotchas

- Version must increment by at least `0.0.1`.
- BOM in `latest.json` breaks the Tauri updater JSON parser.
- GitHub Pages caches aggressively; bump changed asset query params.
- Admin `onAuthChange` can double-fire; `_gamesLoaded` prevents duplicate loads.
- Signing key is `~/.tauri/mcblox2.key` with an empty password.
- Public key in `tauri.conf.json` must match the signing key.
- Auto-update only works from v0.2.7+; older versions need manual install.
- `Cargo.lock` may need updating after `Cargo.toml` version bump; run `cargo check` in `launcher/src-tauri/`.
- Updater endpoint is configured in `tauri.conf.json` under `plugins.updater.endpoints`.
- Windows x64 NSIS is the only current launcher target.

## Supabase

- URL: `https://ldipundnojizgnykqvdd.supabase.co`
- Anon key: `sb_publishable_l5NXtUaTUkl6zzEMZlBAjw_fw-8YJb7`
- Anon key locations: `docs/supabase-client.js` and `launcher/.env`
- Storage bucket: `MCBlox`
- Schema: `supabase/schema.sql`
- Schema changes are applied through the Supabase dashboard SQL editor.

## Supabase SQL Handoff

Codex does not have Supabase dashboard access. When website code depends on new tables, policies, or RPCs, give the user a SQL snippet and explicitly tell them to paste it into Supabase SQL Editor.

For admin access, use database-backed admin membership instead of client-side admin UUID lists:

```sql
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
  on public.admin_users for select
  using (public.current_user_is_admin());

drop policy if exists "Admins can read all games" on public.games;
create policy "Admins can read all games"
  on public.games for select
  using (public.current_user_is_admin());

drop policy if exists "Admins can update all games" on public.games;
create policy "Admins can update all games"
  on public.games for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
```

Then tell the user to add their admin Auth UID:

```sql
insert into public.admin_users (user_id)
values ('YOUR-AUTH-USER-UUID-HERE')
on conflict (user_id) do nothing;
```

## Local Keys

- Tauri signing private key: `~/.tauri/mcblox2.key`
- Tauri signing password: empty string
- Tauri updater public key: `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDc3RUIyRTYyOEEzMzhEOTYKUldTV2pUT0tZaTdyZDhERjgzbEMzVTJya0FkQzZvUmlqZW0ySE9ZQU9vYkdaRG9vWlN4cWFlb0oK`
