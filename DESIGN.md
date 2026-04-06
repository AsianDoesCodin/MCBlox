# McBlox — Design Document

> A Roblox-style launcher for Minecraft. Browse games, click Play, it just works.

---

## 1. Product Vision

McBlox is a desktop launcher that turns Minecraft into a **Roblox-like platform**. Players open McBlox, browse a catalog of community-made games (modpacks + servers/worlds), and click Play. The launcher handles everything — downloading mods, installing the right Minecraft version, managing Java, and launching directly into the game. No menus, no setup, no friction.

Creators publish games through the launcher itself, referencing modpacks hosted on Modrinth/CurseForge. A review queue ensures quality before games go live.

---

## 2. Core User Flows

### Player Flow
```
Open McBlox → Sign in (Microsoft + Discord optional)
  → Browse game catalog (grid view)
  → Click a game → See details (screenshots, description, ratings, player count)
  → Click "Play"
  → Launcher downloads MC + mods + Java (if needed)
  → Minecraft launches directly into the game
  → Player closes MC → Returns to McBlox
```

### Creator Flow
```
Open McBlox website → Sign in → Go to Creator Dashboard
  → Click "Publish Game"
  → Enter: Modrinth/CurseForge modpack URL (or MediaFire/GDrive link),
    server IP (optional), world file URL (optional),
    metadata (title, description, category)
  → Upload thumbnail/banner → forced crop tool (16:9 ratio)
  → Upload screenshots → forced crop tool
  → Submit for review
  → After approval → Game appears in catalog
```

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────┐
│                    McBlox Launcher                     │
│                   (Tauri + React)                      │
│                                                        │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐    │
│  │  Auth    │  │  Game     │  │  Instance Manager  │   │
│  │  Module  │  │  Catalog  │  │  (MC + Mods + Java)│   │
│  └────┬────┘  └─────┬────┘  └────────┬──────────┘    │
│       │              │                │                 │
└───────┼──────────────┼────────────────┼─────────────── ┘
        │              │                │
        ▼              ▼                ▼
  ┌──────────┐  ┌───────────┐  ┌──────────────────┐
  │ Microsoft │  │ Supabase  │  │ Modrinth /       │
  │ OAuth     │  │ Backend   │  │ CurseForge APIs  │
  │ (MC auth) │  │ (DB/Auth/ │  │ (Mod downloads)  │
  │           │  │  Storage) │  │                  │
  └──────────┘  └───────────┘  └──────────────────┘
