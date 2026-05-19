function requireAdmin() {
  // Security: Prevent admin access on storefront domains
  const storefrontDomains = [];
  if (storefrontDomains.includes(window.location.hostname)) {
    window.location.href = '/';
    return false;
  }

  const key = localStorage.getItem('adminKey');
  const timestamp = localStorage.getItem('loginTimestamp');

  if (!key) {
    window.location.href = 'login.html';
    return false;
  }

  // Check for 30-day timeout (30 * 24 * 60 * 60 * 1000)
  if (timestamp) {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - parseInt(timestamp) > thirtyDays) {
      logout();
      return false;
    }
  }

  return true;
}
function logout() {
  localStorage.removeItem('adminKey');
  localStorage.removeItem('loginTimestamp');
  window.location.href = 'login.html';
}

// Global UI Helpers
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar Toggle (Delegated)
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.sidebar-toggle');
    if (toggleBtn) {
      e.stopPropagation();
      const sidebar = document.querySelector('.admin-sidebar');
      if (sidebar) sidebar.classList.toggle('open');
    } else {
      // Close sidebar when clicking outside
      const sidebar = document.querySelector('.admin-sidebar');
      if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  });

  // Unsaved Changes Bar
  initUnsavedChangesBar();

  // Disable browser autocomplete/suggestions on all inputs
  const disableAutocomplete = () => {
    document.querySelectorAll('input, textarea').forEach(el => {
      el.setAttribute('autocomplete', 'off');
    });
  };
  disableAutocomplete();

  // Also watch for dynamically added elements (like modals)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element
          if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
            node.setAttribute('autocomplete', 'off');
          }
          node.querySelectorAll?.('input, textarea').forEach(el => el.setAttribute('autocomplete', 'off'));
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── PWA Initialization ──
  const initPWA = () => {
    // 1. Generate Dynamic Manifest with Store Logo
    const storeLogo = localStorage.getItem('sundura_store_logo') || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    const storeName = localStorage.getItem('sundura_store_name') || 'Sundura Admin';

    const manifest = {
      "id": "sundura-admin-v1",
      "name": storeName,
      "short_name": storeName.split(' ')[0],
      "description": "Store Management Dashboard",
      "start_url": "index.html",
      "scope": "/admin/",
      "display": "standalone",
      "background_color": "#ffffff",
      "theme_color": "#64748b",
      "orientation": "portrait",
      "icons": [
        {
          "src": storeLogo,
          "sizes": "192x192",
          "type": "image/png",
          "purpose": "any"
        },
        {
          "src": storeLogo,
          "sizes": "512x512",
          "type": "image/png",
          "purpose": "any maskable"
        }
      ]
    };

    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestUrl = URL.createObjectURL(manifestBlob);

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = manifestUrl;

    // 2. Inject PWA Meta Tags
    const metaTags = [
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'theme-color', content: '#64748b' }
    ];
    metaTags.forEach(tag => {
      if (!document.querySelector(`meta[name="${tag.name}"]`)) {
        const m = document.createElement('meta');
        m.name = tag.name;
        m.content = tag.content;
        document.head.appendChild(m);
      }
    });

    // 3. Unregister Service Worker (to prevent caching)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister();
          console.log('Admin SW Unregistered');
        }
      });
    }

    // 4. Inject Notifications Script
    if (!document.querySelector('script[src*="notifications.js"]')) {
      const script = document.createElement('script');
      script.src = 'js/notifications.js';
      document.body.appendChild(script);
    }
  };
  initPWA();
});

