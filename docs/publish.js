// Publish page — uses shared supabase-client.js for auth

// --- Predefined tags ---
const TAGS = [
  'Adventure', 'RPG', 'PvP', 'Creative', 'Survival',
  'Skyblock', 'Horror', 'Puzzle', 'Minigame', 'Parkour',
  'Tech', 'Magic', 'Quests', 'Building', 'Exploration',
  'Competitive', 'Coop', 'Story', 'Open World', 'Hardcore'
];
const MAX_TAGS = 5;

// --- Auth ---
const authGate = document.getElementById('auth-gate');
const publishForm = document.getElementById('publish-form');

function updatePublishAuth() {
  const user = getUser();
  if (user) {
    authGate.style.display = 'none';
    publishForm.style.display = '';
  } else {
    authGate.style.display = '';
    publishForm.style.display = 'none';
  }
}

// Listen to shared auth changes
onAuthChange(updatePublishAuth);

const signinBtn = document.getElementById('signin-btn');
signinBtn.addEventListener('click', () => showAuthModal());

// --- Tag picker ---
const tagPicker = document.getElementById('tag-picker');
const tagsInput = document.getElementById('tags');
const selectedTags = new Set();

function renderTags() {
  tagPicker.innerHTML = '';
  TAGS.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn' + (selectedTags.has(tag) ? ' selected' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else if (selectedTags.size < MAX_TAGS) {
        selectedTags.add(tag);
      }
      tagsInput.value = [...selectedTags].join(',');
      renderTags();
    });
    tagPicker.appendChild(btn);
  });
}
renderTags();

// --- Minecraft Version combobox ---
const mcVersionSelect = document.getElementById('mc-version');
const modLoaderSelect = document.getElementById('mod-loader');

async function fetchMcVersions() {
  try {
    const resp = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const data = await resp.json();
    const releases = data.versions.filter(v => v.type === 'release').map(v => v.id);
    mcVersionSelect.innerHTML = '<option value="">Select MC version</option>';
    releases.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      mcVersionSelect.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to fetch MC versions:', e);
    mcVersionSelect.innerHTML = '<option value="">Failed to load — refresh page</option>';
  }
}
fetchMcVersions();

// --- Loader version combobox ---
const loaderVersionSelect = document.getElementById('loader-version');
let loaderVersionCache = {};