```

### 3.1 Frontend — Tauri Launcher (Desktop App)
- **Framework:** Tauri v2 (Rust backend + web frontend)
- **UI:** React + TypeScript (embedded in Tauri webview)
- **Styling:** Tailwind CSS
- **Platform:** Windows only (MVP)

### 3.2 Backend — Supabase
- **Auth:** McBlox accounts (email/password + Discord OAuth optional)
- **Database:** PostgreSQL (game listings, creators, ratings, player activity)
- **Storage:** Thumbnails, screenshots, icons (NOT mods — those come from Modrinth/CF)
- **Realtime:** Player activity heartbeats (for singleplayer player counts)
- **Edge Functions:** Game submission validation, modpack URL verification, promotion logic

### 3.3 Mod/Asset Hosting — Modrinth + CurseForge + MediaFire + Google Drive
- Games reference modpacks by ID/URL on Modrinth or CurseForge
- **OR** creators provide a MediaFire / Google Drive link to a modpack ZIP
- Launcher uses Modrinth/CF APIs to resolve + download mod files when available
- For MediaFire/GDrive links, launcher downloads the ZIP and extracts it into the instance
- Mod loader (Forge/Fabric/NeoForge) auto-detected from modpack metadata or specified by creator
- **Zero storage cost to us** — mods served from external CDNs/hosts

### 3.4 Minecraft Launching
- **Microsoft OAuth2 Device Code Flow** (same as Prism Launcher)
  - Player gets a code → opens browser → signs into Microsoft
  - Launcher receives Minecraft access token
- **Java Management:** Auto-download correct Java version (17 for 1.18+, 21 for 1.21+)
- **Instance Isolation:** Each game = its own `.mcblox/instances/<game-id>/` folder
  - Separate `.minecraft` directory per game
  - No cross-contamination between games
- **Auto-Join Mod:** A dedicated lightweight mod (to be built later) injected into server-based games
  - Skips main menu → auto-connects to server
  - Replaces "Disconnect" with "Close Minecraft"

---

## 4. Tech Stack

| Component | Technology | Cost |
|---|---|---|
| Launcher shell | Tauri v2 (Rust) | Free |
| Launcher UI | React + TypeScript + Tailwind | Free |
| Backend / DB / Auth | Supabase (free tier) | Free |
| Mod downloads | Modrinth API + CurseForge API + MediaFire + Google Drive | Free |
| Website (download page) | GitHub Pages | Free |
| MC authentication | Microsoft OAuth2 (Xbox Live → MC) | Free |
| Java runtime | Adoptium/Azul auto-download | Free |
| Monetization | Promoted game listings (Supabase) | Revenue |

---

## 5. Database Schema (Supabase PostgreSQL)

### `profiles` (extends Supabase auth.users)
| Column | Type | Notes |
|---|---|---|
| id | uuid (FK → auth.users) | Primary key |
| username | text (unique) | Display name |
| avatar_url | text | Profile picture |
| discord_id | text (nullable) | Linked Discord account |
| is_creator | boolean | Can publish games |
| created_at | timestamptz | |

### `games`
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| creator_id | uuid (FK → profiles) | Who made it |
| title | text | Game name |
| description | text | Rich text description |
| category | enum | Adventure, PvP, Creative, Survival, Minigame, RPG, Horror, Other |
| thumbnail_url | text | Main image (Supabase Storage) |
| screenshots | text[] | Array of image URLs |
| modpack_provider | enum | 'modrinth', 'curseforge', 'mediafire', or 'gdrive' |
| modpack_id | text | Modpack project ID/slug (Modrinth/CF) or direct URL (MediaFire/GDrive) |
| modpack_version_id | text (nullable) | Specific version, null = latest |
| server_address | text (nullable) | IP:port for multiplayer games |
| world_url | text (nullable) | Download URL for singleplayer world |
| custom_configs | jsonb | Config overrides (options.txt, etc.) |
| inject_autojoin | boolean | Whether to inject the auto-join mod |
| status | enum | 'pending_review', 'approved', 'rejected', 'unlisted' |
| is_promoted | boolean | Paid promotion |
| promoted_until | timestamptz (nullable) | Promotion expiry |
| thumbs_up | integer | Like count |
| thumbs_down | integer | Dislike count |
| total_plays | bigint | Lifetime play count |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `game_ratings`
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| game_id | uuid (FK → games) | |
| user_id | uuid (FK → profiles) | |
| is_positive | boolean | true = thumbs up, false = thumbs down |
| created_at | timestamptz | |
| **unique** | (game_id, user_id) | One rating per user per game |

### `player_activity`
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid (FK → profiles) | |
| game_id | uuid (FK → games) | |
| status | enum | 'playing', 'offline' |
| last_heartbeat | timestamptz | Updated every 60s while playing |
| started_at | timestamptz | |

### `friendships`
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| requester_id | uuid (FK → profiles) | Who sent the request |
| addressee_id | uuid (FK → profiles) | Who received it |
| status | enum | 'pending', 'accepted', 'blocked' |
| created_at | timestamptz | |
| **unique** | (requester_id, addressee_id) | |

### `game_reviews` (for future text reviews)
Reserved for Phase 4.

---

## 6. Game Manifest Format

When the launcher downloads a game, it creates a local manifest:

```json
{
  "mcblox_version": "1.0",
  "game_id": "uuid-here",
  "title": "Epic Adventure RPG",
  "modpack": {
    "provider": "modrinth",
    "project_id": "abc123",
    "version_id": "xyz789",
    "download_url": null,
    "mc_version": "1.21.1",
    "mod_loader": "fabric",
    "mod_loader_version": "0.16.14"
  },
  "server": {
    "address": "play.epicrpg.com",
    "port": 25565
  },
  "world": null,
  "inject_autojoin": true,
  "custom_configs": {
    "options.txt": {
      "renderDistance": "12",
      "guiScale": "3"
    }
  },
  "java": {
    "required_version": 21,
    "min_memory_mb": 4096,
    "max_memory_mb": 8192
  },
  "installed_version": "xyz789",
  "last_played": "2026-04-07T12:00:00Z"
}
```

---

## 7. Key Features

### 7.1 Game Catalog (Home Screen)
- **Roblox-style grid** of game cards (thumbnail + title + player count + rating)
- **Search bar** — search by name
- **Categories** — Adventure, PvP, Creative, Survival, Minigame, RPG, Horror, Other
- **Sorting** — Most Popular, Newest, Top Rated
- **Trending / Featured section** at top (includes promoted games)

### 7.2 Game Detail Page
- Thumbnail + screenshots carousel
- Description
- Live player count (hybrid: server ping for multiplayer, heartbeat for singleplayer)
- Thumbs up / down rating
- **"Play" button** — the star of the show

### 7.3 Instance Manager (Rust Backend)
- Downloads Minecraft client JARs (from Mojang's version manifest)
- Downloads + installs mod loader (Forge/Fabric/NeoForge)
- Downloads modpack mods via Modrinth/CurseForge API
- Downloads Java runtime if needed (Adoptium API)
- Creates isolated instance directories
- Injects auto-join mod when configured
- Applies custom configs
- Launches Minecraft with correct classpath + auth token

### 7.4 Update System
- **Auto-update on launch** (default): When player clicks Play, check if modpack has a newer version → download delta → launch
- **Manual update**: Player can defer updates and play current version
- **Launcher self-update**: Tauri's built-in updater

### 7.5 Friends System
- Discord OAuth (optional) to link accounts
- Add friends by McBlox username or Discord
- See what game friends are playing
- "Join Friend" button (if game is multiplayer)

### 7.6 Persistent Settings
- Per-game keybinds, video settings, etc. stored in each instance
- Persist across updates (config files preserved during modpack updates)

### 7.7 Creator Tools (In-Launcher)
- "Publish Game" tab (only for creator-flagged accounts)
- Form: modpack URL, server IP, world file, metadata, screenshots
- Preview before submission
- Review queue status tracking
- Analytics: play count, ratings, trends

### 7.8 Monetization — Promoted Listings
- Creators can pay to feature their game in the "Featured" section
- Promoted games get a badge + priority placement
- Time-limited (e.g., 7 days, 30 days)
- Managed via Supabase (is_promoted flag + promoted_until timestamp)

---

## 8. Launcher Directory Structure

```
~/.mcblox/
├── config.json              # Launcher settings
├── accounts.json            # Microsoft auth tokens (encrypted)
├── java/
│   ├── java-17/             # Auto-downloaded JRE 17
│   └── java-21/             # Auto-downloaded JRE 21
├── instances/
│   ├── <game-id-1>/
│   │   ├── .minecraft/
│   │   │   ├── mods/
│   │   │   ├── config/
│   │   │   ├── saves/       # For singleplayer games
│   │   │   ├── options.txt
│   │   │   └── ...
│   │   └── manifest.json    # McBlox game manifest
│   └── <game-id-2>/
│       └── ...
├── cache/
│   ├── modpacks/            # Cached modpack ZIPs
│   └── thumbnails/          # Cached game images
└── logs/
    └── launcher.log
