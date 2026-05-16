const SETTINGS_KEY = 'sundura_global_settings';
let originalSettings = null;
let paymentMethods = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAdmin()) return;

  try {
    const settings = await api.getSetting(SETTINGS_KEY);
    if (settings) {
      originalSettings = JSON.parse(JSON.stringify(settings));
      populateSettingsForm(settings);
    }
  } catch (err) {
    showToast('فشل تحميل الإعدادات', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }

  window.handleGlobalSave = async () => {
    return await saveSettings();
  };

  window.handleGlobalDiscard = () => {
    if (originalSettings) {
      populateSettingsForm(JSON.parse(JSON.stringify(originalSettings)));
      if (window.hideBar) window.hideBar();
    }
  };

  // Add change listeners to all static inputs
  const inputs = document.querySelectorAll('.form-control, input[type="hidden"]');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      if (window.markAsModified) window.markAsModified();
      if (input.id === 'setting-store-name') {
        updateBranding(input.value);
      }
    });
  });

  initColorPicker();
});

function initColorPicker() {
  const picker = document.getElementById('setting-primary-color');
  const hexInput = document.getElementById('setting-primary-color-hex');

  if (picker && hexInput) {
    picker.addEventListener('input', () => {
      hexInput.value = picker.value.toUpperCase();
      if (window.markAsModified) window.markAsModified();
    });
    hexInput.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (val.length === 7) {
        picker.value = val;
        if (window.markAsModified) window.markAsModified();
      }
    });
  }
}

function updateBranding(name) {
  const sidebarTitle = document.querySelector('.admin-brand-title');
  if (sidebarTitle) sidebarTitle.textContent = name || 'Store Admin';
}

function populateSettingsForm(s) {
  document.getElementById('setting-store-name').value = s.storeName || '';
  document.getElementById('setting-store-name-ar').value = s.storeNameAr || '';
  document.getElementById('setting-store-logo').value = s.storeLogo || '';
  document.getElementById('setting-store-favicon').value = s.storeFavicon || '';
  document.getElementById('setting-store-preview').value = s.storePreview || '';
  document.getElementById('setting-store-url').value = s.storeUrl || '';
  document.getElementById('setting-invoice-prefix').value = s.invoicePrefix || '';
  document.getElementById('setting-social-fb').value = s.socialFb || '';
  document.getElementById('setting-social-ig').value = s.socialIg || '';
  document.getElementById('setting-social-tt').value = s.socialTt || '';
  document.getElementById('setting-social-tg').value = s.socialTg || '';
  document.getElementById('setting-social-wa').value = s.socialWa || '';
  document.getElementById('setting-payment-notes').value = s.paymentNotes || '';
  document.getElementById('setting-primary-color').value = s.primaryColor || '#916C4F';
  document.getElementById('setting-primary-color-hex').value = (s.primaryColor || '#916C4F').toUpperCase();

  paymentMethods = s.paymentMethods || [];
  renderPaymentMethods();

  updateImagePreview('setting-store-logo', 'setting-logo-preview', 'logo-placeholder');
  updateImagePreview('setting-store-favicon', 'setting-favicon-preview', 'favicon-placeholder');
  updateImagePreview('setting-store-preview', 'setting-preview-preview', 'preview-placeholder');
  updateBranding(s.storeName);
}

function updateImagePreview(targetId, previewId, placeholderId) {
  const url = document.getElementById(targetId).value;
  const preview = document.getElementById(previewId);
  const placeholder = document.getElementById(placeholderId);

  if (url) {
    preview.src = url;
    preview.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
  }
}

async function handleImageUpload(input, targetId, previewId, placeholderId) {
  const file = input.files[0];
  if (!file) return;

  try {
    const res = await api.uploadFile(file);

    document.getElementById(targetId).value = res.url;
    updateImagePreview(targetId, previewId, placeholderId);
    if (window.markAsModified) window.markAsModified();
  } catch (err) {
    showToast('فشل رفع الصورة', 'error');
  }
}

function addPaymentMethod() {
  const id = Date.now().toString();
  paymentMethods.push({
    id,
    label: '',
    number: '',
    logo: ''
  });
  renderPaymentMethods();
  if (window.markAsModified) window.markAsModified();
}

function removePaymentMethod(id) {
  paymentMethods = paymentMethods.filter(m => m.id !== id);
  renderPaymentMethods();
  if (window.markAsModified) window.markAsModified();
}

async function handlePaymentLogoUpload(input, id) {
  const file = input.files[0];
  if (!file) return;
  try {
    const res = await api.uploadFile(file);
    const method = paymentMethods.find(m => m.id === id);
    if (method) method.logo = res.url;
    renderPaymentMethods();
    if (window.markAsModified) window.markAsModified();
  } catch (err) {
    showToast('فشل رفع الشعار', 'error');
  }
}

