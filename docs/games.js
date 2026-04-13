// Games catalog — uses shared supabase-client.js for auth

const TAGS = [
  'Adventure', 'RPG', 'PvP', 'Creative', 'Survival',
  'Skyblock', 'Horror', 'Puzzle', 'Minigame', 'Parkour',
  'Tech', 'Magic', 'Quests', 'Building', 'Exploration',
  'Competitive', 'Coop', 'Story', 'Open World', 'Hardcore'
];

const grid = document.getElementById('game-grid');
const featuredCarousel = document.getElementById('featured-carousel');
const featuredDots = document.getElementById('featured-dots');
const featuredSection = document.getElementById('featured-section');
const empty = document.getElementById('empty');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const tagToggleBtn = document.getElementById('tag-toggle-btn');
const tagDropdown = document.getElementById('tag-dropdown');
const tagClearBtn = document.getElementById('tag-clear-btn');

const activeTags = new Set();
let activeTypeFilter = 'all';
let allGames = [];

// Toggle dropdown
tagToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  tagDropdown.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.tag-filter-wrap')) {
    tagDropdown.classList.remove('open');
  }
});

tagClearBtn.addEventListener('click', () => {
  activeTags.clear();
  activeTypeFilter = 'all';
  renderTagPills();
  renderTypeFilters();
  render();
});

// Type filter buttons
function renderTypeFilters() {
  document.getElementById('type-btns').querySelectorAll('.tag-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === activeTypeFilter);
  });
  updateToggleBtn();
}

document.getElementById('type-btns').querySelectorAll('.tag-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTypeFilter = btn.dataset.type;
    renderTypeFilters();
    render();
  });
});

function updateToggleBtn() {
  const count = activeTags.size + (activeTypeFilter !== 'all' ? 1 : 0);
  if (count > 0) {
    tagToggleBtn.textContent = `Tags (${count})`;
    tagToggleBtn.classList.add('has-tags');
    tagClearBtn.style.display = '';
  } else {
    tagToggleBtn.textContent = 'Tags';
    tagToggleBtn.classList.remove('has-tags');
    tagClearBtn.style.display = 'none';
  }
}

// Tag pills
function renderTagPills() {
  const container = document.getElementById('tag-pills');
  container.innerHTML = '';
  TAGS.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-pill' + (activeTags.has(tag.toLowerCase()) ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      const key = tag.toLowerCase();
      if (activeTags.has(key)) activeTags.delete(key);
      else activeTags.add(key);
      renderTagPills();
      render();
    });
    container.appendChild(btn);
  });
  updateToggleBtn();
}
renderTagPills();

// Skeleton loading
function showSkeletons(count) {
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'skeleton';
    el.innerHTML = `<div class="sk-thumb"></div><div class="sk-body"><div class="sk-line w75"></div><div class="sk-line w50"></div><div class="sk-line w30"></div></div>`;
    grid.appendChild(el);
  }
}
showSkeletons(6);

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function gameCardHTML(game) {
  const thumbContent = game.thumbnail_url
    ? `<img src="${encodeURI(game.thumbnail_url)}" alt="${escapeHtml(game.title)}">`
    : '';
  const players = game.player_count || 0;
  const likes = game.thumbs_up || 0;
  const dislikes = game.thumbs_down || 0;
  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;
  const tag = (game.tags || [])[0] || '';
  const type = game.game_type === 'server' ? 'Multiplayer' : 'Singleplayer';

  return `
    <a class="game-card" href="game.html?id=${game.id}">
      <div class="thumb">${thumbContent}${players > 0 ? `<div class="badge"><span class="dot"></span>${players}</div>` : ''}</div>
      <div class="body">
        <div class="title">${escapeHtml(game.title)}</div>
        <div class="sub">${escapeHtml(game.author)} · ${escapeHtml(game.mc_version || '')} ${escapeHtml(game.loader || '')}</div>
        <div class="bottom">
          ${total > 0 ? `<div class="rating">⭐ ${pct}%</div>` : '<div></div>'}
          ${tag ? `<div class="tag">${escapeHtml(tag)}</div>` : ''}
        </div>
        <div class="type-label">${type}</div>
      </div>
    </a>
  `;
}

