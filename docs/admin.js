// Admin panel — uses shared supabase-client.js for auth
// ADMIN_IDS is defined in supabase-client.js

const adminGate = document.getElementById('admin-gate');
const adminPanel = document.getElementById('admin-panel');
const signinBtn = document.getElementById('signin-btn');
const adminQueue = document.getElementById('admin-queue');
const adminEmpty = document.getElementById('admin-empty');
const adminStats = document.getElementById('admin-stats');
const reviewModal = document.getElementById('review-modal');
const reviewContent = document.getElementById('review-content');
const reviewClose = document.getElementById('review-close');
const reviewApprove = document.getElementById('review-approve');
const reviewReject = document.getElementById('review-reject');
const reviewCancel = document.getElementById('review-cancel');

let allGames = [];
let currentTab = 'pending';
let reviewingGame = null;

function updateAdminAuth() {
  const user = getUser();
  // For development: allow any signed-in user. In production, check ADMIN_IDS.
  const isAdmin = user && (ADMIN_IDS.length === 0 || ADMIN_IDS.includes(user.id));

  if (isAdmin) {
    adminGate.style.display = 'none';
    adminPanel.style.display = '';
    loadAllGames();
  } else if (user && !isAdmin) {
    adminGate.innerHTML = '<h2>Access Denied</h2><p style="color:var(--text3)">You are not an admin.</p>';
    adminGate.style.display = '';
    adminPanel.style.display = 'none';
  } else {
    adminGate.style.display = '';
    adminPanel.style.display = 'none';
  }
}

onAuthChange(updateAdminAuth);
signinBtn.addEventListener('click', () => showAuthModal());

// --- Sidebar navigation ---
document.querySelectorAll('.admin-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const section = item.dataset.section;
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + section).classList.add('active');
    // Lazy-load section data
    if (section === 'users' && !_usersLoaded) loadUsers();
    if (section === 'stats' && !_statsLoaded) loadStats();
    if (section === 'promotion' && !_promoLoaded) loadPromotion();
  });
});

// --- Tabs ---
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    renderQueue();
  });
});

// --- Load games ---
let _gamesLoaded = false;
async function loadAllGames() {
  if (_gamesLoaded) return;
  _gamesLoaded = true;

  const sb = getSupabase();
  if (!sb) { _gamesLoaded = false; return; }

  try {
    const statuses = ['pending_review', 'approved', 'rejected', 'unlisted'];
    const results = [];

    for (const status of statuses) {
      const { data, error } = await sb
        .from('games')
        .select('*, profiles:creator_id(username)')
        .eq('status', status)
        .order('created_at', { ascending: false });
      if (!error && data) {
        results.push(...data.map(g => ({
          ...g,
          author: g.profiles?.username || 'Unknown'
        })));
      }
    }

    allGames = results;
    updateStats();
    renderQueue();
  } catch (e) {
    console.error('Failed to load games:', e);
    _gamesLoaded = false;
  }
}