```

---

## 9. API Integrations

### Mojang / Microsoft Auth
1. Device Code Flow → Microsoft OAuth → Xbox Live token → XSTS token → Minecraft token
2. Validate Minecraft ownership
3. Get player profile (username, UUID, skin)

### Modrinth API
- `GET /project/{id}` — modpack info
- `GET /project/{id}/version` — list versions
- `GET /version/{id}` — specific version + file URLs
- Download mod files from CDN URLs in version response

### CurseForge API (requires API key)
- `GET /v1/mods/{modId}` — modpack info
- `GET /v1/mods/{modId}/files` — list files
- `GET /v1/mods/{modId}/files/{fileId}/download-url` — download URL
- Need to apply for a CurseForge API key (free for open-source projects)

### Mojang Version Manifest
- `GET https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- Get Minecraft client JAR, assets, libraries for any version

### MediaFire
- Scrape direct download link from MediaFire page URL
- No official API — parse the download page to extract the direct file link
- Validate file hash after download

### Google Drive
- Use `https://drive.google.com/uc?export=download&id={FILE_ID}` for direct downloads
- Handle large file confirmation page (virus scan warning)
- Extract file ID from shared link

### Adoptium API (Java Downloads)
- `GET /v3/assets/latest/{feature_version}/hotspot` — latest JRE builds
- Download JRE for Windows x64

