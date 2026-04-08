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
    adminGate.innerHTML = '<h2>Access Denied</h2><p class="auth-gate-sub">You are not an admin.</p>';
    adminGate.style.display = '';
    adminPanel.style.display = 'none';
  } else {
    adminGate.style.display = '';
    adminPanel.style.display = 'none';
  }
}

onAuthChange(updateAdminAuth);
signinBtn.addEventListener('click', () => showAuthModal());

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
async function loadAllGames() {
  const sb = getSupabase();
  if (!sb) return;

  try {
    // Admin needs to read ALL games regardless of status
    // This requires a special RLS policy or service role key
    // For now, fetch all statuses separately
    const statuses = ['pending_review', 'approved', 'rejected', 'unlisted'];
    allGames = [];

    for (const status of statuses) {
      const { data, error } = await sb
        .from('games')
        .select('*, profiles:creator_id(username)')
        .eq('status', status)
        .order('created_at', { ascending: false });
      if (!error && data) {
        allGames.push(...data.map(g => ({
          ...g,
          author: g.profiles?.username || 'Unknown'
        })));
      }
    }

    updateStats();
    renderQueue();
  } catch (e) {
    console.error('Failed to load games:', e);
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
        <h3>${escapeHtml(game.title)}${game.is_promoted ? ' <span style="color:#ffaa00;font-size:12px;">★ Featured</span>' : ''}</h3>
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

  const tags = (game.tags || []).map(t => `<span class="tag" style="display:inline-block;padding:2px 8px;background:rgba(91,135,49,0.2);border:1px solid rgba(91,135,49,0.3);border-radius:4px;color:#5b8731;font-size:12px;margin-right:4px;">${escapeHtml(t)}</span>`).join('');

  reviewContent.innerHTML = `
    <div class="review-detail-field">
      <label>Thumbnail</label>
      <div class="value">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div id="review-thumb-preview" style="width:160px;height:90px;border-radius:4px;overflow:hidden;border:2px solid #1e3a5f;background:#0a0e1a;flex-shrink:0;">
            ${game.thumbnail_url ? `<img src="${encodeURI(game.thumbnail_url)}" style="width:100%;height:100%;object-fit:cover;" id="review-thumb-img">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#64748b;">No image</div>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <label style="padding:6px 14px;background:#1e3a5f;border-radius:4px;color:#e8eaf0;font-size:12px;cursor:pointer;text-align:center;transition:background 0.15s;" onmouseover="this.style.background='#2a4a7f'" onmouseout="this.style.background='#1e3a5f'">
              📷 Replace Image
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
      <div class="value"><span class="status-badge ${game.status}" style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;">${(game.status || '').replace('_', ' ')}</span></div>
    </div>
    <div class="review-detail-field">
      <label>Creator</label>
      <div class="value">${escapeHtml(game.author || 'Unknown')} <span style="font-size:10px;color:#555;">(${game.creator_id || '?'})</span></div>
    </div>
    <div class="review-detail-field">
      <label>Featured / Promoted</label>
      <div class="value">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="review-promote-check" ${game.is_promoted ? 'checked' : ''} style="width:16px;height:16px;accent-color:#5b8731;">
          <span style="font-size:13px;">${game.is_promoted ? 'Promoted — appears in Featured section' : 'Not promoted'}</span>
        </label>
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

      const { error: uploadErr } = await sb.storage.from('game-assets').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = sb.storage.from('game-assets').getPublicUrl(path);
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
