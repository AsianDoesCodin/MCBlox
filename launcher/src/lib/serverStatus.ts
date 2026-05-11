import type { Game } from "../types";

const API_BASE = "https://api.mcsrvstat.us/3/";
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

interface ServerStatus {
  online: boolean;
  playersOnline: number;
  playersMax: number | null;
}

const cache = new Map<string, { fetchedAt: number; status: ServerStatus }>();

export function normalizeServerAddress(address: string | null | undefined) {
  return String(address || "")
    .trim()
    .replace(/^minecraft:\/\//i, "")
    .replace(/^mc:\/\//i, "")
    .replace(/^https?:\/\//i, "")
    .split(/[/?#]/)[0]
    .trim();
}

function isServerGame(game: Game) {
  return game.game_type === "server" && Boolean(normalizeServerAddress(game.server_address));
}

export async function fetchServerStatus(address: string | null | undefined): Promise<ServerStatus | null> {
  const normalized = normalizeServerAddress(address);
  if (!normalized) return null;

  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.status;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${encodeURIComponent(normalized)}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Server status returned ${response.status}`);

    const data = await response.json();
    const status: ServerStatus = {
      online: Boolean(data?.online),
      playersOnline: Number.isFinite(data?.players?.online) ? data.players.online : 0,
      playersMax: Number.isFinite(data?.players?.max) ? data.players.max : null,
    };
    cache.set(normalized, { fetchedAt: Date.now(), status });
    return status;
  } catch (error) {
    console.warn("Failed to fetch Minecraft server status:", normalized, error);
    const status: ServerStatus = { online: false, playersOnline: 0, playersMax: null };
    cache.set(normalized, { fetchedAt: Date.now(), status });
    return status;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function hydrateServerStatuses(games: Game[]) {
  await Promise.allSettled(games.filter(isServerGame).map(async (game) => {
    const status = await fetchServerStatus(game.server_address);
    if (!status) return;
    game.server_online = status.online;
    game.player_count = status.online ? status.playersOnline : 0;
    game.max_players = status.playersMax;
    game.server_status_checked_at = new Date().toISOString();
  }));
  return games;
}
