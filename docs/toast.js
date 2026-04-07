// Toast notification system for McBlox website
(function() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
  document.body.appendChild(container);

  const colors = {
    success: { bg: '#2d5a1b', border: '#5b8731' },
    error:   { bg: '#5a1b1b', border: '#cc3333' },
    warning: { bg: '#5a4a1b', border: '#ffaa00' },
    info:    { bg: '#1b3a5a', border: '#4488cc' }
  };
  const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };

  window.showToast = function(message, type) {
    type = type || 'info';
    const c = colors[type] || colors.info;
    const el = document.createElement('div');
    el.style.cssText = `pointer-events:auto;padding:10px 16px;border-radius:4px;border-left:4px solid ${c.border};background:${c.bg};color:#fff;font-family:'Silkscreen',monospace;font-size:13px;max-width:360px;box-shadow:0 4px 12px rgba(0,0,0,0.4);opacity:0;transform:translateX(20px);transition:all 0.3s ease;`;
    el.textContent = (icons[type] || '') + ' ' + message;
    container.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(0)'; });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  };
})();