async function fetchLoaderVersions() {
  const mc = mcVersionSelect.value;
  const loader = modLoaderSelect.value;
  if (!mc || !loader) {
    loaderVersionSelect.innerHTML = '<option value="">Select MC version & mod loader first</option>';
    return;
  }

  const cacheKey = `${loader}-${mc}`;
  if (loaderVersionCache[cacheKey]) {
    populateLoaderVersions(loaderVersionCache[cacheKey]);
    return;
  }

  loaderVersionSelect.innerHTML = '<option value="">Loading versions...</option>';

  try {
    let versions = [];
    if (loader === 'forge') {
      // Fetch all Forge versions for this MC version from maven-metadata.json
      try {
        const mavenResp = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json');
        const mavenData = await mavenResp.json();
        // Keys are MC versions (e.g. "1.12.2"), values are arrays of "1.12.2-14.23.5.2860"
        const fullVersions = mavenData[mc] || [];
        versions = fullVersions.map(v => v.replace(mc + '-', '')).reverse();
      } catch (e) {
        console.warn('Maven metadata failed, trying promotions:', e);
      }
      // Fallback to promotions if maven didn't work
      if (versions.length === 0) {
        try {
          const resp = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
          const data = await resp.json();
          const promos = data.promos || {};
          const rec = promos[`${mc}-recommended`];
          const lat = promos[`${mc}-latest`];
          if (rec) versions.push(rec);
          if (lat && lat !== rec) versions.push(lat);
        } catch {}
      }
    } else if (loader === 'fabric') {
      const resp = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mc}`);
      const data = await resp.json();
      versions = data.map(v => v.loader?.version).filter(Boolean);
    } else if (loader === 'neoforge') {
      const resp = await fetch('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
      const data = await resp.json();
      const all = data.versions || [];
      // Filter to MC version: 1.21.1 → prefix "21.1"
      const parts = mc.split('.');
      const prefix = parts.length >= 2 ? `${parts[1]}.${parts[2] || '0'}` : mc;
      versions = all.filter(v => v.startsWith(prefix)).reverse();
    }

    loaderVersionCache[cacheKey] = versions;
    populateLoaderVersions(versions);
  } catch (e) {
    console.error('Failed to fetch loader versions:', e);
    loaderVersionSelect.innerHTML = '<option value="">Could not load versions — type manually below</option>';
    // Allow manual input fallback
    loaderVersionSelect.insertAdjacentHTML('afterend',
      '<input type="text" id="loader-version-manual" placeholder="Type version manually" style="margin-top:4px;display:none">');
  }
}

function populateLoaderVersions(versions) {
  if (versions.length === 0) {
    loaderVersionSelect.innerHTML = '<option value="">No versions found for this MC version</option>';
    return;
  }
  loaderVersionSelect.innerHTML = '<option value="">Select version</option>';
  // Mark first as recommended
  versions.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = i === 0 ? `${v} (latest)` : v;
    loaderVersionSelect.appendChild(opt);
  });
}

mcVersionSelect.addEventListener('change', fetchLoaderVersions);
modLoaderSelect.addEventListener('change', fetchLoaderVersions);

// --- Game type toggle ---
const gameTypeSelect = document.getElementById('game-type');
const serverField = document.getElementById('server-field');
const worldField = document.getElementById('world-field');

gameTypeSelect.addEventListener('change', () => {
  const v = gameTypeSelect.value;
  serverField.style.display = v === 'server' ? '' : 'none';
  worldField.style.display = v === 'world' ? '' : 'none';
});

// --- Image crop tool ---
function setupCrop(container, canvasEl, inputEl, placeholderEl, controlsEl, zoomEl) {
  let img = null;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startOffsetX = 0;
  let startOffsetY = 0;

  const ctx = canvasEl.getContext('2d');

  function draw() {
    const cw = canvasEl.width;
    const ch = canvasEl.height;
    ctx.clearRect(0, 0, cw, ch);
    if (!img) return;

    const scale = Math.max(cw / img.width, ch / img.height) * zoom;
    const dw = img.width * scale;
    const dh = img.height * scale;

    // Clamp offset
    const maxOx = Math.max(0, (dw - cw) / 2);
    const maxOy = Math.max(0, (dh - ch) / 2);
    offsetX = Math.max(-maxOx, Math.min(maxOx, offsetX));
    offsetY = Math.max(-maxOy, Math.min(maxOy, offsetY));

    const dx = (cw - dw) / 2 + offsetX;
    const dy = (ch - dh) / 2 + offsetY;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  container.addEventListener('click', (e) => {
    if (e.target === zoomEl) return;
    if (!img) inputEl.click();
  });

  inputEl.addEventListener('change', () => {
    const file = inputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      img = new Image();
      img.onload = () => {
        zoom = 1;
        offsetX = 0;
        offsetY = 0;
        if (zoomEl) zoomEl.value = 1;
        placeholderEl.style.display = 'none';
        if (controlsEl) controlsEl.style.display = '';
        draw();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  if (zoomEl) {
    zoomEl.addEventListener('input', () => {
      zoom = parseFloat(zoomEl.value);
      draw();
    });
  }

  canvasEl.addEventListener('mousedown', (e) => {
    if (!img) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
    canvasEl.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    offsetX = startOffsetX + (e.clientX - dragStartX);
    offsetY = startOffsetY + (e.clientY - dragStartY);
    draw();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    canvasEl.style.cursor = '';
  });

  return { getCanvas: () => canvasEl, hasImage: () => !!img, getBlob: () => {
    return new Promise(resolve => {
      if (!img) { resolve(null); return; }
      canvasEl.toBlob(resolve, 'image/jpeg', 0.8);
    });
  }};
}

// Thumbnail crop
const thumbCrop = setupCrop(
  document.getElementById('thumb-crop'),
  document.getElementById('thumb-canvas'),
  document.getElementById('thumb-input'),
  document.getElementById('thumb-placeholder'),
  document.getElementById('thumb-controls'),
  document.getElementById('thumb-zoom')
);

// Screenshot crops
const screenshotCrops = [];
document.querySelectorAll('.screenshot-slot').forEach(slot => {
  const input = slot.querySelector('input[type="file"]');
  const canvas = slot.querySelector('canvas');
  const placeholder = slot.querySelector('.crop-placeholder');
  screenshotCrops.push(setupCrop(slot, canvas, input, placeholder, null, null));
});

// --- Form submission ---
document.getElementById('game-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) {
    alert('Please sign in first.');
    return;
  }

  if (!thumbCrop.hasImage()) {
    alert('Please upload a thumbnail.');
    return;
  }

  // Generate a unique game ID for file paths
  const gameId = crypto.randomUUID();

  // Upload thumbnail
  let thumbnailUrl = null;
  try {
    const thumbBlob = await thumbCrop.getBlob();
    if (thumbBlob) {
      const thumbPath = `${gameId}/thumbnail.jpg`;
      const { error: upErr } = await sb.storage.from('MCBlox').upload(thumbPath, thumbBlob, {
        contentType: 'image/jpeg',
        upsert: true
      });
      if (upErr) throw upErr;
      const { data: urlData } = sb.storage.from('MCBlox').getPublicUrl(thumbPath);
      thumbnailUrl = urlData.publicUrl;
    }
  } catch (err) {
    alert('Failed to upload thumbnail: ' + (err.message || 'Unknown error'));
    return;
  }

  // Upload screenshots
  const screenshotUrls = [];
  for (let i = 0; i < screenshotCrops.length; i++) {
    if (!screenshotCrops[i].hasImage()) continue;
    try {
      const blob = await screenshotCrops[i].getBlob();
      if (!blob) continue;
      const ssPath = `${gameId}/screenshot_${i}.jpg`;
      const { error: upErr } = await sb.storage.from('MCBlox').upload(ssPath, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });
      if (upErr) throw upErr;
      const { data: urlData } = sb.storage.from('MCBlox').getPublicUrl(ssPath);
      screenshotUrls.push(urlData.publicUrl);
    } catch (err) {
      console.warn('Screenshot upload failed:', err);
    }
  }

  const gameData = {
    id: gameId,
    creator_id: user.id,
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    tags: [...selectedTags],
    thumbnail_url: thumbnailUrl,
    screenshots: screenshotUrls,
    modpack_url: document.getElementById('modpack-url').value.trim(),
    mc_version: document.getElementById('mc-version').value.trim(),
    mod_loader: document.getElementById('mod-loader').value,
    loader_version: document.getElementById('loader-version').value.trim() || null,
    game_type: gameTypeSelect.value,
    server_address: gameTypeSelect.value === 'server'
      ? document.getElementById('server-address').value.trim() || null
      : null,
    world_name: gameTypeSelect.value === 'world'
      ? document.getElementById('world-name').value.trim() || null
      : null,
    status: 'pending_review',
    thumbs_up: 0,
    thumbs_down: 0,
    total_plays: 0,
    is_promoted: false
  };

  try {
    const { error } = await sb.from('games').insert(gameData);
    if (error) throw error;
    alert('Game submitted for review! You can track it in your Dashboard.');
    window.location.href = 'dashboard.html';
  } catch (e) {
    alert('Error submitting: ' + (e.message || 'Unknown error'));
  }
});