---

## 10. Phased Roadmap

### Phase 1 — Foundation (Current)
- [x] Design document (this file)
- [ ] Supabase project setup (schema, auth, storage buckets, RLS policies)
- [ ] GitHub Pages download/landing page
- [ ] Tauri project scaffold (Rust + React + TypeScript + Tailwind)

### Phase 2 — Core Launcher MVP
- [ ] Microsoft OAuth login flow
- [ ] Mojang version manifest parsing + MC client download
- [ ] Mod loader installation (Fabric first, then Forge/NeoForge)
- [ ] Modrinth API integration (resolve modpack → download mods)
- [ ] CurseForge API integration
- [ ] Java auto-download (Adoptium)
- [ ] Instance creation + isolation
- [ ] Minecraft process launching with auth
- [ ] Single hardcoded game: click Play → MC launches into game

### Phase 3 — Game Catalog + Discovery
- [ ] Supabase Auth integration (McBlox accounts)
- [ ] Game catalog UI (Roblox-style grid)
- [ ] Search, categories, sorting
- [ ] Game detail page (screenshots, description, rating, player count)
- [ ] Trending / Featured section
- [ ] Live player count (server ping + heartbeat)
- [ ] Thumbs up/down rating system

### Phase 4 — Creator Tools
- [ ] Creator role + in-launcher publish flow
- [ ] Game submission form (modpack URL, server IP, world, metadata)
- [ ] Review queue system (admin approval)
- [ ] Creator analytics dashboard

### Phase 5 — Social + Polish
- [ ] Friends system (Discord OAuth + username-based)
- [ ] "See what friends are playing" + "Join Friend"
- [ ] Game update system (auto-update + manual option)
- [ ] Launcher self-update (Tauri updater)
- [ ] Promoted listings (monetization)
- [ ] Persistent per-game settings across updates

### Phase 6 — Scale
- [ ] macOS + Linux support
- [ ] In-launcher chat (Supabase Realtime)
- [ ] Text reviews
- [ ] Recommendation engine
- [ ] Creator verification / badges

---

## 11. Security Considerations

- **Microsoft auth tokens** encrypted at rest (OS keychain via Tauri)
- **Supabase RLS policies** — users can only modify their own data
- **Mod download verification** — validate file hashes from Modrinth/CF API
- **Review queue** — prevent malicious modpacks from being listed
- **Rate limiting** on Supabase Edge Functions
- **No credentials in client code** — Supabase anon key only, all sensitive ops in Edge Functions
- **CurseForge API key** stored server-side (Edge Function), not in launcher

---

## 12. Open Questions

1. **CurseForge API key** — Need to apply. Requires project to be "open source" or approved.
2. **Modpack licensing** — Some modpacks restrict redistribution. McBlox only links to them (like a browser), doesn't rehost.
3. **Microsoft auth compliance** — Must follow Microsoft's third-party launcher guidelines.
4. **Singleplayer world hosting** — Where do creators upload world files? Options: Supabase Storage (1GB limit), external hosting (creator provides URL), or a dedicated file host.
5. **Auto-join mod** — Needs to be built. Lightweight, injects server address from a config file the launcher writes.
