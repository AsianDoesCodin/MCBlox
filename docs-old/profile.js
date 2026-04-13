// Profile page — uses shared supabase-client.js for auth
// Supports two modes:
// - Own profile (no ?id or ?id=self): editable form
// - Public profile (?id=<other-user>): read-only with their games

const viewingId = new URLSearchParams(window.location.search).get('id');

// --- Detect mode ---
function isOwnProfile(userId) {
  return !viewingId || viewingId === userId;
}

// --- Own profile elements ---
const authGate = document.getElementById('auth-gate');
const profilePanel = document.getElementById('profile-panel');
const signinBtn = document.getElementById('signin-btn');
const profileForm = document.getElementById('profile-form');
const usernameInput = document.getElementById('profile-username');
const emailInput = document.getElementById('profile-email');
const joinedInput = document.getElementById('profile-joined');
const avatarInput = document.getElementById('avatar-input');
const avatarImg = document.getElementById('avatar-img');
const avatarPlaceholder = document.getElementById('avatar-placeholder');

// --- Public profile elements ---
const publicProfile = document.getElementById('public-profile');
const profileNotFound = document.getElementById('profile-not-found');

let currentProfile = null;
let modeSet = false;

function setupMode() {
  if (modeSet) return;
  const user = getUser();

  if (viewingId && (!user || viewingId !== user.id)) {
    // Public mode — viewing someone else
    modeSet = true;
    authGate.style.display = 'none';
    profilePanel.style.display = 'none';
    loadPublicProfile(viewingId);
  } else if (user) {
    // Own profile
    modeSet = true;
    authGate.style.display = 'none';
    profilePanel.style.display = '';
    loadOwnProfile(user);
  } else {
    // Not logged in, no ID
    authGate.style.display = '';
    profilePanel.style.display = 'none';
  }
}

onAuthChange(setupMode);

// Also run immediately if viewing a public profile (no auth needed)
if (viewingId) {
  setupMode();
}

signinBtn.addEventListener('click', () => showAuthModal());

// --- Own profile ---
async function loadOwnProfile(user) {
  emailInput.value = user.email || '';
  joinedInput.value = new Date(user.created_at).toLocaleDateString();

  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (data) {
    currentProfile = data;
    usernameInput.value = data.username || '';
    if (data.avatar_url) {
      avatarImg.src = data.avatar_url;
      avatarImg.style.display = '';
      avatarPlaceholder.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarPlaceholder.textContent = (data.username || '?')[0].toUpperCase();
      avatarPlaceholder.style.display = '';
    }
  } else {
    usernameInput.value = user.user_metadata?.username || user.email?.split('@')[0] || '';
  }
}

// Save profile
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) return;

  const username = usernameInput.value.trim();
  if (!username) {
    showToast('Username is required', 'error');
    return;
  }

  const saveBtn = document.getElementById('profile-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const { error } = await sb
      .from('profiles')
      .upsert({ id: user.id, username }, { onConflict: 'id' });
    if (error) throw error;

    // Also update user metadata so the nav shows the new name
    await sb.auth.updateUser({ data: { username } });

    showToast('Profile saved!', 'success');
  } catch (err) {
    showToast('Error: ' + (err.message || 'Unknown'), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
});

// Avatar upload
avatarInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) return;

  try {
    // Compress to 256x256
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Center crop
    const min = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - min) / 2;
    const sy = (bitmap.height - min) / 2;
    ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const path = `avatars/${user.id}.jpg`;

    const { error: uploadErr } = await sb.storage.from('MCBlox').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = sb.storage.from('MCBlox').getPublicUrl(path);
    const avatarUrl = urlData.publicUrl + '?t=' + Date.now(); // cache bust

    const { error: updateErr } = await sb
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);
    if (updateErr) throw updateErr;

    avatarImg.src = avatarUrl;
    avatarImg.style.display = '';
    avatarPlaceholder.style.display = 'none';
    showToast('Avatar updated!', 'success');
  } catch (err) {
    showToast('Failed to upload: ' + (err.message || 'Unknown'), 'error');
  }
});

// --- Public profile ---
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

async function loadPublicProfile(userId) {
  const sb = getSupabase();
  if (!sb) { showProfileNotFound(); return; }

  try {
    // Fetch profile
    const { data: profile, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !profile) {
      showProfileNotFound();
      return;
    }

    // Show public profile
    publicProfile.style.display = '';
    document.title = `${profile.username || 'Player'} — McBlox`;

    // Avatar
    const pubAvatarImg = document.getElementById('pub-avatar-img');
    const pubAvatarPlaceholder = document.getElementById('pub-avatar-placeholder');
    if (profile.avatar_url) {
      pubAvatarImg.src = profile.avatar_url;
      pubAvatarImg.style.display = '';
      pubAvatarPlaceholder.style.display = 'none';
    } else {
      pubAvatarPlaceholder.textContent = (profile.username || '?')[0].toUpperCase();
    }

    // Name
    document.getElementById('pub-username').textContent = profile.username || 'Player';

    // Joined date
    if (profile.created_at) {
      document.getElementById('pub-joined').textContent =
        'Member since ' + new Date(profile.created_at).toLocaleDateString();
    }

    // Fetch their published games
    const { data: games } = await sb
      .from('games')
      .select('*')
      .eq('creator_id', userId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    const gamesGrid = document.getElementById('pub-games-grid');
    const emptyEl = document.getElementById('pub-empty');

    if (games && games.length > 0) {
      games.forEach(game => {
        const card = document.createElement('a');
        card.className = 'game-card';
        card.href = `game.html?id=${game.id}`;

        const thumbContent = game.thumbnail_url
          ? `<img src="${encodeURI(game.thumbnail_url)}" alt="${escapeHtml(game.title)}">`
          : '<div style="height:140px;display:flex;align-items:center;justify-content:center;font-size:32px">⛏</div>';

        const likes = game.thumbs_up || 0;
        const dislikes = game.thumbs_down || 0;
        const total = likes + dislikes;
        const pct = total > 0 ? Math.round((likes / total) * 100) : 0;
        const pctClass = pct >= 70 ? 'rate-good' : pct >= 40 ? 'rate-mid' : 'rate-bad';
        const tagsHtml = (game.tags || []).slice(0, 2).map(t =>
          `<span class="game-tag">${escapeHtml(t)}</span>`
        ).join('');

        card.innerHTML = `
          <div class="game-thumb">${thumbContent}</div>
          <div class="game-info">
            <h3>${escapeHtml(game.title)}</h3>
            <div class="game-meta">
              ${total > 0 ? `<span class="${pctClass}">👍 ${pct}%</span>` : ''}
              ${tagsHtml}
            </div>
          </div>
        `;
        gamesGrid.appendChild(card);
      });
    } else {
      emptyEl.style.display = '';
    }
  } catch (e) {
    console.error('Failed to load public profile:', e);
    showProfileNotFound();
  }
}

function showProfileNotFound() {
  profileNotFound.style.display = '';
}
