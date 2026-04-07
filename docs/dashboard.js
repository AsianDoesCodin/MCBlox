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
let editNewThumb = null; // File object if user picks new thumbnail
let editRemoveThumb = false;
let editNewScreenshots = []; // {file, url} for newly added
let editRemoveScreenshots = []; // URLs to remove

// Image upload elements
const editThumbInput = document.getElementById('edit-thumb-input');
const editThumbImg = document.getElementById('edit-thumb-img');
const editThumbPlaceholder = document.getElementById('edit-thumb-placeholder');
const editThumbRemove = document.getElementById('edit-thumb-remove');
const editScreenshotsWrap = document.getElementById('edit-screenshots-wrap');
const editScreenshotInput = document.getElementById('edit-screenshot-input');

editThumbInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  editNewThumb = file;
  editRemoveThumb = false;
  editThumbImg.src = URL.createObjectURL(file);
  editThumbImg.style.display = '';
  editThumbPlaceholder.style.display = 'none';
  editThumbRemove.style.display = '';
});

editThumbRemove.addEventListener('click', () => {
  editNewThumb = null;
  editRemoveThumb = true;
  editThumbImg.style.display = 'none';
  editThumbPlaceholder.style.display = '';
  editThumbRemove.style.display = 'none';
});

editScreenshotInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  const totalScreenshots = editScreenshotsWrap.querySelectorAll('.edit-screenshot-item').length + files.length;
  if (totalScreenshots > 4) {
    alert('Maximum 4 screenshots allowed.');
    return;
  }
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    editNewScreenshots.push({ file, url });
    renderEditScreenshots();
  });
  e.target.value = '';
});

function renderEditScreenshots() {
  editScreenshotsWrap.innerHTML = '';
  // Existing screenshots (from DB)
  const existing = (editingGame?.screenshot_urls || []).filter(u => !editRemoveScreenshots.includes(u));
  existing.forEach(url => {
    const item = document.createElement('div');
    item.className = 'edit-screenshot-item';
    item.innerHTML = `<img src="${encodeURI(url)}"><button type="button" class="edit-screenshot-remove">&times;</button>`;
    item.querySelector('.edit-screenshot-remove').addEventListener('click', () => {
      editRemoveScreenshots.push(url);
      renderEditScreenshots();
    });
    editScreenshotsWrap.appendChild(item);
  });
  // New screenshots
  editNewScreenshots.forEach((ss, i) => {
    const item = document.createElement('div');
    item.className = 'edit-screenshot-item';
    item.innerHTML = `<img src="${ss.url}"><button type="button" class="edit-screenshot-remove">&times;</button>`;
    item.querySelector('.edit-screenshot-remove').addEventListener('click', () => {
      URL.revokeObjectURL(ss.url);
      editNewScreenshots.splice(i, 1);
      renderEditScreenshots();
    });
    editScreenshotsWrap.appendChild(item);
  });
}

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
  editNewThumb = null;
  editRemoveThumb = false;
  editNewScreenshots = [];
  editRemoveScreenshots = [];

  document.getElementById('edit-title').value = game.title;
  document.getElementById('edit-description').value = game.description;
  document.getElementById('edit-modpack-url').value = game.modpack_url;
  document.getElementById('edit-mc-version').value = game.mc_version;
  document.getElementById('edit-mod-loader').value = game.mod_loader;
  document.getElementById('edit-loader-version').value = game.loader_version || '';
  document.getElementById('edit-game-type').value = game.game_type;
  document.getElementById('edit-server-address').value = game.server_address || '';
  document.getElementById('edit-world-name').value = game.world_name || '';

  // Show current thumbnail
  if (game.thumbnail_url) {
    editThumbImg.src = game.thumbnail_url;
    editThumbImg.style.display = '';
    editThumbPlaceholder.style.display = 'none';
    editThumbRemove.style.display = '';
  } else {
    editThumbImg.style.display = 'none';
    editThumbPlaceholder.style.display = '';
    editThumbRemove.style.display = 'none';
  }

  // Show current screenshots
  renderEditScreenshots();

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
    loader_version: document.getElementById('edit-loader-version').value.trim() || null,
    game_type: document.getElementById('edit-game-type').value,
    server_address: document.getElementById('edit-server-address').value.trim() || null,
    world_name: document.getElementById('edit-world-name').value.trim() || null,
  };

  try {
    // Upload new thumbnail if selected
    if (editNewThumb) {
      const thumbPath = `${editingGame.id}/thumbnail.jpg`;
      const { error: upErr } = await sb.storage.from('MCBlox').upload(thumbPath, editNewThumb, {
        contentType: editNewThumb.type || 'image/jpeg',
        upsert: true
      });
      if (upErr) throw upErr;
      const { data: urlData } = sb.storage.from('MCBlox').getPublicUrl(thumbPath);
      updated.thumbnail_url = urlData.publicUrl;
    } else if (editRemoveThumb) {
      updated.thumbnail_url = null;
      // Remove from storage
      await sb.storage.from('MCBlox').remove([`${editingGame.id}/thumbnail.jpg`]);
    }

    // Upload new screenshots
    let screenshotUrls = (editingGame.screenshot_urls || []).filter(u => !editRemoveScreenshots.includes(u));
    for (let i = 0; i < editNewScreenshots.length; i++) {
      const ss = editNewScreenshots[i];
      const ssPath = `${editingGame.id}/screenshot_${Date.now()}_${i}.jpg`;
      const { error: upErr } = await sb.storage.from('MCBlox').upload(ssPath, ss.file, {
        contentType: ss.file.type || 'image/jpeg',
        upsert: true
      });
      if (upErr) throw upErr;
      const { data: urlData } = sb.storage.from('MCBlox').getPublicUrl(ssPath);
      screenshotUrls.push(urlData.publicUrl);
    }
    if (editNewScreenshots.length > 0 || editRemoveScreenshots.length > 0) {
      updated.screenshot_urls = screenshotUrls;
    }

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