function render() {
  const query = searchInput.value.toLowerCase().trim();
  const sort = sortSelect.value;

  let filtered = [...allGames];
  if (activeTypeFilter !== 'all') filtered = filtered.filter(g => g.game_type === activeTypeFilter);
  if (query) filtered = filtered.filter(g => g.title.toLowerCase().includes(query));
  if (activeTags.size > 0) {
    filtered = filtered.filter(g => {
      const gt = (g.tags || []).map(t => t.toLowerCase());
      return [...activeTags].every(t => gt.includes(t));
    });
  }

  if (sort === 'popular') filtered.sort((a, b) => (b.total_plays || 0) - (a.total_plays || 0));
  else if (sort === 'active') filtered.sort((a, b) => (b.player_count || 0) - (a.player_count || 0));
  else if (sort === 'newest') filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (sort === 'top-rated') filtered.sort((a, b) => (b.thumbs_up || 0) - (a.thumbs_up || 0));

  // Featured carousel — featured games ALSO appear in the regular grid
  const featured = filtered.filter(g => g.is_promoted);

  if (featured.length > 0) {
    featuredSection.style.display = '';
    featuredCarousel.innerHTML = featured.map(g => {
      const thumbContent = g.banner_url || g.thumbnail_url;
      const players = g.player_count || 0;
      const likes = g.thumbs_up || 0, dislikes = g.thumbs_down || 0, total = likes + dislikes;
      const pct = total > 0 ? Math.round((likes / total) * 100) : 0;
      return `
        <div class="featured-slide">
          <div class="visual" style="background:linear-gradient(135deg,#3a2e5c,#2e1b4e);">
            ${thumbContent ? `<img src="${encodeURI(thumbContent)}" alt="">` : '<span class="placeholder">⛏</span>'}
          </div>
          <div class="info">
            <div class="kicker">⭐ Featured</div>
            <h2>${escapeHtml(g.title)}</h2>
            <div class="desc">${escapeHtml(g.description || '')}</div>
            <div class="stats">
              <div class="stat"><div class="val m">${players}</div><div class="lbl">Playing</div></div>
              ${total > 0 ? `<div class="stat"><div class="val w">${pct}%</div><div class="lbl">Positive</div></div>` : ''}
            </div>
            <div class="actions">
              <a class="btn btn-sm btn-play" href="game.html?id=${g.id}">View Game</a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    featuredDots.innerHTML = featured.map((_, i) =>
      `<div class="featured-dot${i === 0 ? ' active' : ''}" onclick="scrollFeatured(${i})"></div>`
    ).join('');

    featuredCarousel.addEventListener('scroll', () => {
      const idx = Math.round(featuredCarousel.scrollLeft / featuredCarousel.offsetWidth);
      featuredDots.querySelectorAll('.featured-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    });
  } else {
    featuredSection.style.display = 'none';
  }

  grid.innerHTML = filtered.map(gameCardHTML).join('');
  empty.style.display = filtered.length === 0 && featured.length === 0 ? '' : 'none';
}

function scrollFeatured(idx) {
  featuredCarousel.scrollTo({ left: idx * featuredCarousel.offsetWidth, behavior: 'smooth' });
}

async function fetchGames() {
  const sb = getSupabase();
  if (!sb) { empty.style.display = ''; return; }

  try {
    const { data, error } = await sb.from('games').select('*, profiles:creator_id(username)').eq('status', 'approved');
    if (error) throw error;

    const twoMinAgo = new Date(Date.now() - 120000).toISOString();
    const { data: activity } = await sb.from('player_activity').select('game_id').gte('last_heartbeat', twoMinAgo);
    const counts = {};
    if (activity) activity.forEach(r => { counts[r.game_id] = (counts[r.game_id] || 0) + 1; });

    allGames = (data || []).map(g => ({
      ...g,
      player_count: counts[g.id] || 0,
      author: g.profiles?.username || 'Unknown'
    }));
    render();
  } catch (e) {
    console.error('Failed to fetch games:', e);
    empty.style.display = '';
  }
}

searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);

fetchGames();
