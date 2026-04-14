// Profile page — uses shared supabase-client.js for auth

const profileId = new URLSearchParams(window.location.search).get('id');

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function gameCardHTML(game) {
  const thumbContent = game.thumbnail_url
    ? `<img src="${encodeURI(game.thumbnail_url)}" alt="${escapeHtml(game.title)}">`
    : '';
  const players = game.player_count || 0;
  const likes = game.thumbs_up || 0;
  const dislikes = game.thumbs_down || 0;
  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;
  const tag = (game.tags || [])[0] || '';
  const type = game.game_type === 'server' ? 'Multiplayer' : 'Singleplayer';

  return `
    <a class="game-card" href="game.html?id=${game.id}">
      <div class="thumb">${thumbContent}${players > 0 ? `<div class="badge"><span class="dot"></span>${players}</div>` : ''}</div>
      <div class="body">
        <div class="title">${escapeHtml(game.title)}</div>
        <div class="sub">${escapeHtml(game.author)} · ${escapeHtml(game.mc_version || '')} ${escapeHtml(game.loader || '')}</div>
        <div class="bottom">
          ${total > 0 ? `<div class="rating">⭐ ${pct}%</div>` : '<div></div>'}
          ${tag ? `<div class="tag">${escapeHtml(tag)}</div>` : ''}
        </div>
        <div class="type-label">${type}</div>
      </div>
    </a>
  `;
}

async function loadProfile() {
  const userId = profileId || getUser()?.id;
  if (!userId) return;

  const sb = getSupabase();
  if (!sb) return;

  // Profile info
  const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (profile) {
    document.getElementById('profile-name').textContent = profile.username || 'Unknown';
    document.getElementById('profile-sub').textContent = `Joined ${new Date(profile.created_at || Date.now()).toLocaleDateString()}`;
    if (profile.avatar_url) {
      document.getElementById('profile-avatar').innerHTML = `<img src="${encodeURI(profile.avatar_url)}" alt="">`;
    }
  }

  // Player counts
  const twoMinAgo = new Date(Date.now() - 120000).toISOString();
  const { data: activity } = await sb.from('player_activity').select('game_id').gte('last_heartbeat', twoMinAgo);
  const playerCounts = {};
  if (activity) activity.forEach(r => { playerCounts[r.game_id] = (playerCounts[r.game_id] || 0) + 1; });

  // Games
  const { data: games } = await sb.from('games').select('*, profiles:creator_id(username)').eq('creator_id', userId).eq('status', 'approved');
  const grid = document.getElementById('profile-games');
  const empty = document.getElementById('profile-empty');

  if (!games || games.length === 0) { grid.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  grid.innerHTML = games.map(g => {
    let fakeCount = 0;
    if (g.fake_players_enabled) {
      const min = g.fake_players_min || 0, max = g.fake_players_max || 0;
      if (max > 0) {
        const bucket = Math.floor(Date.now() / 30000);
        let h = 0; const seed = g.id + bucket;
        for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
        fakeCount = min + (Math.abs(h) % (max - min + 1));
      }
    }
    g.player_count = (playerCounts[g.id] || 0) + fakeCount;
    g.author = g.profiles?.username || 'Unknown';
    return gameCardHTML(g);
  }).join('');
}

// Load on auth ready (Supabase may not have session yet when script runs)
onAuthChange(() => loadProfile());
// Also try immediately in case auth is already ready
loadProfile();