function updateStats() {
  const pending = allGames.filter(g => g.status === 'pending_review').length;
  const approved = allGames.filter(g => g.status === 'approved').length;
  const rejected = allGames.filter(g => g.status === 'rejected').length;

  adminStats.innerHTML = `
    <span class="stat-badge pending">${pending} pending</span>
    <span class="stat-badge approved">${approved} approved</span>
    <span class="stat-badge rejected">${rejected} rejected</span>
  `;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderQueue() {
  adminQueue.innerHTML = '';

  let filtered;
  if (currentTab === 'pending') {
    filtered = allGames.filter(g => g.status === 'pending_review');
  } else if (currentTab === 'all') {
    filtered = allGames;
  } else {
    filtered = allGames.filter(g => g.status === currentTab);
  }

  if (filtered.length === 0) {
    adminEmpty.style.display = '';
    return;
  }
  adminEmpty.style.display = 'none';

  filtered.forEach(game => {
    const card = document.createElement('div');
    card.className = 'review-card';

    const tags = (game.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const date = new Date(game.created_at).toLocaleDateString();

    const thumbUrl = game.thumbnail_url;
    card.innerHTML = `
      <div class="thumb">${thumbUrl ? `<img src="${encodeURI(thumbUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : '⛏'}</div>
      <div class="info">
        <h3>${escapeHtml(game.title)}${game.is_promoted ? ' <span style="color:var(--yellow);font-size:12px;">★ Featured</span>' : ''}</h3>
        <div class="desc">${escapeHtml(game.description || '')}</div>
        <div class="meta">
          ${tags}
          <span>${game.mc_version} / ${game.mod_loader}</span>
          <span>${game.game_type}</span>
          <span>Submitted ${date}</span>
        </div>
      </div>
      <span class="status-badge ${game.status}">${(game.status || '').replace('_', ' ')}</span>
    `;

    card.addEventListener('click', () => openReview(game));
    adminQueue.appendChild(card);
  });
}

// --- Review modal ---
function openReview(game) {
  reviewingGame = game;

  const tags = (game.tags || []).map(t => `<span style="display:inline-block;padding:2px 8px;background:var(--warm-glow);border:1px solid rgba(255,155,106,0.3);border-radius:var(--r-xs);color:var(--warm);font-size:12px;margin-right:4px;">${escapeHtml(t)}</span>`).join('');

  reviewContent.innerHTML = `
    <div class="review-detail-field">
      <label>Thumbnail</label>
      <div class="value">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div id="review-thumb-preview" style="width:160px;height:90px;border-radius:var(--r-sm);overflow:hidden;border:1px solid var(--border);background:var(--bg3);flex-shrink:0;">
            ${game.thumbnail_url ? `<img src="${encodeURI(game.thumbnail_url)}" style="width:100%;height:100%;object-fit:cover;" id="review-thumb-img">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text4);">No image</div>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <label class="btn btn-sm btn-ghost" style="cursor:pointer;">
              Replace Image
              <input type="file" id="review-thumb-upload" accept="image/*" style="display:none">
            </label>
          </div>
        </div>
      </div>
    </div>
    <div class="review-detail-field">
      <label>Title</label>
      <div class="value">${escapeHtml(game.title)}</div>
    </div>
    <div class="review-detail-field">
      <label>Description</label>
      <div class="value">${escapeHtml(game.description || 'N/A')}</div>
    </div>
    <div class="review-detail-field">
      <label>Tags</label>
      <div class="value">${tags || 'None'}</div>
    </div>
    <div class="review-detail-field">
      <label>Modpack URL</label>
      <div class="value"><a href="${encodeURI(game.modpack_url || '')}" target="_blank" rel="noopener">${escapeHtml(game.modpack_url || 'N/A')}</a></div>
    </div>
    <div class="review-detail-field">
      <label>Minecraft Version / Loader</label>
      <div class="value">${escapeHtml(game.mc_version || '?')} / ${escapeHtml(game.mod_loader || '?')}</div>
    </div>
    <div class="review-detail-field">
      <label>Game Type</label>
      <div class="value">${escapeHtml(game.game_type || '?')}${game.server_address ? ' — ' + escapeHtml(game.server_address) : ''}${game.world_name ? ' — ' + escapeHtml(game.world_name) : ''}</div>
    </div>
    <div class="review-detail-field">
      <label>Current Status</label>
      <div class="value"><span class="status-badge ${game.status}" style="display:inline-block;">${(game.status || '').replace('_', ' ')}</span></div>
    </div>
    <div class="review-detail-field">
      <label>Creator</label>
      <div class="value">${escapeHtml(game.author || 'Unknown')} <span style="font-size:10px;color:var(--text4);">(${game.creator_id || '?'})</span></div>
    </div>
    <div class="review-detail-field">
      <label>Featured / Promoted</label>
      <div class="value">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="review-promote-check" ${game.is_promoted ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--warm);">
          <span style="font-size:13px;">${game.is_promoted ? 'Promoted — appears in Featured section' : 'Not promoted'}</span>
        </label>
      </div>
    </div>
    <div class="review-detail-field">
      <label>Simulated Players</label>
      <div class="value">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="review-fake-players-check" ${game.fake_players_enabled ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--warm);">
          <span id="fake-players-status" style="font-size:13px;">${game.fake_players_enabled ? 'Enabled — random player count shown' : 'Disabled'}</span>
        </label>
        <div id="fake-players-range" style="margin-top:8px;display:${game.fake_players_enabled ? 'flex' : 'none'};gap:10px;align-items:center;">
          <label style="font-size:12px;color:var(--text3);">Min</label>
          <input type="number" id="review-fake-min" value="${game.fake_players_min || 0}" min="0" max="999" style="width:60px;padding:4px 8px;border-radius:6px;border:1px solid rgba(184,169,232,0.15);background:var(--surface2);color:var(--text1);font-size:13px;">
          <label style="font-size:12px;color:var(--text3);">Max</label>
          <input type="number" id="review-fake-max" value="${game.fake_players_max || 0}" min="0" max="999" style="width:60px;padding:4px 8px;border-radius:6px;border:1px solid rgba(184,169,232,0.15);background:var(--surface2);color:var(--text1);font-size:13px;">
          <button id="review-fake-save" style="padding:4px 12px;border-radius:6px;border:none;background:var(--warm);color:#fff;font-size:12px;cursor:pointer;">Save</button>
        </div>
      </div>
    </div>
    <div class="review-detail-field">
      <label>Total Plays</label>
      <div class="value" style="display:flex;align-items:center;gap:10px;">
        <input type="number" id="review-total-plays" value="${game.total_plays || 0}" min="0" style="width:90px;padding:4px 8px;border-radius:6px;border:1px solid rgba(184,169,232,0.15);background:var(--surface2);color:var(--text1);font-size:13px;">
        <button id="review-plays-save" style="padding:4px 12px;border-radius:6px;border:none;background:var(--warm);color:#fff;font-size:12px;cursor:pointer;">Save</button>
        <span id="plays-save-status" style="font-size:11px;color:var(--text4);"></span>
      </div>
    </div>
  `;

  document.getElementById('review-promote-check').addEventListener('change', async (ev) => {
    const promoted = ev.target.checked;
    const sb = getSupabase();
    if (!sb || !reviewingGame) return;
    try {
      const { error } = await sb.from('games').update({ is_promoted: promoted }).eq('id', reviewingGame.id);
      if (error) throw error;
      reviewingGame.is_promoted = promoted;
      ev.target.nextElementSibling.textContent = promoted ? 'Promoted — appears in Featured section' : 'Not promoted';
    } catch (err) {
      ev.target.checked = !promoted;
      showToast('Error: ' + (err.message || 'Unknown'), 'error');
    }
  });

  // Fake players toggle
  document.getElementById('review-fake-players-check').addEventListener('change', async (ev) => {
    const enabled = ev.target.checked;
    const sb = getSupabase();
    if (!sb || !reviewingGame) return;
    try {
      const { error } = await sb.from('games').update({ fake_players_enabled: enabled }).eq('id', reviewingGame.id);
      if (error) throw error;
      reviewingGame.fake_players_enabled = enabled;
      document.getElementById('fake-players-status').textContent = enabled ? 'Enabled — random player count shown' : 'Disabled';
      document.getElementById('fake-players-range').style.display = enabled ? 'flex' : 'none';
    } catch (err) {
      ev.target.checked = !enabled;
      showToast('Error: ' + (err.message || 'Unknown'), 'error');
    }
  });

  // Fake players min/max save
  document.getElementById('review-fake-save').addEventListener('click', async () => {
    const sb = getSupabase();
    if (!sb || !reviewingGame) return;
    const min = parseInt(document.getElementById('review-fake-min').value) || 0;
    const max = parseInt(document.getElementById('review-fake-max').value) || 0;
    if (min > max) { showToast('Min must be ≤ Max', 'error'); return; }
    try {
      const { error } = await sb.from('games').update({ fake_players_min: min, fake_players_max: max }).eq('id', reviewingGame.id);
      if (error) throw error;
      reviewingGame.fake_players_min = min;
      reviewingGame.fake_players_max = max;
      showToast('Simulated player range saved', 'success');
    } catch (err) {
      showToast('Error: ' + (err.message || 'Unknown'), 'error');
    }
  });

  // Total plays save
  document.getElementById('review-plays-save').addEventListener('click', async () => {
    const sb = getSupabase();
    if (!sb || !reviewingGame) return;
    const plays = parseInt(document.getElementById('review-total-plays').value) || 0;
    try {
      const { error } = await sb.from('games').update({ total_plays: plays }).eq('id', reviewingGame.id);
      if (error) throw error;
      reviewingGame.total_plays = plays;
      document.getElementById('plays-save-status').textContent = '✓ Saved';
      setTimeout(() => { const el = document.getElementById('plays-save-status'); if (el) el.textContent = ''; }, 2000);
    } catch (err) {
      showToast('Error: ' + (err.message || 'Unknown'), 'error');
    }
  });

  // Thumbnail upload handler
  document.getElementById('review-thumb-upload').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file || !reviewingGame) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      // Compress image via canvas
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const MAX_W = 1280, MAX_H = 720;
      let w = bitmap.width, h = bitmap.height;
      if (w > MAX_W || h > MAX_H) {
        const scale = Math.min(MAX_W / w, MAX_H / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      const path = `thumbnails/${reviewingGame.id}_${Date.now()}.jpg`;

      const { error: uploadErr } = await sb.storage.from('MCBlox').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = sb.storage.from('MCBlox').getPublicUrl(path);
      const newUrl = urlData.publicUrl;

      const { error: updateErr } = await sb.from('games').update({ thumbnail_url: newUrl }).eq('id', reviewingGame.id);
      if (updateErr) throw updateErr;

      reviewingGame.thumbnail_url = newUrl;
      const preview = document.getElementById('review-thumb-preview');
      preview.innerHTML = `<img src="${encodeURI(newUrl)}" style="width:100%;height:100%;object-fit:cover;" id="review-thumb-img">`;
      renderQueue();
      showToast('Thumbnail updated!', 'success');
    } catch (err) {
      showToast('Failed to upload: ' + (err.message || 'Unknown'), 'error');
    }
  });

  reviewModal.style.display = '';
}

function closeReview() {
  reviewModal.style.display = 'none';
  reviewingGame = null;
}

reviewClose.addEventListener('click', closeReview);
reviewCancel.addEventListener('click', closeReview);
reviewModal.addEventListener('click', (e) => {
  if (e.target === reviewModal) closeReview();
});

reviewApprove.addEventListener('click', () => setGameStatus('approved'));
reviewReject.addEventListener('click', () => setGameStatus('rejected'));

const reviewEdit = document.getElementById('review-edit');
reviewEdit.addEventListener('click', () => openAdminEdit());

async function setGameStatus(status) {
  if (!reviewingGame) return;

  const sb = getSupabase();
  if (!sb) return;

  try {
    const { error } = await sb
      .from('games')
      .update({ status })
      .eq('id', reviewingGame.id);
    if (error) throw error;

    reviewingGame.status = status;
    updateStats();
    renderQueue();
    closeReview();
  } catch (err) {
    showToast('Error updating status: ' + (err.message || 'Unknown error'), 'error');
  }
}

// --- Admin Edit Mode ---
const TAGS = [
  'Adventure', 'RPG', 'PvP', 'Creative', 'Survival',
  'Skyblock', 'Horror', 'Puzzle', 'Minigame', 'Parkour',
  'Tech', 'Magic', 'Quests', 'Building', 'Exploration',
  'Competitive', 'Coop', 'Story', 'Open World', 'Hardcore'
];

function openAdminEdit() {
  if (!reviewingGame) return;
  const game = reviewingGame;

  const tags = (game.tags || []);
  let selectedTags = new Set(tags);

  function renderTagPicker() {
    const picker = document.getElementById('admin-edit-tags');
    if (!picker) return;
    picker.innerHTML = '';
    TAGS.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-btn' + (selectedTags.has(tag) ? ' selected' : '');
      btn.textContent = tag;
      btn.addEventListener('click', () => {
        if (selectedTags.has(tag)) selectedTags.delete(tag);
        else if (selectedTags.size < 5) selectedTags.add(tag);
        renderTagPicker();
      });
      picker.appendChild(btn);
    });
  }

  reviewContent.innerHTML = `
    <form id="admin-edit-form">
      <div class="review-detail-field">
        <label>Title</label>
        <input type="text" id="admin-edit-title" value="${escapeHtml(game.title)}" required maxlength="60">
      </div>
      <div class="review-detail-field">
        <label>Description</label>
        <textarea id="admin-edit-desc" required rows="3" maxlength="500">${escapeHtml(game.description || '')}</textarea>
      </div>
      <div class="review-detail-field">
        <label>Thumbnail</label>
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div id="admin-edit-thumb-preview" style="width:160px;height:90px;border-radius:var(--r-sm);overflow:hidden;border:1px solid var(--border);background:var(--bg3);flex-shrink:0;">
            ${game.thumbnail_url ? `<img src="${encodeURI(game.thumbnail_url)}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text4);">No image</div>'}
          </div>
          <label class="btn btn-sm btn-ghost" style="cursor:pointer;">
            Replace
            <input type="file" id="admin-edit-thumb-input" accept="image/*" style="display:none">
          </label>
        </div>
      </div>
      <div class="review-detail-field">
        <label>Tags</label>
        <div id="admin-edit-tags" class="tag-picker"></div>
      </div>
      <div class="review-detail-field">
        <label>Modpack URL</label>
        <input type="url" id="admin-edit-modpack" value="${escapeHtml(game.modpack_url || '')}" required>
      </div>
      <div class="review-detail-field" style="display:flex;gap:12px;">
        <div style="flex:1;">
          <label>MC Version</label>
          <select id="admin-edit-mc-version">
            <option value="">Loading...</option>
          </select>
        </div>
        <div style="flex:1;">
          <label>Mod Loader</label>
          <select id="admin-edit-mod-loader">
            <option value="fabric" ${game.mod_loader === 'fabric' ? 'selected' : ''}>Fabric</option>
            <option value="forge" ${game.mod_loader === 'forge' ? 'selected' : ''}>Forge</option>
            <option value="neoforge" ${game.mod_loader === 'neoforge' ? 'selected' : ''}>NeoForge</option>
            <option value="quilt" ${game.mod_loader === 'quilt' ? 'selected' : ''}>Quilt</option>
          </select>
        </div>
        <div style="flex:1;">
          <label>Loader Version</label>
          <select id="admin-edit-loader-version">
            <option value="">Loading...</option>
          </select>
        </div>
      </div>
      <div class="review-detail-field" style="display:flex;gap:12px;">
        <div style="flex:1;">
          <label>Game Type</label>
          <select id="admin-edit-game-type">
            <option value="server" ${game.game_type === 'server' ? 'selected' : ''}>Server</option>
            <option value="world" ${game.game_type === 'world' ? 'selected' : ''}>World</option>
          </select>
        </div>
        <div style="flex:1;">
          <label>Server Address / World Name</label>
          <input type="text" id="admin-edit-address" value="${escapeHtml(game.server_address || game.world_name || '')}">
        </div>
      </div>
      <div class="review-detail-field">
        <label class="toggle-label" style="cursor:pointer;">
          <span class="toggle-switch">
            <input type="checkbox" id="admin-edit-auto-join" ${game.auto_join ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </span>
          <span>Auto-Join (McBlox mod auto-connects to server/world on launch)</span>
        </label>
      </div>
    </form>
  `;

  renderTagPicker();

  // Fetch MC versions and populate select
  const mcSelect = document.getElementById('admin-edit-mc-version');
  const loaderSelect = document.getElementById('admin-edit-mod-loader');
  const loaderVerSelect = document.getElementById('admin-edit-loader-version');

  async function fetchWithCorsProxy(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch {
      const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`
      ];
      for (const p of proxies) {
        try { const r = await fetch(p); if (r.ok) return await r.json(); } catch {}
      }
      throw new Error('CORS proxy failed');
    }
  }

  async function loadMcVersions() {
    try {
      const resp = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      const data = await resp.json();
      const releases = data.versions.filter(v => v.type === 'release').map(v => v.id);
      mcSelect.innerHTML = '<option value="">Select MC version</option>';
      releases.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        if (v === game.mc_version) opt.selected = true;
        mcSelect.appendChild(opt);
      });
    } catch { mcSelect.innerHTML = `<option value="${escapeHtml(game.mc_version)}">${escapeHtml(game.mc_version)}</option>`; }
  }

  async function loadLoaderVersions() {
    const mc = mcSelect.value;
    const loader = loaderSelect.value;
    if (!mc || !loader) { loaderVerSelect.innerHTML = '<option value="">Select MC version & loader first</option>'; return; }
    loaderVerSelect.innerHTML = '<option value="">Loading...</option>';
    try {
      let versions = [];
      if (loader === 'forge') {
        try {
          const data = await fetchWithCorsProxy('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json');
          versions = (data[mc] || []).map(v => v.replace(mc + '-', '')).reverse();
        } catch {}
        if (!versions.length) {
          try {
            const data = await fetchWithCorsProxy('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
            const p = data.promos || {};
            if (p[`${mc}-recommended`]) versions.push(p[`${mc}-recommended`]);
            if (p[`${mc}-latest`] && p[`${mc}-latest`] !== p[`${mc}-recommended`]) versions.push(p[`${mc}-latest`]);
          } catch {}
        }
      } else if (loader === 'fabric') {
        const resp = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mc}`);
        const data = await resp.json();
        versions = data.map(v => v.loader?.version).filter(Boolean);
      } else if (loader === 'neoforge') {
        const data = await fetchWithCorsProxy('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
        const parts = mc.split('.');
        const prefix = parts.length >= 2 ? `${parts[1]}.${parts[2] || '0'}` : mc;
        versions = (data.versions || []).filter(v => v.startsWith(prefix)).reverse();
      }
      loaderVerSelect.innerHTML = '<option value="">Select version</option>';
      versions.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = i === 0 ? `${v} (latest)` : v;
        if (v === game.loader_version) opt.selected = true;
        loaderVerSelect.appendChild(opt);
      });
      if (game.loader_version && !versions.includes(game.loader_version)) {
        const opt = document.createElement('option');
        opt.value = game.loader_version; opt.textContent = `${game.loader_version} (current)`;
        opt.selected = true; loaderVerSelect.prepend(opt);
      }
    } catch { loaderVerSelect.innerHTML = `<option value="${escapeHtml(game.loader_version || '')}">${escapeHtml(game.loader_version || 'Unknown')}</option>`; }
  }

  mcSelect.addEventListener('change', loadLoaderVersions);
  loaderSelect.addEventListener('change', loadLoaderVersions);
  loadMcVersions().then(loadLoaderVersions);

  // Thumbnail upload in edit mode
  let adminEditNewThumb = null;
  document.getElementById('admin-edit-thumb-input').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    adminEditNewThumb = file;
    const preview = document.getElementById('admin-edit-thumb-preview');
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" style="width:100%;height:100%;object-fit:cover;">`;
  });

  // Replace action buttons
  reviewApprove.style.display = 'none';
  reviewReject.style.display = 'none';
  reviewEdit.style.display = 'none';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-approve';
  saveBtn.textContent = 'Save';
  saveBtn.id = 'admin-edit-save';
  reviewEdit.parentElement.insertBefore(saveBtn, reviewCancel);

  saveBtn.addEventListener('click', async () => {
    const sb = getSupabase();
    if (!sb || !reviewingGame) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const gameType = document.getElementById('admin-edit-game-type').value;
      const addressVal = document.getElementById('admin-edit-address').value.trim();

      const updated = {
        title: document.getElementById('admin-edit-title').value.trim(),
        description: document.getElementById('admin-edit-desc').value.trim(),
        tags: [...selectedTags],
        modpack_url: document.getElementById('admin-edit-modpack').value.trim(),
        mc_version: document.getElementById('admin-edit-mc-version').value.trim(),
        mod_loader: document.getElementById('admin-edit-mod-loader').value,
        loader_version: document.getElementById('admin-edit-loader-version').value.trim() || null,
        game_type: gameType,
        server_address: gameType === 'server' ? addressVal : null,
        world_name: gameType === 'world' ? addressVal : null,
        auto_join: document.getElementById('admin-edit-auto-join').checked,
      };

      // Upload new thumbnail if changed
      if (adminEditNewThumb) {
        const bitmap = await createImageBitmap(adminEditNewThumb);
        const canvas = document.createElement('canvas');
        const MAX_W = 1280, MAX_H = 720;
        let w = bitmap.width, h = bitmap.height;
        if (w > MAX_W || h > MAX_H) {
          const scale = Math.min(MAX_W / w, MAX_H / h);
          w = Math.round(w * scale); h = Math.round(h * scale);
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
        const path = `thumbnails/${reviewingGame.id}_${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage.from('MCBlox').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = sb.storage.from('MCBlox').getPublicUrl(path);
        updated.thumbnail_url = urlData.publicUrl;
      }

      const { error } = await sb.from('games').update(updated).eq('id', reviewingGame.id);
      if (error) throw error;

      Object.assign(reviewingGame, updated);
      updateStats();
      renderQueue();
      closeReview();
      showToast('Game updated!', 'success');
    } catch (err) {
      showToast('Error: ' + (err.message || 'Unknown'), 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });
}

// Restore action buttons when closing review modal
const _originalCloseReview = closeReview;
closeReview = function() {
  reviewApprove.style.display = '';
  reviewReject.style.display = '';
  reviewEdit.style.display = '';
  const saveBtn = document.getElementById('admin-edit-save');
  if (saveBtn) saveBtn.remove();
  _originalCloseReview();
};

// ==========================================
// Users Section
// ==========================================
let _usersLoaded = false;
let allUsers = [];

async function loadUsers() {
  if (_usersLoaded) return;
  _usersLoaded = true;

  const sb = getSupabase();
  if (!sb) { _usersLoaded = false; return; }

  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allUsers = data || [];

    // Count games per user
    const { data: gameCounts } = await sb
      .from('games')
      .select('creator_id');
    const countMap = {};
    (gameCounts || []).forEach(g => {
      countMap[g.creator_id] = (countMap[g.creator_id] || 0) + 1;
    });
    allUsers.forEach(u => { u._gameCount = countMap[u.id] || 0; });

    document.getElementById('user-stats').innerHTML = `
      <span class="stat-badge approved">${allUsers.length} total</span>
      <span class="stat-badge pending">${allUsers.filter(u => u._gameCount > 0).length} creators</span>
    `;

    renderUsers();
  } catch (e) {
    console.error('Failed to load users:', e);
    _usersLoaded = false;
  }
}

function renderUsers(filter = '') {
  const container = document.getElementById('user-list');
  const empty = document.getElementById('user-empty');
  container.innerHTML = '';

  const filtered = filter
    ? allUsers.filter(u =>
        (u.username || '').toLowerCase().includes(filter) ||
        (u.email || '').toLowerCase().includes(filter)
      )
    : allUsers;

  if (filtered.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(u => {
    const isAdminUser = ADMIN_IDS.includes(u.id);
    const role = isAdminUser ? 'admin' : (u._gameCount > 0 ? 'creator' : 'player');
    const initial = (u.username || '?')[0].toUpperCase();
    const joined = u.created_at ? new Date(u.created_at).toLocaleDateString() : '?';

    const avatarHtml = u.avatar_url
      ? `<div class="user-avatar"><img src="${encodeURI(u.avatar_url)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div>`
      : `<div class="user-avatar">${escapeHtml(initial)}</div>`;

    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
      ${avatarHtml}
      <div class="user-info">
        <div class="username">${escapeHtml(u.username || 'Anonymous')}</div>
        <div class="user-meta">
          <span>${u._gameCount} game${u._gameCount !== 1 ? 's' : ''}</span>
          <span>Joined ${joined}</span>
        </div>
      </div>
      <span class="user-role ${role}">${role}</span>
    `;
    container.appendChild(card);
  });
}

// User search
document.getElementById('user-search').addEventListener('input', (e) => {
  renderUsers(e.target.value.toLowerCase());
});

// ==========================================
// Stats Section
// ==========================================
let _statsLoaded = false;

async function loadStats() {
  if (_statsLoaded) return;
  _statsLoaded = true;

  const sb = getSupabase();
  if (!sb) { _statsLoaded = false; return; }

  try {
    const [gamesRes, profilesRes] = await Promise.all([
      sb.from('games').select('id, status, total_plays, mc_version, mod_loader, thumbs_up, thumbs_down'),
      sb.from('profiles').select('id')
    ]);

    const games = gamesRes.data || [];
    const users = profilesRes.data || [];

    const approved = games.filter(g => g.status === 'approved');
    const totalPlays = games.reduce((s, g) => s + (g.total_plays || 0), 0);
    const upvotes = games.reduce((s, g) => s + (g.thumbs_up || 0), 0);
    const downvotes = games.reduce((s, g) => s + (g.thumbs_down || 0), 0);

    // MC version breakdown
    const versionMap = {};
    approved.forEach(g => {
      const v = g.mc_version || 'unknown';
      versionMap[v] = (versionMap[v] || 0) + 1;
    });

    // Loader breakdown
    const loaderMap = {};
    approved.forEach(g => {
      const l = g.mod_loader || 'unknown';
      loaderMap[l] = (loaderMap[l] || 0) + 1;
    });

    const grid = document.getElementById('stats-grid');
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${users.length}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${games.length}</div>
        <div class="stat-label">Total Games</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${approved.length}</div>
        <div class="stat-label">Approved Games</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalPlays}</div>
        <div class="stat-label">Total Plays</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${upvotes}</div>
        <div class="stat-label">Upvotes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${downvotes}</div>
        <div class="stat-label">Downvotes</div>
      </div>
      ${Object.entries(versionMap).map(([v, c]) => `
        <div class="stat-card">
          <div class="stat-value">${c}</div>
          <div class="stat-label">MC ${escapeHtml(v)}</div>
        </div>
      `).join('')}
      ${Object.entries(loaderMap).map(([l, c]) => `
        <div class="stat-card">
          <div class="stat-value">${c}</div>
          <div class="stat-label">${escapeHtml(l)}</div>
        </div>
      `).join('')}
    `;
  } catch (e) {
    console.error('Failed to load stats:', e);
    _statsLoaded = false;
  }
}

// ═══════════════════════════════════════════════════════
// PROMOTION TAB
// ═══════════════════════════════════════════════════════

let _promoLoaded = false;
let promoGames = [];
let promoSelected = new Set();

async function loadPromotion() {
  if (_promoLoaded) return;
  _promoLoaded = true;

  const sb = getSupabase();
  if (!sb) { _promoLoaded = false; return; }

  try {
    const { data, error } = await sb.from('games')
      .select('id, title, thumbnail_url, status, is_promoted, fake_players_enabled, fake_players_min, fake_players_max, total_plays, creator_id')
      .order('title');
    if (error) throw error;
    promoGames = data || [];
    renderPromoGames();
    renderPromoActive();
  } catch (e) {
    console.error('Failed to load promotion data:', e);
    _promoLoaded = false;
  }
}

function renderPromoGames(filter = '') {
  const container = document.getElementById('promo-games');
  const term = filter.toLowerCase().trim();
  const filtered = term ? promoGames.filter(g => g.title.toLowerCase().includes(term)) : promoGames;

  container.innerHTML = filtered.map(g => {
    const checked = promoSelected.has(g.id) ? 'checked' : '';
    const selectedClass = promoSelected.has(g.id) ? 'selected' : '';
    const thumb = g.thumbnail_url ? `<img class="promo-game-thumb" src="${encodeURI(g.thumbnail_url)}" alt="">` : `<div class="promo-game-thumb" style="display:flex;align-items:center;justify-content:center;font-size:16px;">⛏</div>`;
    const badges = [];
    if (g.is_promoted) badges.push('<span style="color:var(--yellow);font-size:10px;">★</span>');
    if (g.fake_players_enabled) badges.push('<span style="color:var(--lavender);font-size:10px;">🎭</span>');
    return `
      <div class="promo-game-row ${selectedClass}" data-id="${g.id}">
        <input type="checkbox" ${checked} data-id="${g.id}">
        ${thumb}
        <div class="promo-game-info">
          <div class="promo-game-name">${escapeHtml(g.title)} ${badges.join(' ')}</div>
          <div class="promo-game-meta">
            <span>${g.status}</span>
            <span>${g.total_plays || 0} plays</span>
            ${g.fake_players_enabled ? `<span>${g.fake_players_min}-${g.fake_players_max} sim</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Click handlers
  container.querySelectorAll('.promo-game-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return; // let checkbox handle itself
      const id = row.dataset.id;
      const cb = row.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      togglePromoSelect(id, cb.checked);
    });
    row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      togglePromoSelect(row.dataset.id, e.target.checked);
    });
  });
}

