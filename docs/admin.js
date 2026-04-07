// Admin panel — uses shared supabase-client.js for auth

// Hardcoded admin user IDs (set these to your Supabase auth user IDs)
const ADMIN_IDS = [
  'ff83d829-9583-4025-af2c-8cf082696d55'
];

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
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false });
      if (!error && data) {
        allGames.push(...data);
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

    card.innerHTML = `
      <div class="thumb">⛏</div>
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
      <label>Creator ID</label>
      <div class="value" style="font-size:11px;color:#808080;">${game.creator_id || 'Unknown'}</div>
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
      alert('Error: ' + (err.message || 'Unknown'));
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
    alert('Error updating status: ' + (err.message || 'Unknown error'));
  }
}
