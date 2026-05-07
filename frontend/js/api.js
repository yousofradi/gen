const API_BASE = window.API_BASE || 'https://sundurashop-manage.onrender.com/api';

const api = {
  _adminKey() { return localStorage.getItem('adminKey') || ''; },

  async _request(path, opts = {}) {
    const cacheKey = `api_cache_${path}`;
    if (opts.useCache) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, time } = JSON.parse(cached);
        if (Date.now() - time < 60000) return data; // 1 min cache
      }
    }

    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (opts.admin) headers['x-admin-key'] = this._adminKey();
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (opts.useCache) {
      sessionStorage.setItem(cacheKey, JSON.stringify({ data, time: Date.now() }));
    }
    return data;
  },

  // Products
  getProducts(page, limit, admin = true, collectionId = '', search = '') {
    let url = `/products?admin=${admin}`;
    if (page) url += `&page=${page}`;
    if (limit) url += `&limit=${limit}`;
    if (collectionId) url += `&collectionId=${collectionId}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return this._request(url, { useCache: !admin });
  },
  searchProducts(query) {
    return this._request(`/products?admin=false&search=${encodeURIComponent(query)}`);
  },
  getProductsByCollection(collectionId) {
    return this._request(`/products?collectionId=${collectionId}`);
  },
  getProduct(id) { return this._request(`/products/${id}`); },
  getProductByHandle(handle) { return this._request(`/products/handle/${handle}`); },
  createProduct(d) { return this._request('/products', { method: 'POST', body: JSON.stringify(d), admin: true }); },
  updateProduct(id, d) { return this._request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(d), admin: true }); },
  deleteProduct(id) { return this._request(`/products/${id}`, { method: 'DELETE', admin: true }); },
  deleteProductsBatch(productIds) { return this._request('/products/delete/batch', { method: 'POST', body: JSON.stringify({ productIds }), admin: true }); },
  deactivateProductsBatch(productIds) { return this._request('/products/deactivate/batch', { method: 'POST', body: JSON.stringify({ productIds }), admin: true }); },
  reorderProducts(order) { return this._request('/products/reorder/batch', { method: 'PUT', body: JSON.stringify({ order }), admin: true }); },

  // Collections
  getCollections() { return this._request('/collections'); },
  getCollection(id) { 
    // If id is not an ObjectId format (approx 24 hex), try to get by slug
    if (id && id.length !== 24) {
      return this._request(`/collections?u=${id}`).then(cols => {
          if (Array.isArray(cols)) return cols.find(c => c.urlName === id);
          return cols;
      });
    }
    return this._request(`/collections/${id}`); 
  },
  createCollection(d) { return this._request('/collections', { method: 'POST', body: JSON.stringify(d), admin: true }); },
  updateCollection(id, d) { return this._request(`/collections/${id}`, { method: 'PUT', body: JSON.stringify(d), admin: true }); },
  deleteCollection(id) { return this._request(`/collections/${id}`, { method: 'DELETE', admin: true }); },
  deleteCollectionsBatch(collectionIds) { return this._request('/collections/delete/batch', { method: 'POST', body: JSON.stringify({ collectionIds }), admin: true }); },

  // Orders
  createOrder(d) { return this._request('/orders', { method: 'POST', body: JSON.stringify(d) }); },
  getOrders(archived = false) { return this._request(`/orders?archived=${archived}`, { admin: true }); },
  getOrder(id) { return this._request(`/orders/${id}`, { admin: true }); },
  getPublicOrder(id) { return this._request(`/orders/public/${id}`); },
  updateOrder(id, d) { return this._request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(d), admin: true }); },
  deleteOrder(id) { return this._request(`/orders/${id}`, { method: 'DELETE', admin: true }); },
  archiveOrders(orderIds) { return this._request('/orders/archive/batch', { method: 'POST', body: JSON.stringify({ orderIds }), admin: true }); },
  unarchiveOrders(orderIds) { return this._request('/orders/unarchive/batch', { method: 'POST', body: JSON.stringify({ orderIds }), admin: true }); },
  cancelOrder(id) { return this._request(`/orders/${id}/cancel`, { method: 'POST', admin: true }); },
  cancelOrdersBatch(orderIds) { return this._request('/orders/cancel/batch', { method: 'POST', body: JSON.stringify({ orderIds }), admin: true }); },
  deleteOrdersBatch(orderIds) { return this._request('/orders/delete/batch', { method: 'POST', body: JSON.stringify({ orderIds }), admin: true }); },

  // Customers
  getCustomers() { return this._request('/customers', { admin: true }); },
  getCustomer(phone) { return this._request(`/customers/${phone}`, { admin: true }); },

  // Shipping
  getShipping() { return this._request('/shipping'); },
  getShippingList() { return this._request('/shipping/list', { admin: true }); },
  createShipping(d) { return this._request('/shipping', { method: 'POST', body: JSON.stringify(d), admin: true }); },
  updateShipping(id, d) { return this._request(`/shipping/${id}`, { method: 'PUT', body: JSON.stringify(d), admin: true }); },
  deleteShipping(id) { return this._request(`/shipping/${id}`, { method: 'DELETE', admin: true }); },

  // Webhooks
  getWebhooks() { return this._request('/webhooks', { admin: true }); },
  createWebhook(d) { return this._request('/webhooks', { method: 'POST', body: JSON.stringify(d), admin: true }); },
  updateWebhook(id, d) { return this._request(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(d), admin: true }); },
  deleteWebhook(id) { return this._request(`/webhooks/${id}`, { method: 'DELETE', admin: true }); },

  // Settings
  getSetting(key) { return this._request(`/settings/${key}`); },
  updateSetting(key, value) { return this._request(`/settings/${key}`, { method: 'POST', body: JSON.stringify({ value }), admin: true }); },

  // Auth check
  async checkAdmin() {
    try { await this._request('/orders', { admin: true }); return true; }
    catch { return false; }
  },

  // File Upload
  uploadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/upload`, true);
      xhr.setRequestHeader('x-admin-key', this._adminKey());

      if (onProgress && xhr.upload) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            onProgress(percentComplete);
          }
        });
      }

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) { resolve({}); }
        } else {
          try {
            reject(new Error(JSON.parse(xhr.responseText).error));
          } catch (e) { reject(new Error('Upload failed')); }
        }
      };

      xhr.onerror = () => reject(new Error('Network Error'));

      const formData = new FormData();
      formData.append('image', file);
      xhr.send(formData);
    });
  },

  importProducts(file, deleteAll, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/products/import`, true);
      xhr.setRequestHeader('x-admin-key', this._adminKey());

      if (onProgress && xhr.upload) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            onProgress(percentComplete);
          }
        });
      }

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) { resolve({}); }
        } else {
          try {
            reject(new Error(JSON.parse(xhr.responseText).error));
          } catch (e) { reject(new Error('Import failed')); }
        }
      };

      xhr.onerror = () => reject(new Error('Network Error'));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('deleteAll', deleteAll);
      xhr.send(formData);
    });
  }
};

// ── Toast notification ─────────────────────────────────
function showToast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' error' : type === 'success' ? ' success' : ''}`;
  toast.innerHTML = `
    <span style="flex:1">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove?.(), 4500);
}

// ── Global Confirm Modal ────────────────────────────────
window.showConfirmModal = function (title, message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff; border-radius:16px; max-width:450px; width:90%; padding:0; box-shadow:0 20px 60px rgba(0,0,0,0.15); overflow:hidden;">
        <div style="padding:24px 24px 8px; text-align:center;">
          <div style="width:48px;height:48px;background:#fef2f2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          </div>
          <h3 style="margin:0 0 8px; font-size:1.15rem; color:#1e293b; font-weight:700;">${title}</h3>
          ${message ? `<p style="margin:0; color:#64748b; font-size:0.95rem; line-height:1.5;">${message}</p>` : ''}
        </div>
        <div style="padding:16px 24px 24px; display:flex; gap:12px; justify-content:center;">
          <button type="button" id="confirm-yes" style="background:#ef4444; color:#fff; border:none; border-radius:12px; padding:10px 36px; font-weight:600; font-size:0.95rem; cursor:pointer; transition:background 0.2s;">تأكيد</button>
          <button type="button" id="confirm-no" style="background:#f8fafc; color:#1e293b; border:1px solid #e2e8f0; border-radius:12px; padding:10px 36px; font-weight:600; font-size:0.95rem; cursor:pointer; transition:background 0.2s;">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#confirm-yes').onclick = () => {
      modal.remove();
      resolve(true);
    };
    modal.querySelector('#confirm-no').onclick = () => {
      modal.remove();
      resolve(false);
    };
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(false);
      }
    };
  });
};

// ── Currency formatter ─────────────────────────────────
function formatPrice(p) {
  return `${Number(p || 0).toLocaleString('ar-EG')} ج.م`;
}

// ── Mobile sidebar toggle (auto-init) ─────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.admin-sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  if (sidebar && toggle) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });

    sidebar.querySelectorAll('.admin-nav a').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth < 960) sidebar.classList.remove('open');
      });
    });

    document.addEventListener('click', (e) => {
      if (window.innerWidth < 960 && sidebar.classList.contains('open')) {
        const nav = sidebar.querySelector('.admin-nav');
        if (nav && !nav.contains(e.target) && !toggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      }
    });
  }
});

// ── Apply Global Settings ──────────────────────────────
// Immediately apply cached store URL if exists
(function() {
  const cachedUrl = localStorage.getItem('sundura_store_url');
  if (cachedUrl) {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.admin-store-preview').forEach(a => a.href = cachedUrl);
    });
  }
})();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const settings = await api.getSetting('sundura_global_settings');
    console.log('Settings loaded:', settings ? 'success' : 'empty');
    if (settings) {
      // 1. Logo
      if (settings.storeLogo) {
        document.querySelectorAll('.store-logo-img, img[src*="cmo1fsgmc060f01lwhwpn6ga7"]').forEach(img => {
          img.src = settings.storeLogo;
          img.style.opacity = '1';
        });
      }

      // 1.1 Store URL (Preview Button)
      if (settings.storeUrl) {
        localStorage.setItem('sundura_store_url', settings.storeUrl);
        document.querySelectorAll('.admin-store-preview').forEach(a => {
          a.href = settings.storeUrl;
        });
      }

      // 2. Favicon
      if (settings.storeFavicon) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = settings.storeFavicon;
      }

      // 3. Store Name & Titles
      if (settings.storeName) {
        // If title is just " | Page", replace first part. If it has a pipe, keep the page name.
        if (document.title.includes('|')) {
          const parts = document.title.split('|');
          document.title = parts[0].trim() + ' | ' + settings.storeName;
        } else {
          document.title = settings.storeName;
        }
        
        const adminBrand = document.querySelector('.admin-brand-title');
        if (adminBrand) adminBrand.textContent = settings.storeName;
        
        // Update any generic placeholders in the DOM
        document.querySelectorAll('.store-name-text').forEach(el => {
          el.textContent = settings.storeName;
        });

        const footerCopy = document.querySelector('.footer-bottom-bar');
        if (footerCopy) {
          footerCopy.innerHTML = `© ${new Date().getFullYear()} ${settings.storeName}. جميع الحقوق محفوظة.`;
        }
      }

      // 4. Contact Numbers (WhatsApp & Payment)
      const formatWaLink = (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('01')) clean = '2' + clean;
        return `https://wa.me/${clean}`;
      };

      const waLink = settings.socialWa ? formatWaLink(settings.socialWa) : '';

      if (settings.socialWa) {
        
        document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
          link.href = waLink;
        });

      }

      // 5. Social Links
      if (settings.socialFb) {
        document.querySelectorAll('a[href*="facebook.com"]').forEach(link => {
            if (!link.classList.contains('no-brand-sync')) link.href = settings.socialFb;
        });
      }
      if (settings.socialIg) {
        document.querySelectorAll('a[href*="instagram.com"]').forEach(link => {
            if (!link.classList.contains('no-brand-sync')) link.href = settings.socialIg;
        });
      }
      if (settings.socialTt) {
        document.querySelectorAll('a[href*="tiktok.com"]').forEach(link => {
            if (!link.classList.contains('no-brand-sync')) link.href = settings.socialTt;
        });
      }

      // Inject Social Row in Footer
      const footerNav = document.querySelector('.footer-nav');
      if (footerNav && !document.querySelector('.footer-socials')) {
        let socialHtml = '<div class="footer-socials" style="display:flex;gap:16px;justify-content:center;margin-top:16px;">';
        if (settings.socialFb) socialHtml += `<a href="${settings.socialFb}" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg></a>`;
        if (settings.socialIg) socialHtml += `<a href="${settings.socialIg}" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>`;
        if (settings.socialTt) socialHtml += `<a href="${settings.socialTt}" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5v3a3 3 0 0 1-3-3v8a8 8 0 1 1-8-8 1 1 0 0 1 1 1z"></path></svg></a>`;
        if (settings.socialTg) socialHtml += `<a href="${settings.socialTg}" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path></svg></a>`;
        if (settings.socialWa) {
            socialHtml += `<a href="${waLink}" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg></a>`;
        }
        socialHtml += '</div>';
        footerNav.insertAdjacentHTML('afterend', socialHtml);
      }

      // 6. Mobile Nav Update
      const navWaLink = document.getElementById('nav-wa-link');
      if (navWaLink && settings.socialWa) {
          navWaLink.href = waLink;
          navWaLink.title = settings.socialWa;
      }
      
      const navTgLink = document.getElementById('nav-tg-link');
      if (navTgLink && settings.socialTg) {
          navTgLink.href = settings.socialTg;
          const span = navTgLink.querySelector('span');
          if (span) span.textContent = 'تليجرام';
          const svg = navTgLink.querySelector('svg');
          if (svg) svg.innerHTML = `<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>`;
      }

      // 7. Custom Color Palette
      if (settings.primaryColor) {
        applyColorPalette(settings.primaryColor);
      }
      
      // Update specific dynamic messages
      if (settings.storeName) {
        window.storeNameForWA = settings.storeName;
      }

      // 8. Site Preview Image (OG Image)
      if (settings.storePreview) {
        const updateMeta = (attr, val, content) => {
          let el = document.querySelector(`meta[${attr}="${val}"]`);
          if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, val);
            document.head.appendChild(el);
          }
          el.content = content;
        };
        updateMeta('property', 'og:image', settings.storePreview);
        updateMeta('name', 'twitter:image', settings.storePreview);
      }
    }
  } catch (err) {
    console.error('Failed to load global settings', err);
  }
});

