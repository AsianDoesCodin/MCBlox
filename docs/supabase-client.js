// Shared Supabase client for all McBlox website pages (Cozy theme)
// Loaded via <script src="supabase-client.js">

const SUPABASE_URL = 'https://ldipundnojizgnykqvdd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_l5NXtUaTUkl6zzEMZlBAjw_fw-8YJb7';

function isAdmin() {
  return _adminRole === 'admin';
}

function canAccessAdminPanel() {
  return _adminRole === 'admin' || _adminRole === 'mod';
}

function getAdminRole() {
  return _adminRole;
}

let _supabase = null;
let _session = null;
let _adminRole = null;

function getSupabase() {
  if (!_supabase && window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

function getSession() {
  return _session;
}

function getUser() {
  return _session?.user || null;
}

// Auth state management
const _authCallbacks = [];
let _authInitialized = false;

function onAuthChange(cb) {
  _authCallbacks.push(cb);
  if (_authInitialized) {
    cb(_session);
  }
}

function _notifyAuth() {
  _authCallbacks.forEach(cb => cb(_session));
}

async function refreshAdminStatus() {
  const sb = getSupabase();
  const user = getUser();
  if (!sb || !user) {
    _adminRole = null;
    return false;
  }

  const { data: role, error: roleError } = await sb.rpc('current_user_admin_role');
  if (!roleError) {
    _adminRole = role === 'admin' || role === 'mod' ? role : null;
    return canAccessAdminPanel();
  }

  // Backward-compatible fallback for deployments before admin role SQL is applied.
  const { data, error } = await sb.rpc('current_user_is_admin');
  _adminRole = !error && data === true ? 'admin' : null;
  return canAccessAdminPanel();
}

// Init auth on page load
async function initAuth() {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  _session = session;
  await refreshAdminStatus();
  _authInitialized = true;
  _notifyAuth();

  sb.auth.onAuthStateChange(async (_event, session) => {
    _session = session;
    await refreshAdminStatus();
    _notifyAuth();
  });
}

// Sign in with email
async function signInWithEmail(email, password) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not initialized');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sign up with email
async function signUpWithEmail(email, password, username) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not initialized');
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });
  if (error) throw error;
  return data;
}

// Sign out
async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

// Update nav auth UI on all pages
function setupNavAuth() {
  const authBtn = document.getElementById('auth-btn');
  const publishBtn = document.getElementById('publish-nav-btn');
  const navAvatar = document.getElementById('nav-avatar');
  const userDropdown = document.getElementById('user-dropdown');
  const authWrap = document.getElementById('auth-wrap');
  if (!authBtn) return;

  async function updateBtn() {
    const user = getUser();
    if (user) {
      const name = user.user_metadata?.username || user.email?.split('@')[0] || 'Account';
      let avatarUrl = user.user_metadata?.avatar_url;

      // If no avatar in auth metadata, try profiles table
      if (!avatarUrl) {
        try {
          const sb = getSupabase();
          if (sb) {
            const { data } = await sb.from('profiles').select('avatar_url').eq('id', user.id).single();
            if (data?.avatar_url) avatarUrl = data.avatar_url;
          }
        } catch (e) {}
      }

      // Hide sign in, show avatar
      authBtn.style.display = 'none';
      if (publishBtn) publishBtn.style.display = '';
      if (navAvatar) {
        navAvatar.style.display = '';
        navAvatar.replaceChildren();
        if (avatarUrl) {
          const img = document.createElement('img');
          img.src = avatarUrl;
          img.alt = '';
          navAvatar.appendChild(img);
        } else {
          const initial = (name || '?')[0].toUpperCase();
          const span = document.createElement('span');
          span.style.cssText = 'font-size:14px;font-weight:700;color:#fff;line-height:30px;';
          span.textContent = initial;
          navAvatar.appendChild(span);
        }
      }

      // Build dropdown
      if (userDropdown) {
        let items = `<a href="profile.html">👤 Profile</a>`;
        if (canAccessAdminPanel()) {
          const adminLabel = isAdmin() ? 'Admin' : 'Mod';
          items += `<a href="admin.html" style="color:var(--red);font-weight:700;">🛡️ ${adminLabel}</a>`;
        }
        items += `<a href="#" id="logout-link" class="danger">↩ Sign Out</a>`;
        userDropdown.innerHTML = items;

        document.getElementById('logout-link').addEventListener('click', (e) => {
          e.preventDefault();
          signOut();
          userDropdown.classList.remove('open');
        });
      }
    } else {
      authBtn.style.display = '';
      authBtn.textContent = 'Sign In';
      authBtn.onclick = () => showAuthModal();
      if (navAvatar) navAvatar.style.display = 'none';
      if (userDropdown) { userDropdown.classList.remove('open'); userDropdown.innerHTML = ''; }
    }
  }

  // Avatar click toggle dropdown
  if (navAvatar) {
    navAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (userDropdown) {
        userDropdown.classList.toggle('open');
      }
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (authWrap && !authWrap.contains(e.target)) {
      if (userDropdown) userDropdown.classList.remove('open');
    }
  });

  onAuthChange(updateBtn);
  updateBtn();
}

// Auth modal (Cozy themed)
function showAuthModal() {
  const existing = document.getElementById('auth-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'auth-modal-overlay';
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal">
      <h2 id="auth-modal-title">Sign In</h2>
      <form id="auth-modal-form">
        <div id="auth-username-row" style="display:none" class="form-group">
          <input type="text" id="auth-username" placeholder="Username">
        </div>
        <div class="form-group">
          <input type="email" id="auth-email" placeholder="Email" required>
        </div>
        <div class="form-group">
          <input type="password" id="auth-password" placeholder="Password" required minlength="6">
        </div>
        <div id="auth-error" style="color:var(--red);font-size:12px;margin-bottom:8px;display:none;"></div>
        <button type="submit" class="btn btn-warm" style="width:100%" id="auth-submit-btn">Sign In</button>
      </form>
      <div class="form-footer" style="text-align:center;margin-top:12px;font-size:12px;color:var(--text3);">
        <span id="auth-toggle-text">Don't have an account?</span>
        <a href="#" id="auth-toggle-link" style="color:var(--warm);font-weight:600;"> Sign Up</a>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let isSignUp = false;
  const form = document.getElementById('auth-modal-form');
  const title = document.getElementById('auth-modal-title');
  const usernameRow = document.getElementById('auth-username-row');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleText = document.getElementById('auth-toggle-text');
  const toggleLink = document.getElementById('auth-toggle-link');
  const errorEl = document.getElementById('auth-error');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    title.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    usernameRow.style.display = isSignUp ? '' : 'none';
    submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    toggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    toggleLink.textContent = isSignUp ? ' Sign In' : ' Sign Up';
    errorEl.style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Loading...';

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    try {
      if (isSignUp) {
        const username = document.getElementById('auth-username').value.trim();
        if (!username) throw new Error('Username is required');
        await signUpWithEmail(email, password, username);
        showToast('Check your email for a confirmation link!', 'info');
      } else {
        await signInWithEmail(email, password);
      }
      overlay.remove();
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong';
      errorEl.style.display = '';
      submitBtn.disabled = false;
      submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    }
  });
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initAuth().then(() => setupNavAuth());
  });
} else {
  initAuth().then(() => setupNavAuth());
}