function togglePromoSelect(id, selected) {
  if (selected) promoSelected.add(id); else promoSelected.delete(id);
  // Update row styling
  document.querySelectorAll('.promo-game-row').forEach(r => {
    r.classList.toggle('selected', promoSelected.has(r.dataset.id));
  });
  updatePromoControls();
}

function updatePromoControls() {
  const noSel = document.getElementById('promo-no-selection');
  const settings = document.getElementById('promo-settings');

  if (promoSelected.size === 0) {
    noSel.style.display = '';
    settings.style.display = 'none';
    return;
  }

  noSel.style.display = 'none';
  settings.style.display = '';

  const count = promoSelected.size;
  document.getElementById('promo-title').textContent = count === 1
    ? promoGames.find(g => g.id === [...promoSelected][0])?.title || '1 game selected'
    : `${count} games selected`;

  // If single game selected, populate fields with its current values
  if (count === 1) {
    const game = promoGames.find(g => g.id === [...promoSelected][0]);
    if (game) {
      document.getElementById('promo-featured-check').checked = !!game.is_promoted;
      document.getElementById('promo-featured-status').textContent = game.is_promoted ? 'On' : 'Off';
      document.getElementById('promo-sim-check').checked = !!game.fake_players_enabled;
      document.getElementById('promo-sim-status').textContent = game.fake_players_enabled ? 'On' : 'Off';
      document.getElementById('promo-sim-range').style.display = game.fake_players_enabled ? 'flex' : 'none';
      document.getElementById('promo-sim-min').value = game.fake_players_min || 0;
      document.getElementById('promo-sim-max').value = game.fake_players_max || 0;
      document.getElementById('promo-total-plays').value = game.total_plays || 0;
    }
  } else {
    // Multi-select: reset to defaults
    document.getElementById('promo-featured-check').checked = false;
    document.getElementById('promo-featured-status').textContent = 'Off';
    document.getElementById('promo-sim-check').checked = false;
    document.getElementById('promo-sim-status').textContent = 'Off';
    document.getElementById('promo-sim-range').style.display = 'none';
    document.getElementById('promo-sim-min').value = 0;
    document.getElementById('promo-sim-max').value = 0;
    document.getElementById('promo-total-plays').value = 0;
  }
}