function updatePaymentMethod(id, field, value) {
  const method = paymentMethods.find(m => m.id === id);
  if (method) method[field] = value;
  if (window.markAsModified) window.markAsModified();
}

function renderPaymentMethods() {
  const container = document.getElementById('payment-methods-container');
  if (!container) return;

  container.innerHTML = paymentMethods.map(m => `
        <div class="admin-card" style="margin:0; border:1px solid #e2e8f0; background:#f8fafc; padding:12px; border-radius:12px; position:relative;">
            <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:12px;">
                <div style="display:flex; gap:8px; align-items:center;">
                  <!-- Right: Logo (Circular Shape) -->
                  <div style="width:50px; height:50px; background:#fff; border:1.5px solid #e2e8f0; border-radius:50%; display:flex; align-items:center; justify-content:center; overflow:hidden; box-shadow: 0 2px 4px -1px rgb(0 0 0 / 0.1);">
                      ${m.logo ? `<img src="${m.logo}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'}
                  </div>

                  <!-- Middle: Change Button -->
                  <button class="btn-change-shape" onclick="document.getElementById('pay-logo-${m.id}').click()" style="width:60px; height:36px; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; border-radius:8px; font-size:0.75rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                      تغيير
                  </button>
                  <input type="file" id="pay-logo-${m.id}" style="display:none" accept="image/*" onchange="handlePaymentLogoUpload(this, '${m.id}')">
                </div>

                <!-- Left: Delete Button -->
                <button class="btn-delete-shape" onclick="removePaymentMethod('${m.id}')" style="width:36px; height:36px; background:#fee2e2; border:1px solid #ef4444; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="حذف">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              <div class="form-group mb-0">
                  <input type="text" class="form-control" value="${m.label}" oninput="updatePaymentMethod('${m.id}', 'label', this.value)" placeholder="الاسم" style="font-weight:700; text-align:center; padding:8px; font-size:0.85rem;">
              </div>
              <div class="form-group mb-0">
                  <input type="text" class="form-control" value="${m.number}" oninput="updatePaymentMethod('${m.id}', 'number', this.value)" placeholder="الرقم" style="text-align:center; font-family:monospace; font-size:0.85rem; padding:8px;">
              </div>
            </div>
        </div>
    `).join('');
}

async function saveSettings() {
  const settings = {
    storeName: document.getElementById('setting-store-name').value.trim(),
    storeNameAr: document.getElementById('setting-store-name-ar').value.trim(),
    storeLogo: document.getElementById('setting-store-logo').value.trim(),
    storeFavicon: document.getElementById('setting-store-favicon').value.trim(),
    storePreview: document.getElementById('setting-store-preview').value.trim(),
    storeUrl: document.getElementById('setting-store-url').value.trim(),
    invoicePrefix: document.getElementById('setting-invoice-prefix').value.trim(),
    socialFb: document.getElementById('setting-social-fb').value.trim(),
    socialIg: document.getElementById('setting-social-ig').value.trim(),
    socialTt: document.getElementById('setting-social-tt').value.trim(),
    socialTg: document.getElementById('setting-social-tg').value.trim(),
    socialWa: document.getElementById('setting-social-wa').value.trim(),
    paymentNotes: document.getElementById('setting-payment-notes').value.trim(),
    primaryColor: document.getElementById('setting-primary-color').value,
    paymentMethods: paymentMethods
  };

  try {
    await api.updateSetting(SETTINGS_KEY, settings);
    originalSettings = JSON.parse(JSON.stringify(settings));
    
    // Immediately update preview links in the current page
    if (settings.storeUrl) {
      localStorage.setItem('sundura_store_url', settings.storeUrl);
      document.querySelectorAll('.admin-store-preview').forEach(a => {
        a.href = settings.storeUrl;
      });
    }

    showToast('تم حفظ الإعدادات بنجاح', 'success');
    if (window.hideBar) window.hideBar();
    return true;
  } catch (err) {
    showToast('فشل حفظ الإعدادات', 'error');
    console.error(err);
    return false;
  }
}
async function clearSystemCache() {
  const btn = document.getElementById('clear-cache-btn');
  if (!btn) return;
  
  const confirmed = await window.showConfirmModal('تأكيد مسح الذاكرة', 'هل أنت متأكد من مسح الذاكرة المؤقتة؟ قد يتسبب ذلك في بطء بسيط في تحميل الصفحات لأول مرة.');
  if (!confirmed) return;

  try {
    btn.disabled = true;
    btn.textContent = 'جاري المسح...';
    
    await api.clearCache();
    
    showToast('تم مسح الذاكرة المؤقتة بنجاح', 'success');
  } catch (err) {
    showToast('فشل مسح الذاكرة المؤقتة', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'مسح الذاكرة المؤقتة';
  }
}

window.clearSystemCache = clearSystemCache;
