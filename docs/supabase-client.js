// Shared Supabase client for all website pages
// Loaded via <script src="supabase-client.js">

const SUPABASE_URL = 'https://ldipundnojizgnykqvdd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_l5NXtUaTUkl6zzEMZlBAjw_fw-8YJb7';

let _supabase = null;
let _session = null;

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
function onAuthChange(cb) {
  _authCallbacks.push(cb);
}

function _notifyAuth() {
  _authCallbacks.forEach(cb => cb(_session));
}

// Init auth on page load
async function initAuth() {
  const sb = getSupabase();
  if (!sb) return;

  // Get current session
  const { data: { session } } = await sb.auth.getSession();
  _session = session;
  _notifyAuth();

  // Listen for changes
  sb.auth.onAuthStateChange((_event, session) => {
    _session = session;
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

// Update nav auth button on all pages
function setupNavAuth() {
  const authBtn = document.getElementById('auth-btn');
  if (!authBtn) return;

  function updateBtn() {
    const user = getUser();
    if (user) {
      authBtn.textContent = user.user_metadata?.username || user.email?.split('@')[0] || 'Account';
      authBtn.onclick = () => {
        if (confirm('Sign out?')) signOut();
      };
    } else {
      authBtn.textContent = 'Sign In';
      authBtn.onclick = () => showAuthModal();
    }
  }

  onAuthChange(updateBtn);
  updateBtn();
}

// Auth modal
function showAuthModal() {
  // Remove existing
  const existing = document.getElementById('auth-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'auth-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <div style="background:#2b2b2b;border:2px solid #5b8731;border-bottom:4px solid rgba(0,0,0,0.3);border-radius:4px;width:380px;padding:28px;">
      <h2 style="font-family:'Silkscreen',monospace;color:#ffaa00;font-size:18px;margin-bottom:16px;text-align:center;" id="auth-modal-title">Sign In</h2>
      <form id="auth-modal-form">
        <div id="auth-username-row" style="display:none;margin-bottom:10px;">
          <input type="text" id="auth-username" placeholder="Username" style="width:100%;padding:8px 12px;background:#3a3a3a;border:2px solid #555;border-radius:4px;color:#e8e8e8;font-size:14px;outline:none;">
        </div>
        <div style="margin-bottom:10px;">
          <input type="email" id="auth-email" placeholder="Email" required style="width:100%;padding:8px 12px;background:#3a3a3a;border:2px solid #555;border-radius:4px;color:#e8e8e8;font-size:14px;outline:none;">
        </div>
        <div style="margin-bottom:16px;">
          <input type="password" id="auth-password" placeholder="Password" required minlength="6" style="width:100%;padding:8px 12px;background:#3a3a3a;border:2px solid #555;border-radius:4px;color:#e8e8e8;font-size:14px;outline:none;">
        </div>
        <div id="auth-error" style="color:#ff5555;font-size:12px;margin-bottom:8px;display:none;"></div>
        <button type="submit" style="width:100%;padding:10px;background:#5b8731;border:2px solid rgba(255,255,255,0.1);border-bottom:4px solid rgba(0,0,0,0.3);border-radius:4px;color:#fff;font-family:'Silkscreen',monospace;font-size:14px;font-weight:700;cursor:pointer;" id="auth-submit-btn">Sign In</button>
      </form>
      <p style="text-align:center;margin-top:12px;font-size:12px;color:#808080;">
        <span id="auth-toggle-text">Don't have an account?</span>
        <a href="#" id="auth-toggle-link" style="color:#5b8731;text-decoration:none;font-weight:600;"> Sign Up</a>
      </p>
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

  // Close on overlay click
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
        alert('Check your email for a confirmation link!');
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
document.addEventListener('DOMContentLoaded', () => {
  initAuth().then(() => {
    setupNavAuth();
  });
});