function applyColorPalette(hex) {
  if (!hex || hex.length < 7) return;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const root = document.documentElement;
    root.style.setProperty('--primary', hex);
    
    // Hover: 15% darker
    const hr = Math.max(0, Math.floor(r * 0.85));
    const hg = Math.max(0, Math.floor(g * 0.85));
    const hb = Math.max(0, Math.floor(b * 0.85));
    const hover = `rgb(${hr}, ${hg}, ${hb})`;
    root.style.setProperty('--primary-hover', hover);

    // Light: very transparent
    const light = `rgba(${r}, ${g}, ${b}, 0.08)`;
    root.style.setProperty('--primary-light', light);

    // Legacy support for older css var names
    root.style.setProperty('--primary', hex);
    root.style.setProperty('--primary-dark', hover);
  } catch(e) {
    console.error('Failed to apply color palette', e);
  }
}

// --- Global Slide Menu Logic ---
api.openMenu = function () {
  if (!document.getElementById('slide-menu-overlay')) {
    const menuHTML = `
      <div class="slide-cart-overlay" id="slide-menu-overlay" onclick="api.closeMenu()"></div>
      <div class="slide-menu" id="slide-menu-container">
        <div class="slide-menu-header">
          <h3 style="margin:0; font-size:1.15rem; font-weight:700">التصنيفات</h3>
          <button class="slide-cart-back" onclick="api.closeMenu()" style="transform:scaleX(-1)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div class="slide-menu-body" id="slide-menu-body">
          <div style="padding:15px; display:flex; flex-direction:column; gap:12px;">
            <div style="height:45px; background:#f1f5f9; border-radius:8px; animation: pulse 1.5s infinite;"></div>
            <div style="height:45px; background:#f1f5f9; border-radius:8px; animation: pulse 1.5s infinite;"></div>
            <div style="height:45px; background:#f1f5f9; border-radius:8px; animation: pulse 1.5s infinite;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', menuHTML);

    api.getCollections().then(cols => {
      const body = document.getElementById('slide-menu-body');
      if (!cols || cols.length === 0) {
        body.innerHTML = '<div style="padding:20px;text-align:center;color:#999">لا توجد تصنيفات</div>';
        return;
      }
      body.innerHTML = `
        <a href="products" class="slide-menu-item" onclick="api.closeMenu()" style="font-weight:700; color:var(--primary); border-bottom: 2px solid #f1f5f9; background: #f8fafc;">كل المنتجات</a>
      ` + cols.map(c => `<a href="collection?id=${c._id}" class="slide-menu-item" onclick="api.closeMenu()">${c.name}</a>`).join('');
    }).catch(err => {
      document.getElementById('slide-menu-body').innerHTML = '<div style="padding:20px;text-align:center;color:red">حدث خطأ</div>';
    });
  }

  document.getElementById('slide-menu-overlay').classList.add('open');
  document.getElementById('slide-menu-container').classList.add('open');
};

api.closeMenu = function () {
  const overlay = document.getElementById('slide-menu-overlay');
  const container = document.getElementById('slide-menu-container');
  if (overlay) overlay.classList.remove('open');
  if (container) container.classList.remove('open');
};

// --- Global Search Logic ---
api.openSearch = function () {
  if (!document.getElementById('search-overlay')) {
    const searchHTML = `
      <div class="search-overlay" id="search-overlay">
        <div class="search-box">
          <div class="search-input-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="global-search-input" placeholder="ابحث عن منتجات..." autocomplete="off">
            <button class="search-close-btn" onclick="api.closeSearch()">✕</button>
          </div>
          <div class="search-results" id="global-search-results"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', searchHTML);

    const input = document.getElementById('global-search-input');
    const results = document.getElementById('global-search-results');

    let debounce;
    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(debounce);
      if (q.length < 2) {
        results.innerHTML = '';
        return;
      }
      debounce = setTimeout(async () => {
        results.innerHTML = '<div class="search-loading">جاري البحث...</div>';
        try {
          const filtered = await api.searchProducts(q);
          if (!filtered || filtered.length === 0) {
            results.innerHTML = '<div class="search-empty">لا توجد نتائج</div>';
            return;
          }
          results.innerHTML = filtered.map(p => `
            <a href="${p.handle ? `product/${p.handle}` : `product?id=${p._id}`}" class="search-result-item">
              <img src="${p.imageUrl}" class="search-result-img" onerror="this.style.display='none'">
              <div class="search-result-info">
                <div class="search-result-name">${p.name}</div>
                <div class="search-result-price">${p.salePrice || p.price} ج.م</div>
              </div>
            </a>
          `).join('');
        } catch (err) {
          results.innerHTML = '<div class="search-empty">خطأ في التحميل</div>';
        }
      }, 300);
    });

    document.getElementById('search-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'search-overlay') api.closeSearch();
    });
  }

  const overlay = document.getElementById('search-overlay');
  overlay.classList.add('open');
  document.getElementById('global-search-input').focus();
  document.body.style.overflow = 'hidden';
};

api.closeSearch = function () {
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
};

// ── Global Number Input Wheel Prevention ──────────────
document.addEventListener('wheel', (e) => {
  if (document.activeElement && document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
}, { passive: true });
