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

function renderOrderSummary(items) {
  const el = document.getElementById('order-items');
  el.innerHTML = items.map(item => `
    <div class="cart-item" style="padding:12px; display:flex; align-items:center; gap:12px; border:1px solid #f1f5f9; border-radius:12px; margin-bottom:8px; background:#fff;">
      <div style="width:50px; height:50px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        ${item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; max-height:100%; object-fit:cover;">` : `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        `}
      </div>
      <div class="cart-item-info" style="flex:1; text-align:right;">
        <div class="cart-item-name" style="font-weight:700; font-size:0.9rem;">${item.name}</div>
        <div style="font-size: 0.85rem; color: #64748b; white-space: nowrap; font-weight: 500;">${item.quantity} x ${formatPrice(item.unitPrice)}</div>
        <div class="cart-item-options" style="font-size:0.8rem; color:#64748b;">${item.selectedOptions.map(o => `${o.groupName}: ${o.label}`).join(', ')}</div>
      </div>
      <div class="cart-item-price" style="flex-shrink:0; font-weight:700; color:var(--primary, #916C4F);">${formatPrice(item.unitPrice * item.quantity)}</div>
    </div>
  `).join('');
  updatePriceSummary();
}

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
  const zoneList = document.getElementById('zone-list');
  if (!zoneList) return;
  
  zoneList.innerHTML = '';
  if (cityId) {
    // 1. Try local data first
    const localGov = (window._fullShippingData || []).find(s => s._id === cityId);
    if (localGov && localGov.zones && localGov.zones.length > 0) {
      localGov.zones.forEach(z => {
        const val = z.otherName || z.name;
        const opt = document.createElement('option');
        opt.value = val;
        zoneList.appendChild(opt);
      });
    } else {
      // 2. Fallback to API fetch
      try {
        const zones = await api.getZones(cityId);
        zones.forEach(z => {
          const val = z.otherName || z.name;
          const opt = document.createElement('option');
          opt.value = val;
          zoneList.appendChild(opt);
        });
      } catch (e) {
        console.error('Failed to load zones', e);
      }
    }
  }
  updatePriceSummary();
}

function updatePriceSummary() {
  const subtotal = Cart.getTotal();
  const cityId = document.getElementById('government').value;
  const data = (window._fullShippingData || []).find(s => s._id === cityId);
  const shippingFee = data ? (data.fee || 0) : 0;
  const total = subtotal + shippingFee;

  document.getElementById('subtotal').textContent = formatPrice(subtotal);
  document.getElementById('shipping-fee').textContent = cityId ? formatPrice(shippingFee) : '—';
  document.getElementById('total-price').textContent = formatPrice(total);
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
    
    // Zone validation: must be in datalist
    const zoneOptions = Array.from(document.querySelectorAll('#zone-list option')).map(o => o.value);
    if (!zoneOptions.includes(zone)) {
      showToast('يرجى اختيار منطقة صحيحة من القائمة', 'error');
      btn.disabled = false; btn.textContent = 'تأكيد الطلب';
      return;
    }

    const name = document.getElementById('cust-name').value.trim();
    if (name.split(/\s+/).filter(Boolean).length < 2) { showToast('الرجاء إدخال الاسم الثنائي (الاسم الأول والأخير)', 'error'); btn.disabled = false; btn.textContent = 'تأكيد الطلب'; return; }

    const phone = document.getElementById('cust-phone').value.trim();
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
