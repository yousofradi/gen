/** Checkout page logic */
document.addEventListener('DOMContentLoaded', async () => {
  const items = Cart.getItems();
  if (!items.length) { window.location.href = 'cart'; return; }

  renderOrderSummary(items);
  await loadCities();
  await loadPaymentMethods();
  setupForm();
});

async function loadPaymentMethods() {
  const container = document.getElementById('payment-methods-checkout');
  if (!container) return;
  try {
    const settings = await api.getSetting('sundura_global_settings');
    const methods = settings ? (settings.paymentMethods || []) : [];
    
    if (methods.length === 0) {
      container.innerHTML = '<p class="text-muted text-center" style="padding:12px; background:#f8fafc; border-radius:8px; width:100%;">الدفع عند الاستلام</p>';
      return;
    }

    // One column list
    container.style.display = 'grid';
    container.style.gridTemplateColumns = '1fr';
    container.style.gap = '8px';

    const paymentNotes = settings ? (settings.paymentNotes || '') : '';

    container.innerHTML = methods.map((m, idx) => `
      <div class="radio-option">
        <input type="radio" name="payment" id="pay-${m.id}" value="${m.label}" ${idx === 0 ? 'checked' : ''}>
        <label for="pay-${m.id}" style="justify-content: space-between; padding: 12px 16px; border-radius:12px; border-width:1.5px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
               ${m.logo ? `<img src="${m.logo}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'}
            </div>
            <span style="font-weight:700; font-size:0.9rem; color:var(--text-main);">${m.label}</span>
          </div>
          
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn-copy-payment" onclick="event.preventDefault(); copyToClipboard('${m.number}', this)" style="background:var(--primary, #916C4F); color:#fff; border:none; border-radius:6px; padding:4px 10px; font-size:0.75rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.2s;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>نسخ</span>
            </button>
            <span dir="ltr" style="font-size: 0.85rem; font-weight: 800; color: #111827;">${m.number}</span>
          </div>
        </label>
      </div>
    `).join('');

    // Add global copy function
    window.copyToClipboard = (text, btn) => {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = 'تم النسخ';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = 'var(--primary, #916C4F)';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    // Show global notes
    const noteBox = document.getElementById('payment-instructions');
    if (paymentNotes) {
        noteBox.textContent = paymentNotes;
        noteBox.style.display = 'block';
    } else {
        noteBox.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load payment methods', err);
    container.innerHTML = '<p class="text-muted">خطأ في تحميل طرق الدفع</p>';
  }
}

function renderOrderSummary() {
  updatePriceSummary();
}

window.toggleSummary = function() {
  const summary = document.getElementById('collapsible-summary');
  if (summary) summary.classList.toggle('open');
};

async function loadCities() {
  try {
    const list = await api.getPublicShipping();
    window._fullShippingData = list;
    const select = document.getElementById('government');
    select.innerHTML = '<option value="">اختر المدينة...</option>';
    list.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s._id;
      opt.textContent = `${s.cityOtherName || s.city} (${formatPrice(s.fee)})`;
      select.appendChild(opt);
    });
    select.addEventListener('change', handleCityChange);
  } catch (err) {
    showToast('فشل في تحميل بيانات الشحن', 'error');
  }
}

async function handleCityChange() {
  const cityId = document.getElementById('government').value;
  const zoneInput = document.getElementById('zone');
  if (!zoneInput) return;
  
  zoneInput.value = ''; // Clear current selection
  const list = (window._fullShippingData || []).find(s => s._id === cityId);
  window._currentZones = list ? (list.zones || []) : [];
  
  renderZoneDropdown();
  updatePriceSummary();
}

function renderZoneDropdown() {
  const dropdown = document.getElementById('zone-dropdown');
  const query = document.getElementById('zone').value.toLowerCase().trim();
  
  if (!window._currentZones || window._currentZones.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  const filtered = window._currentZones.filter(z => 
    z.name.toLowerCase().includes(query) || (z.otherName && z.otherName.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div style="padding: 10px; color: #94a3b8; text-align: center;">لا توجد مناطق مطابقة</div>';
  } else {
    dropdown.innerHTML = filtered.map(z => {
      const zoneLabel = `${z.otherName || z.name}${z.districtOtherName ? ` - ${z.districtOtherName}` : ''}`;
      return `
        <div class="dropdown-item" onclick="selectZone('${zoneLabel.replace(/'/g, "\\'")}')" 
          style="padding: 10px 16px; cursor: pointer; transition: background 0.2s;"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          ${zoneLabel}
        </div>
      `;
    }).join('');
  }
}

window.selectZone = function(val) {
  const zoneInput = document.getElementById('zone');
  zoneInput.value = val;
  document.getElementById('zone-dropdown').style.display = 'none';
  updatePriceSummary();
};

document.addEventListener('click', (e) => {
  const container = document.getElementById('zone-search-container');
  const dropdown = document.getElementById('zone-dropdown');
  if (container && !container.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

document.getElementById('zone')?.addEventListener('focus', () => {
  if (window._currentZones && window._currentZones.length > 0) {
    document.getElementById('zone-dropdown').style.display = 'block';
    renderZoneDropdown();
  }
});

document.getElementById('zone')?.addEventListener('input', renderZoneDropdown);

function updatePriceSummary() {
  const items = Cart.getItems();
  const subtotal = Cart.getTotal();
  const cityId = document.getElementById('government').value;
  const data = (window._fullShippingData || []).find(s => s._id === cityId);
  const shippingFee = data ? (data.fee || 0) : 0;
  const total = subtotal + shippingFee;

  // Update Header Price
  const headerTotal = document.getElementById('header-total-price');
  if (headerTotal) headerTotal.textContent = formatPrice(total);

  // Update Final Total Above Button
  const btnTotal = document.getElementById('final-total-above-btn');
  if (btnTotal) btnTotal.textContent = formatPrice(total);

  // Update Summary Rows
  const subEl = document.getElementById('summary-subtotal');
  const shipEl = document.getElementById('summary-shipping');
  const totalEl = document.getElementById('summary-total-final');

  if (subEl) subEl.textContent = formatPrice(subtotal);
  if (shipEl) shipEl.textContent = cityId ? formatPrice(shippingFee) : '—';
  if (totalEl) totalEl.textContent = formatPrice(total);

  // Render Items in Summary
  const listEl = document.getElementById('summary-items-list');
  if (listEl) {
    listEl.innerHTML = items.map(item => `
      <div class="summary-item">
        <div class="summary-item-img-wrapper">
          ${item.imageUrl ? `<img src="${item.imageUrl}" class="summary-item-img">` : `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#94a3b8">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
          `}
          <div class="summary-item-qty">${item.quantity}</div>
        </div>
        <div class="summary-item-info">
          <div class="summary-item-name">${item.name}</div>
          <div class="summary-item-desc">${item.selectedOptions.map(o => o.label).join(' / ')}</div>
        </div>
        <div class="summary-item-price">${formatPrice(item.unitPrice * item.quantity)}</div>
      </div>
    `).join('');
  }
}

function setupForm() {
  document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Placing Order...';

    const cityId = document.getElementById('government').value;
    const zone = document.getElementById('zone').value;
    const govData = (window._fullShippingData || []).find(s => s._id === cityId);
    const cityName = govData ? (govData.cityOtherName || govData.city) : '';

    if (!cityName || !zone) { showToast('الرجاء اختيار المدينة والمنطقة', 'error'); btn.disabled = false; btn.textContent = 'تأكيد الطلب'; return; }
    
    // Zone validation
    const zoneOptions = (window._currentZones || []).map(z => `${z.otherName || z.name}${z.districtOtherName ? ` - ${z.districtOtherName}` : ''}`);
    if (zoneOptions.length > 0 && !zoneOptions.includes(zone)) {
      showToast('يرجى اختيار منطقة صحيحة من القائمة', 'error');
      btn.disabled = false; btn.textContent = 'تأكيد الطلب';
      return;
    }

    const name = document.getElementById('cust-name').value.trim();
    if (name.split(/\s+/).filter(Boolean).length < 2) { showToast('الرجاء إدخال الاسم الثنائي (الاسم الأول والأخير)', 'error'); btn.disabled = false; btn.textContent = 'تأكيد الطلب'; return; }
    
    // Arabic-only name validation
    if (!/^[\u0600-\u06FF\s]+$/.test(name)) {
      showToast('يرجى إدخال اسم العميل باللغة العربية فقط', 'error');
      btn.disabled = false; btn.textContent = 'تأكيد الطلب';
      return;
    }

    const phone = document.getElementById('cust-phone').value.trim();
    const phone2 = document.getElementById('cust-phone2').value.trim();
    
    // English-only phone validation (digits)
    if (!/^[0-9+]+$/.test(phone) || (phone2 && !/^[0-9+]+$/.test(phone2))) {
      showToast('يرجى إدخال رقم الهاتف بالأرقام الإنجليزية فقط', 'error');
      btn.disabled = false; btn.textContent = 'تأكيد الطلب';
      return;
    }

    if (!/^01[0-9]{9}$/.test(phone)) { showToast('رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01', 'error'); btn.disabled = false; btn.textContent = 'تأكيد الطلب'; return; }

    const address = document.getElementById('cust-address').value.trim();
    if (address.split(/\s+/).filter(Boolean).length < 2) { showToast('الرجاء إدخال العنوان بالتفصيل (أكثر من كلمة)', 'error'); btn.disabled = false; btn.textContent = 'تأكيد الطلب'; return; }

    const payment = document.querySelector('input[name="payment"]:checked');
    if (!payment) { showToast('اختر طريقة الدفع', 'error'); btn.disabled = false; btn.textContent = 'تأكيد الطلب'; return; }

    const items = Cart.getItems().map(item => {
      const effectiveBase = (item.salePrice && item.salePrice < item.basePrice) ? item.salePrice : item.basePrice;
      return {
        productId: item.productId,
        name: item.name,
        imageUrl: item.imageUrl || '',
        basePrice: effectiveBase,
        selectedOptions: item.selectedOptions,
        finalPrice: item.unitPrice * item.quantity,
        quantity: item.quantity
      };
    });

    const orderData = {
      customer: {
        name: document.getElementById('cust-name').value.trim(),
        phone: document.getElementById('cust-phone').value.trim(),
        secondPhone: document.getElementById('cust-phone2').value.trim(),
        address: document.getElementById('cust-address').value.trim(),
        government: cityName,
        zone: zone,
        notes: document.getElementById('cust-notes').value.trim()
      },
      items,
      paymentMethod: payment.value
    };

    try {
      const order = await api.createOrder(orderData);
      Cart.clear();
      window.location.href = `payment?id=${order.orderId}`;
    } catch (err) {
      showToast(err.message || 'فشل في إتمام الطلب', 'error');
      btn.disabled = false; btn.textContent = 'تأكيد الطلب';
    }
  });
}
