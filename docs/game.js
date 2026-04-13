// Game detail page — uses shared supabase-client.js for auth

const gameId = new URLSearchParams(window.location.search).get('id');
const loadingEl = document.getElementById('game-loading');
const notFoundEl = document.getElementById('game-not-found');
const detailEl = document.getElementById('game-detail');

let gameData = null;
let currentVote = null;
let lbImages = [];
let lbIndex = 0;

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// --- Load game ---
async function loadGame() {
  if (!gameId) { showNotFound(); return; }

  const sb = getSupabase();
  if (!sb) { showNotFound(); return; }

  try {
    const { data: game, error } = await sb.from('games').select('*, profiles:creator_id(username, avatar_url, id)').eq('id', gameId).single();
    if (error || !game || game.status !== 'approved') { showNotFound(); return; }

    gameData = game;

    // Active players
    const twoMinAgo = new Date(Date.now() - 120000).toISOString();
    const { data: activity } = await sb.from('player_activity').select('id').eq('game_id', gameId).gte('last_heartbeat', twoMinAgo);
    const playerCount = activity ? activity.length : 0;

    renderGame(game, playerCount);
    loadComments();
  } catch (e) {
    console.error('Failed to load game:', e);
    showNotFound();
  }
}

function showNotFound() {
  loadingEl.style.display = 'none';
  notFoundEl.style.display = '';
}

