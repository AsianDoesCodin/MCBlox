// Game detail page — uses shared supabase-client.js for auth

const gameId = new URLSearchParams(window.location.search).get('id');
const loadingEl = document.getElementById('game-loading');
const notFoundEl = document.getElementById('game-not-found');
const detailEl = document.getElementById('game-detail');

let gameData = null;

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

// --- Fetch and render game ---
async function loadGame() {
  if (!gameId) {
    showNotFound();
    return;
  }

  const sb = getSupabase();
  if (!sb) { showNotFound(); return; }

  try {
    const { data, error } = await sb
      .from('games')
      .select('*, profiles:creator_id(username, avatar_url)')
      .eq('id', gameId)
      .single();

    if (error || !data || data.status !== 'approved') {
      showNotFound();
      return;
    }

    gameData = data;

    // Active players
    const twoMinAgo = new Date(Date.now() - 120000).toISOString();
    const { data: activity } = await sb
      .from('player_activity')
      .select('id')
      .eq('game_id', gameId)
      .gte('last_heartbeat', twoMinAgo);
    const playerCount = activity ? activity.length : 0;

    renderGame(data, playerCount);
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
  const bannerImg = document.getElementById('banner-img');
  if (game.thumbnail_url) {
    bannerImg.src = game.thumbnail_url;
    bannerImg.alt = game.title;
  } else {
    document.getElementById('game-banner').style.display = 'none';
  }

  // Title
  document.getElementById('game-title').textContent = game.title;

  // Creator
  const profile = game.profiles;
  const avatarEl = document.getElementById('creator-avatar');
  const nameEl = document.getElementById('creator-name');
  if (profile?.avatar_url) {
    avatarEl.src = profile.avatar_url;
  } else {
    avatarEl.style.display = 'none';
  }
  nameEl.textContent = profile?.username || 'Unknown';
  nameEl.href = `profile.html?id=${game.creator_id}`;

  document.getElementById('game-date').textContent =
    'Published ' + new Date(game.created_at).toLocaleDateString();

  // Description
  document.getElementById('game-description').textContent = game.description || '';

  // Tags
  const tagsEl = document.getElementById('game-tags');
  (game.tags || []).forEach(t => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = t;
    tagsEl.appendChild(span);
  });

  // Screenshots
  const screenshots = game.screenshots || [];
  if (screenshots.length > 0) {
    const section = document.getElementById('screenshots-section');
    section.style.display = '';
    const gallery = document.getElementById('screenshot-gallery');
    screenshots.forEach((url, i) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Screenshot ${i + 1}`;
      img.addEventListener('click', () => openLightbox(i));
      gallery.appendChild(img);
    });
    setupLightbox(screenshots);
  }

  // Sidebar stats
  const likes = game.thumbs_up || 0;
  const dislikes = game.thumbs_down || 0;
  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 100;

  document.getElementById('rating-up').textContent = `👍 ${likes}`;
  document.getElementById('rating-down').textContent = `👎 ${dislikes}`;
  document.getElementById('rating-pct-fill').style.width = `${pct}%`;

  document.getElementById('stat-players').textContent = `${playerCount} active`;
  document.getElementById('stat-plays').textContent = (game.total_plays || 0).toLocaleString();
  document.getElementById('stat-type').textContent =
    game.game_type === 'server' ? 'Multiplayer' : 'Singleplayer';
  document.getElementById('stat-mc').textContent = game.mc_version || '—';
  document.getElementById('stat-loader').textContent =
    (game.mod_loader || '—') + (game.loader_version ? ` ${game.loader_version}` : '');

  // Vote buttons
  setupVoting(game);
}

// --- Lightbox ---
let lightboxIdx = 0;
let lightboxUrls = [];

function setupLightbox(urls) {
  lightboxUrls = urls;
  const lightbox = document.getElementById('lightbox');
  const backdrop = lightbox.querySelector('.lightbox-backdrop');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  backdrop.addEventListener('click', closeLightbox);
  closeBtn.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', () => {
    lightboxIdx = (lightboxIdx - 1 + lightboxUrls.length) % lightboxUrls.length;
    updateLightbox();
  });
  nextBtn.addEventListener('click', () => {
    lightboxIdx = (lightboxIdx + 1) % lightboxUrls.length;
    updateLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.style.display === 'none') return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prevBtn.click();
    if (e.key === 'ArrowRight') nextBtn.click();
  });
}

function openLightbox(idx) {
  lightboxIdx = idx;
  document.getElementById('lightbox').style.display = '';
  updateLightbox();
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

function updateLightbox() {
  document.getElementById('lightbox-img').src = lightboxUrls[lightboxIdx];
}

// --- Voting ---
function setupVoting(game) {
  const upBtn = document.getElementById('vote-up-btn');
  const downBtn = document.getElementById('vote-down-btn');

  // Check if user already voted (stored in localStorage)
  const voteKey = `vote_${game.id}`;
  const existingVote = localStorage.getItem(voteKey);
  if (existingVote) {
    if (existingVote === 'up') upBtn.classList.add('voted');
    else downBtn.classList.add('voted');
  }

  upBtn.addEventListener('click', async () => {
    await submitVote(game.id, 'up', voteKey, upBtn, downBtn);
  });
  downBtn.addEventListener('click', async () => {
    await submitVote(game.id, 'down', voteKey, upBtn, downBtn);
  });
}

async function submitVote(id, direction, voteKey, upBtn, downBtn) {
  const user = getUser();
  if (!user) { showToast('Sign in to vote.', 'warning'); return; }

  if (localStorage.getItem(voteKey)) {
    showToast('You already voted on this game.', 'warning');
    return;
  }

  const sb = getSupabase();
  if (!sb) return;

  const col = direction === 'up' ? 'thumbs_up' : 'thumbs_down';
  const current = direction === 'up' ? (gameData.thumbs_up || 0) : (gameData.thumbs_down || 0);

  const { error } = await sb
    .from('games')
    .update({ [col]: current + 1 })
    .eq('id', id);

  if (error) {
    showToast('Failed to vote.', 'error');
    return;
  }

  localStorage.setItem(voteKey, direction);
  if (direction === 'up') {
    gameData.thumbs_up = (gameData.thumbs_up || 0) + 1;
    upBtn.classList.add('voted');
    document.getElementById('rating-up').textContent = `👍 ${gameData.thumbs_up}`;
  } else {
    gameData.thumbs_down = (gameData.thumbs_down || 0) + 1;
    downBtn.classList.add('voted');
    document.getElementById('rating-down').textContent = `👎 ${gameData.thumbs_down}`;
  }

  // Update bar
  const total = (gameData.thumbs_up || 0) + (gameData.thumbs_down || 0);
  const pct = total > 0 ? Math.round(((gameData.thumbs_up || 0) / total) * 100) : 100;
  document.getElementById('rating-pct-fill').style.width = `${pct}%`;

  showToast('Vote recorded!', 'success');
}

// --- Comments ---
const commentInput = document.getElementById('comment-input');
const commentCharCount = document.getElementById('comment-char-count');
const commentSubmitBtn = document.getElementById('comment-submit');
const commentForm = document.getElementById('comment-form');
const commentSignin = document.getElementById('comment-signin');
const commentsList = document.getElementById('comments-list');
const commentsEmpty = document.getElementById('comments-empty');

// Show/hide comment form based on auth
onAuthChange((session) => {
  if (session) {
    commentForm.style.display = '';
    commentSignin.style.display = 'none';
  } else {
    commentForm.style.display = 'none';
    commentSignin.style.display = '';
  }
});

commentInput.addEventListener('input', () => {
  commentCharCount.textContent = `${commentInput.value.length} / 1000`;
});

commentSubmitBtn.addEventListener('click', async () => {
  const content = commentInput.value.trim();
  if (!content) { showToast('Comment cannot be empty.', 'warning'); return; }

  const user = getUser();
  if (!user) { showToast('Sign in to comment.', 'warning'); return; }

  const sb = getSupabase();
  if (!sb) return;

  commentSubmitBtn.disabled = true;
  commentSubmitBtn.textContent = 'Posting...';

  try {
    const { error } = await sb.from('comments').insert({
      game_id: gameId,
      user_id: user.id,
      content: content
    });
    if (error) throw error;

    commentInput.value = '';
    commentCharCount.textContent = '0 / 1000';
    showToast('Comment posted!', 'success');
    loadComments();
  } catch (e) {
    showToast('Failed to post comment: ' + (e.message || 'Unknown error'), 'error');
  } finally {
    commentSubmitBtn.disabled = false;
    commentSubmitBtn.textContent = 'Comment';
  }
});

async function loadComments() {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { data, error } = await sb
      .from('comments')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch profiles for comment authors
    const userIds = [...new Set((data || []).map(c => c.user_id))];
    let profilesMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);
      if (profiles) {
        profiles.forEach(p => { profilesMap[p.id] = p; });
      }
    }

    const enriched = (data || []).map(c => ({
      ...c,
      profiles: profilesMap[c.user_id] || null
    }));

    renderComments(enriched);
  } catch (e) {
    console.error('Failed to load comments:', e);
  }
}

function renderComments(comments) {
  commentsList.innerHTML = '';

  if (comments.length === 0) {
    commentsList.innerHTML = '<p class="comments-empty">No comments yet. Be the first!</p>';
    return;
  }

  const currentUser = getUser();

  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';

    const avatarHtml = c.profiles?.avatar_url
      ? `<img class="comment-avatar" src="${escapeHtml(c.profiles.avatar_url)}" alt="">`
      : `<div class="comment-avatar"></div>`;

    const isOwn = currentUser && currentUser.id === c.user_id;
    const deleteHtml = isOwn
      ? `<div class="comment-actions"><button class="comment-delete-btn" data-id="${c.id}">Delete</button></div>`
      : '';

    item.innerHTML = `
      ${avatarHtml}
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(c.profiles?.username || 'Unknown')}</span>
          <span class="comment-time">${timeAgo(c.created_at)}</span>
        </div>
        <div class="comment-text">${escapeHtml(c.content)}</div>
        ${deleteHtml}
      </div>
    `;

    // Delete handler
    const delBtn = item.querySelector('.comment-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this comment?')) return;
        const sb = getSupabase();
        try {
          const { error } = await sb.from('comments').delete().eq('id', c.id);
          if (error) throw error;
          showToast('Comment deleted.', 'success');
          loadComments();
        } catch (e) {
          showToast('Failed to delete comment.', 'error');
        }
      });
    }

    commentsList.appendChild(item);
  });
}

// --- Init ---
loadGame();
