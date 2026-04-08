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
      btn.style.cssText = `display:inline-block;padding:4px 10px;margin:2px 4px 2px 0;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid ${selectedTags.has(tag) ? '#00e676' : '#1e3a5f'};background:${selectedTags.has(tag) ? 'rgba(0,230,118,0.15)' : '#111827'};color:${selectedTags.has(tag) ? '#00e676' : '#94a3b8'};transition:all 0.15s;`;
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
        <input type="text" id="admin-edit-title" value="${escapeHtml(game.title)}" required maxlength="60" style="width:100%;padding:8px 12px;background:#0a0e1a;border:2px solid #1e3a5f;border-radius:4px;color:#e8eaf0;font-size:14px;outline:none;">
      </div>
      <div class="review-detail-field">
        <label>Description</label>
        <textarea id="admin-edit-desc" required rows="3" maxlength="500" style="width:100%;padding:8px 12px;background:#0a0e1a;border:2px solid #1e3a5f;border-radius:4px;color:#e8eaf0;font-size:14px;outline:none;resize:vertical;">${escapeHtml(game.description || '')}</textarea>
      </div>
      <div class="review-detail-field">
        <label>Thumbnail</label>
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div id="admin-edit-thumb-preview" style="width:160px;height:90px;border-radius:4px;overflow:hidden;border:2px solid #1e3a5f;background:#0a0e1a;flex-shrink:0;">
            ${game.thumbnail_url ? `<img src="${encodeURI(game.thumbnail_url)}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#64748b;">No image</div>'}
          </div>
          <label style="padding:6px 14px;background:#1e3a5f;border-radius:4px;color:#e8eaf0;font-size:12px;cursor:pointer;">
            📷 Replace
            <input type="file" id="admin-edit-thumb-input" accept="image/*" style="display:none">
          </label>
        </div>
      </div>
      <div class="review-detail-field">
        <label>Tags</label>
        <div id="admin-edit-tags"></div>
      </div>
      <div class="review-detail-field">
        <label>Modpack URL</label>
        <input type="url" id="admin-edit-modpack" value="${escapeHtml(game.modpack_url || '')}" required style="width:100%;padding:8px 12px;background:#0a0e1a;border:2px solid #1e3a5f;border-radius:4px;color:#e8eaf0;font-size:14px;outline:none;">
      </div>
      <div class="review-detail-field" style="display:flex;gap:12px;">
        <div style="flex:1;">
          <label>Game Type</label>
          <select id="admin-edit-game-type" style="width:100%;padding:8px 12px;background:#0a0e1a;border:2px solid #1e3a5f;border-radius:4px;color:#e8eaf0;font-size:14px;">
            <option value="server" ${game.game_type === 'server' ? 'selected' : ''}>Server</option>
            <option value="world" ${game.game_type === 'world' ? 'selected' : ''}>World</option>
          </select>
        </div>
        <div style="flex:1;">
          <label>Server Address / World Name</label>
          <input type="text" id="admin-edit-address" value="${escapeHtml(game.server_address || game.world_name || '')}" style="width:100%;padding:8px 12px;background:#0a0e1a;border:2px solid #1e3a5f;border-radius:4px;color:#e8eaf0;font-size:14px;outline:none;">
        </div>
      </div>
    </form>
  `;

  renderTagPicker();

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
  saveBtn.textContent = '💾 Save';
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
        game_type: gameType,
        server_address: gameType === 'server' ? addressVal : null,
        world_name: gameType === 'world' ? addressVal : null,
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
      saveBtn.textContent = '💾 Save';
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