function renderGame(game, playerCount) {
  loadingEl.style.display = 'none';
  detailEl.style.display = '';

  document.title = `${game.title} — McBlox`;

  // Banner
  const banner = document.getElementById('game-banner');
  if (game.banner_url) banner.innerHTML = `<img src="${encodeURI(game.banner_url)}" alt="">`;
  else if (game.thumbnail_url) banner.innerHTML = `<img src="${encodeURI(game.thumbnail_url)}" alt="">`;
  else banner.innerHTML = '<span class="placeholder">⛏</span>';

  document.getElementById('game-title').textContent = game.title;
  document.getElementById('game-description').textContent = game.description || '';

  // Creator
  const creatorName = game.profiles?.username || 'Unknown';
  document.getElementById('creator-name').textContent = creatorName;
  document.getElementById('creator-name').href = `profile.html?id=${game.creator_id}`;
  document.getElementById('game-date').textContent = game.created_at ? 'Published ' + new Date(game.created_at).toLocaleDateString() : '';

  // Creator avatar
  const avatarEl = document.getElementById('creator-avatar');
  if (game.profiles?.avatar_url) {
    avatarEl.innerHTML = `<img src="${encodeURI(game.profiles.avatar_url)}" alt="">`;
  }

  // Tags
  const tagsEl = document.getElementById('game-tags');
  tagsEl.innerHTML = (game.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  // Screenshots
  const screenshots = game.screenshots || [];
  if (screenshots.length > 0) {
    document.getElementById('screenshots-section').style.display = '';
    lbImages = screenshots;
    document.getElementById('screenshot-gallery').innerHTML = screenshots.map((url, i) =>
      `<img src="${encodeURI(url)}" alt="Screenshot" onclick="openLightbox(${i})">`
    ).join('');
  }

  // Sidebar stats
  const likes = game.thumbs_up || 0;
  const dislikes = game.thumbs_down || 0;
  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;

  document.getElementById('rating-up').textContent = `👍 ${likes}`;
  document.getElementById('rating-down').textContent = `👎 ${dislikes}`;
  document.getElementById('rating-pct-fill').style.width = total > 0 ? `${pct}%` : '0%';
  document.getElementById('stat-players').textContent = `${playerCount} active`;
  document.getElementById('stat-plays').textContent = (game.total_plays || 0).toLocaleString();
  document.getElementById('stat-type').textContent = game.game_type === 'server' ? 'Multiplayer' : 'Singleplayer';
  document.getElementById('stat-mc').textContent = game.mc_version || '—';
  document.getElementById('stat-loader').textContent = game.loader || '—';

  // Voting
  loadVoteState(game.id);

  // Vote button handlers
  document.getElementById('vote-up-btn').onclick = () => vote('up');
  document.getElementById('vote-down-btn').onclick = () => vote('down');
}

// --- Voting ---
async function loadVoteState(gid) {
  const upBtn = document.getElementById('vote-up-btn');
  const downBtn = document.getElementById('vote-down-btn');
  currentVote = null;
  upBtn.classList.remove('vote-active');
  downBtn.classList.remove('vote-active');

  const user = getUser();
  const sb = getSupabase();
  if (user && sb) {
    const { data } = await sb.from('game_ratings').select('vote').eq('game_id', gid).eq('user_id', user.id).maybeSingle();
    if (data) {
      currentVote = data.vote;
      if (data.vote === 'up') upBtn.classList.add('vote-active');
      else downBtn.classList.add('vote-active');
    }
  }
}

async function vote(dir) {
  const user = getUser();
  if (!user) { showAuthModal(); return; }

  const sb = getSupabase();
  if (!sb || !gameData) return;

  try {
    if (currentVote === dir) {
      await sb.from('game_ratings').delete().eq('game_id', gameData.id).eq('user_id', user.id);
      currentVote = null;
    } else {
      await sb.from('game_ratings').upsert({ game_id: gameData.id, user_id: user.id, vote: dir }, { onConflict: 'game_id,user_id' });
      currentVote = dir;
    }

    // Refresh counts
    const { data: counts } = await sb.from('game_ratings').select('vote').eq('game_id', gameData.id);
    const ups = (counts || []).filter(r => r.vote === 'up').length;
    const downs = (counts || []).filter(r => r.vote === 'down').length;
    const total = ups + downs;
    const pct = total > 0 ? Math.round((ups / total) * 100) : 0;
    document.getElementById('rating-up').textContent = `👍 ${ups}`;
    document.getElementById('rating-down').textContent = `👎 ${downs}`;
    document.getElementById('rating-pct-fill').style.width = `${pct}%`;
    document.getElementById('vote-up-btn').classList.toggle('vote-active', currentVote === 'up');
    document.getElementById('vote-down-btn').classList.toggle('vote-active', currentVote === 'down');
  } catch (err) {
    showToast('Failed to vote: ' + err.message, 'error');
  }
}

// --- Lightbox ---
function openLightbox(idx) {
  lbIndex = idx;
  document.getElementById('lb-img').src = lbImages[idx];
  document.getElementById('lightbox').style.display = 'flex';
}
function closeLightbox() { document.getElementById('lightbox').style.display = 'none'; }
function lbNav(dir) {
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
  document.getElementById('lb-img').src = lbImages[lbIndex];
}
document.addEventListener('keydown', (e) => {
  if (document.getElementById('lightbox').style.display === 'flex') {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lbNav(-1);
    if (e.key === 'ArrowRight') lbNav(1);
  }
});

// --- Comments ---
function setupCommentForm() {
  const formWrap = document.getElementById('comment-form-wrap');
  const user = getUser();
  if (user) {
    formWrap.innerHTML = `
      <div class="comment-form">
        <textarea id="comment-input" placeholder="Leave a comment..." maxlength="1000" rows="3"></textarea>
        <div class="comment-form-actions">
          <span class="comment-char-count" id="comment-char-count">0 / 1000</span>
          <button class="btn btn-sm btn-warm" id="comment-submit">Comment</button>
        </div>
      </div>`;
    document.getElementById('comment-input').addEventListener('input', (e) => {
      document.getElementById('comment-char-count').textContent = `${e.target.value.length} / 1000`;
    });
    document.getElementById('comment-submit').addEventListener('click', submitComment);
  } else {
    formWrap.innerHTML = `<div class="comment-signin">Sign in to leave a comment.</div>`;
  }
}

async function submitComment() {
  const user = getUser();
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return;
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;

  const btn = document.getElementById('comment-submit');
  btn.disabled = true;
  btn.textContent = 'Posting...';

  try {
    const { error } = await sb.from('comments').insert({ game_id: gameId, user_id: user.id, content: text });
    if (error) throw error;
    input.value = '';
    document.getElementById('comment-char-count').textContent = '0 / 1000';
    showToast('Comment posted!', 'success');
    await loadComments();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Comment';
  }
}

async function loadComments() {
  const sb = getSupabase();
  if (!sb) return;

  setupCommentForm();

  const list = document.getElementById('comments-list');
  const emptyMsg = document.getElementById('comments-empty');

  const { data: comments } = await sb.from('comments').select('*, profiles:user_id(username, avatar_url)').eq('game_id', gameId).order('created_at', { ascending: false });

  list.innerHTML = '';
  if (!comments || comments.length === 0) {
    emptyMsg.style.display = '';
    list.appendChild(emptyMsg);
    return;
  }

  const currentUser = getUser();

  comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comment';
    const isOwn = currentUser && currentUser.id === c.user_id;
    div.innerHTML = `
      <div class="comment-head">
        <div class="comment-avatar"></div>
        <span class="comment-name">${escapeHtml(c.profiles?.username || 'Anon')}</span>
        <span class="comment-date">${timeAgo(c.created_at)}</span>
        ${isOwn ? `<button style="margin-left:auto;background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;" class="del-comment" data-id="${c.id}">Delete</button>` : ''}
      </div>
      <div class="comment-text">${escapeHtml(c.content)}</div>`;

    const delBtn = div.querySelector('.del-comment');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this comment?')) return;
        try {
          const { error } = await sb.from('comments').delete().eq('id', c.id);
          if (error) throw error;
          showToast('Comment deleted.', 'success');
          loadComments();
        } catch (e) {
          showToast('Failed to delete.', 'error');
        }
      });
    }

    list.appendChild(div);
  });
}

// Update comment form on auth change
onAuthChange(() => { setupCommentForm(); });

// --- Init ---
loadGame();
