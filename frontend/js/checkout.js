// Smart Search helper for Arabic
function smartMatch(text, query) {
  if (!query) return true; // Show all if no query
  if (!text) return false;
  const normalize = (s) => s.toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^ال/, '')
    .replace(/\sال/g, ' ')
    .trim();
  
  const nText = normalize(text);
  const nQuery = normalize(query);
  return nText.includes(nQuery) || nQuery.includes(nText);
}

/** Checkout page logic */
document.addEventListener('DOMContentLoaded', async () => {
  const items = Cart.getItems();
  if (!items.length) { window.location.href = 'cart'; return; }

  // Fetch shipping global settings
  try {
    const settings = await api.getSetting('sundura_global_settings');
    if (settings) {
      window._enableBosta = settings.enableBosta !== false;
      window._enableEgyptPost = settings.enableEgyptPost !== false;
      window._enableZones = settings.enableZones !== false;
      window._egyptPostFee = settings.egyptPostFee !== undefined ? Number(settings.egyptPostFee) : 60;
    } else {
      window._enableBosta = true;
      window._enableEgyptPost = true;
      window._enableZones = true;
      window._egyptPostFee = 60;
    }

    // Load active shipping options
    const options = await api.getSetting('shipping_options');
    window._shippingOptions = options || [];
  } catch (err) {
    console.warn('Failed to load global settings, using defaults', err);
    window._enableBosta = true;
    window._enableEgyptPost = true;
    window._enableZones = true;
    window._egyptPostFee = 60;
    window._shippingOptions = [];
  }

  // Hide zone field if zones are globally disabled
  if (window._enableZones === false) {
    const zoneGroup = document.getElementById('zone-form-group');
    const zoneInputEl = document.getElementById('zone');
    if (zoneGroup && zoneInputEl) {
      zoneGroup.style.display = 'none';
      zoneInputEl.required = false;
      zoneInputEl.value = '';
    }
  }

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
    
    const searchInput = document.getElementById('government-search');
    const dropdown = document.getElementById('gov-dropdown');
    const hiddenInput = document.getElementById('government');

    if (!searchInput || !dropdown) return;

    searchInput.addEventListener('focus', () => renderGovDropdown());
    searchInput.addEventListener('input', () => renderGovDropdown());
    
    document.addEventListener('click', (e) => {
      if (!document.getElementById('gov-search-container').contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    function renderGovDropdown() {
      const query = searchInput.value.trim();
      const filtered = list.filter(s => 
        smartMatch(s.city, query) || (s.cityOtherName && smartMatch(s.cityOtherName, query))
      );

      if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding: 10px; color: #94a3b8; text-align: center;">لا توجد نتائج</div>';
      } else {
        dropdown.innerHTML = filtered.map(s => `
          <div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9;" 
               onclick="selectGov('${s._id}', '${s.cityOtherName || s.city}')">
            ${s.cityOtherName || s.city}
          </div>
        `).join('');
      }
      dropdown.style.display = 'block';
    }

    window.selectGov = (id, name) => {
      hiddenInput.value = id;
      searchInput.value = name;
      dropdown.style.display = 'none';
      if (window.setErrorOnCheckout) window.setErrorOnCheckout(searchInput, null);
      handleGovChange();
    };

  } catch (err) {
    showToast('فشل في تحميل بيانات الشحن', 'error');
  }
}

async function handleGovChange() {
  const cityId = document.getElementById('government').value;
  const zoneInput = document.getElementById('zone');
  if (!zoneInput) return;
  
  zoneInput.value = ''; // Clear current selection

  if (window._enableZones === false) {
    const zoneGroup = document.getElementById('zone-form-group');
    const zoneInputEl = document.getElementById('zone');
    if (zoneGroup && zoneInputEl) {
      zoneGroup.style.display = 'none';
      zoneInputEl.required = false;
      zoneInputEl.value = '';
    }
    updatePriceSummary();
    return;
  }

  if (cityId) {
    try {
      // Fetch zones from API
      const zones = await api.getZones(cityId);
      window._currentZones = zones || [];
    } catch (err) {
      console.error('Failed to fetch zones:', err);
      window._currentZones = [];
    }
  }
  
  renderZoneDropdown();
  updatePriceSummary();

  // Show/Hide Zone Group
  const zoneGroup = document.getElementById('zone-form-group');
  const zoneInputEl = document.getElementById('zone');
  if (zoneGroup && zoneInputEl) {
    if (window._currentZones.length > 0) {
      zoneGroup.style.display = 'block';
      zoneInputEl.required = true;
    } else {
      zoneGroup.style.display = 'none';
      zoneInputEl.required = false;
      zoneInputEl.value = '';
    }
  }
}

function renderZoneDropdown() {
  const dropdown = document.getElementById('zone-dropdown');
  const zoneInput = document.getElementById('zone');
  const query = zoneInput.value.toLowerCase().trim();
  
  if (!window._currentZones || window._currentZones.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  const isExactMatch = window._currentZones.some(z => {
    const zoneLabel = api.formatZoneName(z);
    return zoneLabel.toLowerCase().trim() === query.toLowerCase().trim();
  });

  const filtered = isExactMatch ? window._currentZones : window._currentZones.filter(z => 
    smartMatch(z.name, query) || 
    (z.otherName && smartMatch(z.otherName, query)) ||
    (z.districtOtherName && smartMatch(z.districtOtherName, query))
  );

  if (filtered.length === 0 && query !== '') {
    if (window._selectedCarrier === 'bosta') {
      dropdown.innerHTML = `
        <div style="padding: 12px 10px; color: #94a3b8; text-align: center;">
          <div style="font-size:0.85rem; font-weight:600;">⚠️ لا توجد مناطق مطابقة تحت شحن بوسطة</div>
          <button type="button" onclick="window.setCarrier('egyptpost')" style="margin-top: 8px; padding: 6px 12px; background: var(--primary, #0f766e); color: #fff; border: none; border-radius: 12px; font-weight: 700; font-size: 0.8rem; cursor: pointer; outline: none;">التحويل إلى البريد المصري</button>
        </div>
      `;
    } else {
      dropdown.innerHTML = '<div style="padding: 10px; color: #94a3b8; text-align: center;">لا توجد مناطق مطابقة</div>';
    }
  } else {
    const displayList = filtered.length > 0 ? filtered : window._currentZones;
    dropdown.innerHTML = displayList.map(z => {
      const zoneLabel = api.formatZoneName(z);
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
  if (window.setErrorOnCheckout) window.setErrorOnCheckout(zoneInput, null);
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
  renderZoneDropdown();
  if (window._currentZones && window._currentZones.length > 0) {
    document.getElementById('zone-dropdown').style.display = 'block';
  }
});

document.getElementById('zone')?.addEventListener('click', () => {
  renderZoneDropdown();
  if (window._currentZones && window._currentZones.length > 0) {
    document.getElementById('zone-dropdown').style.display = 'block';
  }
});

document.getElementById('zone')?.addEventListener('input', () => {
  renderZoneDropdown();
  if (window._currentZones && window._currentZones.length > 0) {
    document.getElementById('zone-dropdown').style.display = 'block';
  }
});

function getSelectedZoneObject() {
  const zoneVal = document.getElementById('zone')?.value;
  if (!zoneVal || !window._currentZones) return null;
  return window._currentZones.find(z => api.formatZoneName(z) === zoneVal);
}

function updateShippingMethodNotice(isEgyptPost) {
  // Removed notice alert per user request
}

function updatePriceSummary() {
  const items = Cart.getItems();
  const subtotal = Cart.getTotal();
  const cityId = document.getElementById('government').value;
  const govData = (window._fullShippingData || []).find(s => s._id === cityId);
  const cityName = govData ? (govData.cityOtherName || govData.city) : '';

  let shippingFee = 0;
  let resolvedCarrier = 'bosta';

  // Check if zone is selected
  const selectedZone = getSelectedZoneObject();
  
  if (window._enableZones && selectedZone) {
    if (selectedZone.dropOffAvailability === false || selectedZone.bostaAvailable === false) {
      resolvedCarrier = 'egyptpost';
    } else {
      resolvedCarrier = 'bosta';
    }
  } else {
    if (window._enableBosta === false) {
      resolvedCarrier = 'egyptpost';
    } else {
      resolvedCarrier = 'bosta';
    }
  }
  
  window._selectedCarrier = resolvedCarrier;
  const isEgyptPost = resolvedCarrier === 'egyptpost';

  const isCityEqual = (c1, c2) => {
    if (!c1 || !c2) return false;
    const norm = (s) => s.toLowerCase()
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/^ال/, '')
      .replace(/\sال/g, ' ')
      .replace(/\s+/g, '')
      .trim();
    return norm(c1) === norm(c2);
  };

  if (cityName) {
    if (isEgyptPost) {
      const postOption = (window._shippingOptions || []).find(o => 
        o.name.includes('البريد') || o.name.toLowerCase().includes('post')
      ) || (window._shippingOptions || [])[0];
      
      const cityObj = postOption ? (postOption.cities || []).find(c => 
        isCityEqual(c.city, cityName) || 
        isCityEqual(c.city, govData.city) || 
        isCityEqual(c.city, govData.cityOtherName)
      ) : null;
      shippingFee = cityObj ? cityObj.fee : (postOption ? postOption.cost : 80);
    } else {
      const bostaOption = (window._shippingOptions || []).find(o => 
        o.name.includes('بوسطة') || o.name.toLowerCase().includes('bosta')
      ) || (window._shippingOptions || [])[1] || (window._shippingOptions || [])[0];
      
      const cityObj = bostaOption ? (bostaOption.cities || []).find(c => 
        isCityEqual(c.city, cityName) || 
        isCityEqual(c.city, govData.city) || 
        isCityEqual(c.city, govData.cityOtherName)
      ) : null;
      shippingFee = cityObj ? cityObj.fee : (bostaOption ? bostaOption.cost : 150);
    }
  } else {
    shippingFee = 0;
  }

  // Update Shipping Notice under the zone dropdown
  updateShippingMethodNotice(isEgyptPost);

  const total = subtotal + shippingFee;
  window._currentShippingFee = shippingFee;

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
  const shipLabelEl = document.getElementById('summary-shipping-label');
  if (shipEl) {
    if (cityId) {
      shipEl.textContent = formatPrice(shippingFee);
      if (shipLabelEl) {
        if (isEgyptPost) {
          shipLabelEl.innerHTML = `الشحن <span style="color:#b84a20; font-size:0.85rem; font-weight:bold;">(البريد المصري)</span>`;
        } else {
          shipLabelEl.innerHTML = `الشحن <span style="color:#00bfa5; font-size:0.85rem; font-weight:bold;">(بوسطة)</span>`;
        }
      }
    } else {
      shipEl.textContent = '—';
      if (shipLabelEl) {
        shipLabelEl.textContent = 'الشحن';
      }
    }
  }
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
  const form = document.getElementById('checkout-form');
  const nameInput = document.getElementById('cust-name');
  const phoneInput = document.getElementById('cust-phone');
  const phone2Input = document.getElementById('cust-phone2');
  const addressInput = document.getElementById('cust-address');
  const govSearchInput = document.getElementById('government-search');
  const govHiddenInput = document.getElementById('government');
  const zoneInput = document.getElementById('zone');

  // Helper to show/hide errors
  function setError(input, msg) {
    const group = input.closest('.form-group');
    if (!group) return;

    let errEl = group.querySelector('.error-message');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'error-message';
      group.appendChild(errEl);
    }
    
    if (msg) {
      input.classList.add('invalid');
      errEl.textContent = msg;
      errEl.style.display = 'block';
    } else {
      input.classList.remove('invalid');
      errEl.style.display = 'none';
    }
  }
  window.setErrorOnCheckout = setError;

  // Real-time validation listeners
  nameInput.addEventListener('input', () => {
    const val = nameInput.value.trim();
    if (!val) { setError(nameInput, 'أدخل اسمك كاملاً'); return; }
    if (!/^[\u0600-\u06FF\s]+$/.test(val)) { setError(nameInput, 'يرجى إدخال الاسم باللغة العربية فقط'); return; }
    if (val.split(/\s+/).filter(Boolean).length < 2) { setError(nameInput, 'أدخل اسمك كاملاً'); return; }
    setError(nameInput, null);
  });

  phoneInput.addEventListener('input', () => {
    const val = phoneInput.value.trim();
    if (!val) { setError(phoneInput, 'رقم الهاتف مطلوب'); return; }
    if (!/^[0-9]+$/.test(val)) { setError(phoneInput, 'يرجى إدخال الأرقام بالإنجليزية فقط'); return; }
    if (!/^01[0-9]{9}$/.test(val)) { setError(phoneInput, 'يجب أن يكون 11 رقم ويبدأ بـ 01'); return; }
    setError(phoneInput, null);
  });

  addressInput.addEventListener('input', () => {
    const val = addressInput.value.trim();
    if (!val) { setError(addressInput, 'العنوان مطلوب بالتفصيل'); return; }
    if (val.split(/\s+/).filter(Boolean).length < 2) { setError(addressInput, 'يرجى إدخال العنوان بالتفصيل'); return; }
    setError(addressInput, null);
  });

  govSearchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!govHiddenInput.value) setError(govSearchInput, 'من فضلك اختر من القائمه');
      else setError(govSearchInput, null);
    }, 200);
  });

  zoneInput.addEventListener('blur', () => {
    setTimeout(() => {
      const zoneGroup = document.getElementById('zone-form-group');
      if (zoneGroup && zoneGroup.style.display !== 'none') {
        const zoneOptions = (window._currentZones || []).map(z => api.formatZoneName(z));
        if (!zoneInput.value || !zoneOptions.includes(zoneInput.value)) {
          setError(zoneInput, 'من فضلك اختر من القائمه');
        } else {
          setError(zoneInput, null);
        }
      }
    }, 200);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Final check for all fields
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const phone2 = phone2Input.value.trim();
    const address = addressInput.value.trim();
    const cityId = govHiddenInput.value;
    const zone = zoneInput.value;
    const payment = document.querySelector('input[name="payment"]:checked');

    // Re-validate everything
    let hasError = false;
    if (name.split(/\s+/).filter(Boolean).length < 2 || !/^[\u0600-\u06FF\s]+$/.test(name)) { setError(nameInput, 'أدخل اسمك كاملاً'); hasError = true; }
    if (!/^01[0-9]{9}$/.test(phone)) { setError(phoneInput, 'يجب أن يكون 11 رقم ويبدأ بـ 01'); hasError = true; }
    if (address.split(/\s+/).filter(Boolean).length < 2) { setError(addressInput, 'يرجى إدخال العنوان بالتفصيل'); hasError = true; }
    if (!cityId) { setError(govSearchInput, 'من فضلك اختر من القائمه'); hasError = true; }
    
    const zoneGroup = document.getElementById('zone-form-group');
    if (zoneGroup && zoneGroup.style.display !== 'none') {
        const zoneOptions = (window._currentZones || []).map(z => api.formatZoneName(z));
        if (!zone || !zoneOptions.includes(zone)) {
          setError(zoneInput, 'من فضلك اختر من القائمه');
          hasError = true;
        }
    }

    if (hasError) {
      const firstError = document.querySelector('.error-message[style*="display: block"]');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!payment) { showToast('اختر طريقة الدفع', 'error'); return; }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'جاري تنفيذ طلبك...';

    const govData = (window._fullShippingData || []).find(s => s._id === cityId);
    const cityName = govData ? (govData.cityOtherName || govData.city) : '';

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
        name,
        phone,
        secondPhone: phone2,
        address,
        government: cityName,
        zone: zone,
        notes: document.getElementById('cust-notes').value.trim()
      },
      items,
      paymentMethod: payment.value,
      carrier: window._selectedCarrier || 'bosta',
      shippingFee: window._currentShippingFee !== undefined ? window._currentShippingFee : 0
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
