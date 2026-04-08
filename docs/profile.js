// Profile page — uses shared supabase-client.js for auth

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

let currentProfile = null;

function updateProfileAuth() {
  const user = getUser();
  if (user) {
    authGate.style.display = 'none';
    profilePanel.style.display = '';
    loadProfile(user);
  } else {
    authGate.style.display = '';
    profilePanel.style.display = 'none';
  }
}

onAuthChange(updateProfileAuth);
signinBtn.addEventListener('click', () => showAuthModal());

async function loadProfile(user) {
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