function renderPromoActive() {
  const container = document.getElementById('promo-active-list');
  const promoted = promoGames.filter(g => g.is_promoted || g.fake_players_enabled);

  if (promoted.length === 0) {
    container.innerHTML = '<p style="color:var(--text4);font-size:12px;text-align:center;padding:16px 0;">No active promotions.</p>';
    return;
  }

  container.innerHTML = promoted.map(g => {
    const badges = [];
    if (g.is_promoted) badges.push('<span class="pa-badge featured">★ Featured</span>');
    if (g.fake_players_enabled) badges.push(`<span class="pa-badge sim">🎭 ${g.fake_players_min}-${g.fake_players_max}</span>`);
    return `
      <div class="promo-active-row">
        <span class="pa-name">${escapeHtml(g.title)}</span>
        ${badges.join(' ')}
        <span style="color:var(--text4);">${(g.total_plays || 0).toLocaleString()} plays</span>
      </div>
    `;
  }).join('');
}

// Promotion event handlers (after DOM load)
document.addEventListener('DOMContentLoaded', () => {
  // Search
  document.getElementById('promo-search').addEventListener('input', (e) => {
    renderPromoGames(e.target.value);
  });

  // Select all / clear
  document.getElementById('promo-select-all').addEventListener('click', () => {
    const visible = document.querySelectorAll('#promo-games .promo-game-row');
    visible.forEach(r => {
      promoSelected.add(r.dataset.id);
      r.querySelector('input[type="checkbox"]').checked = true;
      r.classList.add('selected');
    });
    updatePromoControls();
  });

  document.getElementById('promo-deselect-all').addEventListener('click', () => {
    promoSelected.clear();
    document.querySelectorAll('#promo-games .promo-game-row').forEach(r => {
      r.querySelector('input[type="checkbox"]').checked = false;
      r.classList.remove('selected');
    });
    updatePromoControls();
  });

  // Toggle listeners for the toggle switches
  document.getElementById('promo-featured-check').addEventListener('change', (e) => {
    document.getElementById('promo-featured-status').textContent = e.target.checked ? 'On' : 'Off';
  });

  document.getElementById('promo-sim-check').addEventListener('change', (e) => {
    document.getElementById('promo-sim-status').textContent = e.target.checked ? 'On' : 'Off';
    document.getElementById('promo-sim-range').style.display = e.target.checked ? 'flex' : 'none';
  });

  // Apply button
  document.getElementById('promo-apply').addEventListener('click', async () => {
    if (promoSelected.size === 0) return;

    const sb = getSupabase();
    if (!sb) return;

    const featured = document.getElementById('promo-featured-check').checked;
    const simEnabled = document.getElementById('promo-sim-check').checked;
    const simMin = parseInt(document.getElementById('promo-sim-min').value) || 0;
    const simMax = parseInt(document.getElementById('promo-sim-max').value) || 0;
    const totalPlays = parseInt(document.getElementById('promo-total-plays').value);

    if (simEnabled && simMin > simMax) {
      showToast('Min must be ≤ Max', 'error');
      return;
    }

    const statusEl = document.getElementById('promo-apply-status');
    statusEl.textContent = 'Applying...';

    const update = {
      is_promoted: featured,
      fake_players_enabled: simEnabled,
      fake_players_min: simMin,
      fake_players_max: simMax,
    };
    // Only set total_plays if it's not 0 (avoid accidentally zeroing out multi-select)
    if (totalPlays > 0 || promoSelected.size === 1) {
      update.total_plays = totalPlays;
    }

    let success = 0;
    let fail = 0;

    for (const id of promoSelected) {
      try {
        const { error } = await sb.from('games').update(update).eq('id', id);
        if (error) throw error;
        // Update local cache
        const g = promoGames.find(x => x.id === id);
        if (g) Object.assign(g, update);
        success++;
      } catch (e) {
        console.error('Failed to update game', id, e);
        fail++;
      }
    }

    if (fail > 0) {
      statusEl.textContent = `✓ ${success} updated, ${fail} failed`;
      statusEl.style.color = 'var(--red)';
    } else {
      statusEl.textContent = `✓ ${success} game${success > 1 ? 's' : ''} updated`;
      statusEl.style.color = 'var(--mint)';
    }
    setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = ''; }, 3000);

    // Refresh display
    renderPromoGames(document.getElementById('promo-search').value);
    renderPromoActive();
  });
});
