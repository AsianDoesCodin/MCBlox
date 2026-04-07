// Games catalog — uses shared supabase-client.js for auth

const TAGS = [
  'Adventure', 'RPG', 'PvP', 'Creative', 'Survival',
  'Skyblock', 'Horror', 'Puzzle', 'Minigame', 'Parkour',
  'Tech', 'Magic', 'Quests', 'Building', 'Exploration',
  'Competitive', 'Coop', 'Story', 'Open World', 'Hardcore'
];

const grid = document.getElementById('game-grid');
const featuredGrid = document.getElementById('featured-grid');
const featuredSection = document.getElementById('featured-section');
const empty = document.getElementById('empty');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const tagFilterBar = document.getElementById('tag-filter-bar');
const tagToggleBtn = document.getElementById('tag-toggle-btn');
const tagDropdown = document.getElementById('tag-dropdown');
const tagClearBtn = document.getElementById('tag-clear-btn');

const activeTags = new Set();
let allGames = [];

// Toggle dropdown
tagToggleBtn.addEventListener('click', () => {
  const visible = tagDropdown.style.display !== 'none';
  tagDropdown.style.display = visible ? 'none' : '';
});

// Close on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#tag-dropdown-wrap')) {
    tagDropdown.style.display = 'none';
  }
});

tagClearBtn.addEventListener('click', () => {
  activeTags.clear();
  renderTagFilters();
  render();
});

// Render tag filter buttons
function renderTagFilters() {
  tagFilterBar.innerHTML = '';
  TAGS.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-filter-btn' + (activeTags.has(tag.toLowerCase()) ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      const key = tag.toLowerCase();
      if (activeTags.has(key)) activeTags.delete(key);
      else activeTags.add(key);
      renderTagFilters();
      render();
    });
    tagFilterBar.appendChild(btn);
  });
  // Update toggle button
  if (activeTags.size > 0) {
    tagToggleBtn.textContent = `Tags (${activeTags.size})`;
    tagToggleBtn.classList.add('has-tags');
    tagClearBtn.style.display = '';
  } else {
    tagToggleBtn.textContent = 'Tags';
    tagToggleBtn.classList.remove('has-tags');
    tagClearBtn.style.display = 'none';
  }
}
renderTagFilters();

// Skeleton loading cards
function showSkeletons(count) {
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'game-card skeleton-card';
    el.innerHTML = `
      <div style="height:140px;background:#484848;border-radius:4px 4px 0 0"></div>
      <div style="padding:12px">
        <div style="height:14px;background:#484848;border-radius:3px;width:75%;margin-bottom:8px"></div>
        <div style="height:12px;background:#484848;border-radius:3px;width:50%;margin-bottom:10px"></div>
        <div style="display:flex;gap:6px">
          <div style="height:18px;background:#484848;border-radius:3px;width:40px"></div>
          <div style="height:18px;background:#484848;border-radius:3px;width:56px"></div>
        </div>
      </div>
    `;
    // Pulse animation
    el.style.animation = 'skeleton-pulse 1.5s ease-in-out infinite';
    grid.appendChild(el);
  }
}

// Add skeleton pulse animation
const skeletonStyle = document.createElement('style');
skeletonStyle.textContent = `@keyframes skeleton-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`;
document.head.appendChild(skeletonStyle);

// Show skeletons immediately
showSkeletons(6);

function renderCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  const thumbContent = game.thumbnail_url
    ? `<img src="${encodeURI(game.thumbnail_url)}" alt="${escapeHtml(game.title)}">`
    : '⛏';
  const players = game.player_count || 0;
  const likes = game.thumbs_up || 0;
  const dislikes = game.thumbs_down || 0;
  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;

  card.innerHTML = `
    <div class="game-thumb">${thumbContent}</div>
    <div class="game-info">
      <h3>${escapeHtml(game.title)}</h3>
      <div class="game-meta">
        <span class="players">&#9654; ${players} playing</span>
        <span>${total > 0 ? pct + '% &#128077;' : ''}</span>
      </div>
    </div>
  `;
  return card;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function render() {
  const query = searchInput.value.toLowerCase().trim();
  const sort = sortSelect.value;

  let filtered = allGames.filter(g => g.status === 'approved');

  if (query) {
    filtered = filtered.filter(g => {
      const title = g.title.toLowerCase();
      return title.includes(query);
    });
  }

  if (activeTags.size > 0) {
    filtered = filtered.filter(g => {
      const gameTags = (g.tags || []).map(t => t.toLowerCase());
      return [...activeTags].every(t => gameTags.includes(t));
    });
  }

  if (sort === 'popular') filtered.sort((a, b) => (b.total_plays || 0) - (a.total_plays || 0));
  else if (sort === 'newest') filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (sort === 'top-rated') filtered.sort((a, b) => (b.thumbs_up || 0) - (a.thumbs_up || 0));

  const featured = filtered.filter(g => g.is_promoted);
  const rest = filtered.filter(g => !g.is_promoted);

  featuredGrid.innerHTML = '';
  if (featured.length > 0) {
    featuredSection.style.display = '';
    featured.forEach(g => featuredGrid.appendChild(renderCard(g)));
  } else {
    featuredSection.style.display = 'none';
  }

  grid.innerHTML = '';
  if (rest.length > 0) {
    empty.style.display = 'none';
    rest.forEach(g => grid.appendChild(renderCard(g)));
  } else if (featured.length === 0) {
    empty.style.display = '';
  }
}

async function fetchGames() {
  const sb = getSupabase();
  if (!sb) {
    empty.style.display = '';
    featuredSection.style.display = 'none';
    return;
  }

  try {
    const { data, error } = await sb
      .from('games')
      .select('*')
      .eq('status', 'approved');
    if (error) throw error;
    allGames = data || [];
    render();
  } catch (e) {
    console.error('Failed to fetch games:', e);
    empty.style.display = '';
    featuredSection.style.display = 'none';
  }
}

searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);

fetchGames();
