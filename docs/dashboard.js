// Dashboard — uses shared supabase-client.js for auth

const TAGS = [
  'Adventure', 'RPG', 'PvP', 'Creative', 'Survival',
  'Skyblock', 'Horror', 'Puzzle', 'Minigame', 'Parkour',
  'Tech', 'Magic', 'Quests', 'Building', 'Exploration',
  'Competitive', 'Coop', 'Story', 'Open World', 'Hardcore'
];
const MAX_TAGS = 5;

// --- Auth ---
const authGate = document.getElementById('auth-gate');
const dashboard = document.getElementById('dashboard');
const signinBtn = document.getElementById('signin-btn');

let myGames = [];

function updateDashAuth() {
  const user = getUser();
  if (user) {
    authGate.style.display = 'none';
    dashboard.style.display = '';
    loadMyGames();
  } else {
    authGate.style.display = '';
    dashboard.style.display = 'none';
  }
}

onAuthChange(updateDashAuth);

signinBtn.addEventListener('click', () => showAuthModal());

// --- Load games ---
const dashGames = document.getElementById('dash-games');
const dashEmpty = document.getElementById('dash-empty');

async function loadMyGames() {
  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) return;

  try {
    const { data, error } = await sb
      .from('games')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    myGames = data || [];
  } catch (e) {
    console.error('Failed to load games:', e);
    myGames = [];
  }
  renderDashboard();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderDashboard() {
  dashGames.innerHTML = '';

  if (myGames.length === 0) {
    dashEmpty.style.display = '';
    return;
  }
  dashEmpty.style.display = 'none';

  myGames.forEach(game => {
    const card = document.createElement('div');
    card.className = 'dash-game-card';

    const thumbContent = game.thumbnail_url
      ? `<img src="${encodeURI(game.thumbnail_url)}" alt="${escapeHtml(game.title)}">`
      : '⛏';

    const likes = game.thumbs_up || 0;
    const dislikes = game.thumbs_down || 0;
    const total = likes + dislikes;
    const pct = total > 0 ? Math.round((likes / total) * 100) : 0;

    const statusLabel = game.status.replace('_', ' ');

    card.innerHTML = `
      <div class="dash-thumb">${thumbContent}</div>
      <div class="dash-info">
        <h3>${escapeHtml(game.title)}</h3>
        <div class="dash-meta">
          <span class="dash-status ${game.status}">${statusLabel}</span>
          <span>${(game.total_plays || 0).toLocaleString()} plays</span>
          ${total > 0 ? `<span>${pct}% 👍</span>` : ''}
          <span>${game.mc_version} / ${game.mod_loader}</span>
        </div>
      </div>
      <div class="dash-actions">
        <button class="btn btn-sm edit-btn">Edit</button>
      </div>
    `;

    card.querySelector('.edit-btn').addEventListener('click', () => openEditModal(game));
    dashGames.appendChild(card);
  });
}

// --- Edit modal ---
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const modalClose = document.getElementById('modal-close');
const editCancel = document.getElementById('edit-cancel');
const editUnlist = document.getElementById('edit-unlist');
const editGameType = document.getElementById('edit-game-type');
const editServerField = document.getElementById('edit-server-field');
const editWorldField = document.getElementById('edit-world-field');
const editTagPicker = document.getElementById('edit-tag-picker');

let editingGame = null;
let editSelectedTags = new Set();

editGameType.addEventListener('change', () => {
  const v = editGameType.value;
  editServerField.style.display = v === 'server' ? '' : 'none';
  editWorldField.style.display = v === 'world' ? '' : 'none';
});

function renderEditTags() {
  editTagPicker.innerHTML = '';
  TAGS.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn' + (editSelectedTags.has(tag) ? ' selected' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      if (editSelectedTags.has(tag)) editSelectedTags.delete(tag);
      else if (editSelectedTags.size < MAX_TAGS) editSelectedTags.add(tag);
      renderEditTags();
    });
    editTagPicker.appendChild(btn);
  });
}

function openEditModal(game) {
  editingGame = game;
  document.getElementById('edit-title').value = game.title;
  document.getElementById('edit-description').value = game.description;
  document.getElementById('edit-modpack-url').value = game.modpack_url;
  document.getElementById('edit-mc-version').value = game.mc_version;
  document.getElementById('edit-mod-loader').value = game.mod_loader;
  document.getElementById('edit-game-type').value = game.game_type;
  document.getElementById('edit-server-address').value = game.server_address || '';
  document.getElementById('edit-world-name').value = game.world_name || '';

  editServerField.style.display = game.game_type === 'server' ? '' : 'none';
  editWorldField.style.display = game.game_type === 'world' ? '' : 'none';

  editSelectedTags = new Set(game.tags || []);
  renderEditTags();

  editModal.style.display = '';
}

function closeEditModal() {
  editModal.style.display = 'none';
  editingGame = null;
}

modalClose.addEventListener('click', closeEditModal);
editCancel.addEventListener('click', closeEditModal);

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingGame) return;

  const sb = getSupabase();
  if (!sb) return;

  const updated = {
    title: document.getElementById('edit-title').value.trim(),
    description: document.getElementById('edit-description').value.trim(),
    tags: [...editSelectedTags],
    modpack_url: document.getElementById('edit-modpack-url').value.trim(),
    mc_version: document.getElementById('edit-mc-version').value.trim(),
    mod_loader: document.getElementById('edit-mod-loader').value,
    game_type: document.getElementById('edit-game-type').value,
    server_address: document.getElementById('edit-server-address').value.trim() || null,
    world_name: document.getElementById('edit-world-name').value.trim() || null,
  };

  try {
    const { error } = await sb
      .from('games')
      .update(updated)
      .eq('id', editingGame.id);
    if (error) throw error;

    Object.assign(editingGame, updated);
    renderDashboard();
    closeEditModal();
    alert('Game updated!');
  } catch (err) {
    alert('Error updating: ' + (err.message || 'Unknown error'));
  }
});

editUnlist.addEventListener('click', async () => {
  if (!editingGame) return;
  if (!confirm('Unlist this game? Players will no longer see it in the catalog.')) return;

  const sb = getSupabase();
  if (!sb) return;

  try {
    const { error } = await sb
      .from('games')
      .update({ status: 'unlisted' })
      .eq('id', editingGame.id);
    if (error) throw error;

    editingGame.status = 'unlisted';
    renderDashboard();
    closeEditModal();
    alert('Game unlisted.');
  } catch (err) {
    alert('Error unlisting: ' + (err.message || 'Unknown error'));
  }
});

// Init on load handled by supabase-client.js onAuthChange callback