function initUnsavedChangesBar() {
  if (document.body.hasAttribute('data-no-unsaved-bar')) return;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    .unsaved-bar {
      position: fixed;
      top: -100px;
      left: 20px;
      width: auto;
      min-width: 280px;
      background: #1e293b;
      color: #fff;
      padding: 10px 20px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
      z-index: 2000;
      transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      direction: rtl;
    }
    .unsaved-bar.visible {
      top: 20px;
    }
    .unsaved-actions {
      display: flex;
      gap: 10px;
      width: 100%;
      align-items: center;
    }
    .unsaved-btn {
      flex: 1;
      height: 38px;
      padding: 0 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-save-changes {
      background: #10b981;
      color: #fff;
    }
    .btn-save-changes:hover {
      background: #059669;
    }
    .btn-discard-changes {
      background: #475569;
      color: #fff;
    }
    .btn-discard-changes:hover {
      background: #334155;
    }
    @media (max-width: 600px) {
      .unsaved-bar {
        width: calc(100% - 32px);
        left: 16px;
        max-width: 400px;
        padding: 8px 12px;
        border-radius: 12px;
      }
      .unsaved-btn {
        padding: 8px 12px;
        font-size: 0.8rem;
      }
    }

  `;
  document.head.appendChild(style);

  // Inject Unsaved Bar HTML
  const bar = document.createElement('div');
  bar.className = 'unsaved-bar';
  bar.id = 'unsaved-changes-bar';
  bar.innerHTML = `
    <div class="unsaved-actions">
      <button class="unsaved-btn btn-discard-changes" id="btn-global-discard">تجاهل</button>
      <button class="unsaved-btn btn-save-changes" id="btn-global-save">احفظ التغييرات</button>
    </div>
  `;
  document.body.appendChild(bar);

  let hasChanges = false;

  window.markAsModified = () => {
    hasChanges = true;
    const b = document.getElementById('unsaved-changes-bar');
    if (b) b.classList.add('visible');
  };

  window.hideBar = () => {
    hasChanges = false;
    bar.classList.remove('visible');
  };

  const isSelectionControl = (el) => {
    if (!el) return false;
    return (el.id && el.id.startsWith('select-all')) ||
      el.classList.contains('row-checkbox') ||
      el.classList.contains('order-checkbox') ||
      el.classList.contains('product-checkbox') ||
      el.classList.contains('collection-checkbox') ||
      el.classList.contains('selection-checkbox') ||
      el.classList.contains('pli-checkbox') ||
      el.classList.contains('product-select-cb') ||
      el.classList.contains('product-variant-cb');
  };

  // Detect changes
  document.addEventListener('input', (e) => {
    // Ignore inputs inside modals (like product selection modal)
    if (e.target.closest('.modal-overlay') || e.target.closest('.modal-box') || e.target.closest('.hp-modal') || e.target.closest('[id*="modal"]')) return;

    // Ignore selection controls
    if (isSelectionControl(e.target)) return;

    // Ignore search inputs
    if (e.target.type === 'search' || e.target.id?.includes('search') || e.target.classList.contains('search-input') || e.target.placeholder?.includes('ابحث')) return;

    if (e.target.closest('form') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      window.markAsModified();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.closest('.modal-overlay') || e.target.closest('.modal-box') || e.target.closest('.hp-modal') || e.target.closest('[id*="modal"]')) return;

    // Ignore selection controls
    if (isSelectionControl(e.target)) return;

    // Ignore search inputs
    if (e.target.type === 'search' || e.target.id?.includes('search') || e.target.classList.contains('search-input') || e.target.placeholder?.includes('ابحث')) return;

    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'radio') {
      window.markAsModified();
    }
  });

  // Action: Discard
  document.getElementById('btn-global-discard').addEventListener('click', () => {
    if (window.handleGlobalDiscard) {
      window.handleGlobalDiscard();
    } else {
      location.reload();
    }
  });

  // Action: Save
  document.getElementById('btn-global-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;

    const oldText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;display:inline-block;vertical-align:middle;"></span> جاري الحفظ...';

    try {
      if (window.handleGlobalSave) {
        const success = await window.handleGlobalSave();
        if (success !== false) window.hideBar();
      } else {
        // Fallback: try to find a primary save button and click it
        const primaryBtn = document.querySelector('button[type="submit"], .btn-primary, #save-btn');
        if (primaryBtn) {
          primaryBtn.click();
          window.hideBar();
        } else {
          console.warn('Global save handler not implemented for this page.');
        }
      }
    } catch (err) {
      console.error('Global save error:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });

  // Enforce numbers only on type="number" fields
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
      // Allow: backspace, delete, tab, escape, enter, . (190, 110), - (189, 109)
      if ([46, 8, 9, 27, 13, 110, 190, 189, 109].indexOf(e.keyCode) !== -1 ||
         (e.keyCode === 65 && (e.ctrlKey === true || e.metaKey === true)) ||
         (e.keyCode >= 35 && e.keyCode <= 40)) {
             return;
      }
      // Stop the keypress if it's not a number
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
          e.preventDefault();
      }
    }
  });
}

function toggleSidebarDropdown(btn) {
  const container = btn.closest('.admin-nav-dropdown-container');
  if (container) {
    container.classList.toggle('is-active');
  }
}
