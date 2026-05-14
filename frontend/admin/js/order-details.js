/** Admin — Order Details JS */

let currentOrder = null;
let originalOrder = null;
let allProducts = [];
let collectionsMap = {};
let shippingMap = {};

function getProductCombinations(options) {
  if (!options || options.length === 0) return [];
  let results = [[]];
  for (const group of options) {
    const currentResults = [];
    const values = group.values;
    for (const res of results) {
      for (const val of values) {
        currentResults.push([...res, { groupName: group.name, label: val.label, price: val.price }]);
      }
    }
    results = currentResults;
  }
  return results;
}

window.toggleProductVariants = function (pid) {
  const el = document.getElementById(`variants-${pid}`);
  const icon = document.getElementById(`icon-${pid}`);
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    icon.style.transform = 'rotate(180deg)';
  } else {
    el.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAdmin()) return;

  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('id');
  if (!orderId) {
    window.location.href = 'orders';
    return;
  }

  document.body.classList.add('is-loading');

  try {
    const [order, shipping, settings] = await Promise.all([
      api.getOrder(orderId),
      api.getShippingList().catch(() => []),
      api.getSetting('sundura_global_settings').catch(() => ({}))
    ]);

    currentOrder = order;
    originalOrder = JSON.parse(JSON.stringify(order));
    window._fullShippingData = shipping;

    const searchInput = document.getElementById('modal-c-gov-search');
    const dropdown = document.getElementById('modal-c-gov-dropdown');
    const hiddenInput = document.getElementById('modal-c-gov');

    if (searchInput && dropdown) {
      searchInput.addEventListener('focus', () => renderModalGovDropdown());
      searchInput.addEventListener('input', () => renderModalGovDropdown());
      
      document.addEventListener('click', (e) => {
        if (!document.getElementById('modal-c-gov-search-container').contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });

      window.renderModalGovDropdown = function() {
        const query = searchInput.value.toLowerCase().trim();
        const filtered = (window._fullShippingData || []).filter(s => 
          s.city.toLowerCase().includes(query) || (s.cityOtherName && s.cityOtherName.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
          dropdown.innerHTML = '<div style="padding: 10px; color: #94a3b8; text-align: center;">لا توجد نتائج</div>';
        } else {
          dropdown.innerHTML = filtered.map(s => `
            <div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; text-align:right;" 
                 onclick="selectModalGov('${s._id}', '${s.cityOtherName || s.city}')">
              ${s.cityOtherName || s.city} (${formatPrice(s.fee)})
            </div>
          `).join('');
        }
        dropdown.style.display = 'block';
      }

      window.selectModalGov = (id, name) => {
        hiddenInput.value = id;
        searchInput.value = name;
        dropdown.style.display = 'none';
        handleModalCityChange();
      };
    }

    // Populate Payment Methods select
    const paymentSelect = document.getElementById('modal-payment-method');
    if (paymentSelect && settings.paymentMethods) {
      paymentSelect.innerHTML = settings.paymentMethods.map(m => `
        <option value="${m.label}">${m.label} (${m.number})</option>
      `).join('');
    }


    renderOrder();
    document.body.classList.remove('is-loading');
  } catch (err) {
    showToast('فشل تحميل بيانات الطلب', 'error');
    document.body.classList.remove('is-loading');
  }

  // Action: Download Invoice as Image (High Quality SnapRender)
  window.printOrderInvoice = async function printOrderInvoice() {
    const adminKey = localStorage.getItem('adminKey') || '';
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id') || (currentOrder ? currentOrder.orderId : null);
    if (!orderId) return;
    
    showToast('جاري تجهيز الفاتورة...', 'info');

    try {
        const baseUrl = window.API_BASE || (typeof API_BASE !== 'undefined' ? API_BASE : '');
        const url = `${baseUrl}/orders/${orderId}/download-image?adminKey=${adminKey}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Failed to generate invoice image');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `invoice-${orderId}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
        showToast('تم بدء التحميل');
    } catch (err) {
        console.error('Invoice Download Error:', err);
        showToast('حدث خطأ أثناء تحميل الفاتورة: ' + err.message, 'error');
    }
}

  // Global Discard Handler
  window.handleGlobalDiscard = () => {
    if (!originalOrder) return;
    currentOrder = JSON.parse(JSON.stringify(originalOrder));
    renderOrder();
    if (window.hideBar) window.hideBar();
  };

  // Global Save Handler
  window.handleGlobalSave = async () => {
    const success = await saveOrderChanges();
    if (success !== false) {
      originalOrder = JSON.parse(JSON.stringify(currentOrder));
      // Give time for toast, then reload for a clean state
      setTimeout(() => window.location.reload(), 800);
    }
    return success;
  };
});


// ── Rendering ──────────────────────────────────────────
function renderOrder() {
  if (!currentOrder) return;

  const o = currentOrder;
  document.getElementById('page-order-id').textContent = `تعديل الطلب #${o.orderId}`;

  if (o.status === 'cancelled') {
    document.getElementById('cancel-order-btn')?.style.display === 'none';
    document.getElementById('page-order-id').innerHTML += ' <span class="badge badge-danger">ملغي</span>';
  }

  // Ready button visibility: only show if pending
  const readyBtnContainer = document.getElementById('ready-btn-container');
  if (readyBtnContainer) {
    readyBtnContainer.style.display = o.status === 'pending' ? 'block' : 'none';
  }
  if (o.status === 'ready') {
    document.getElementById('page-order-id').innerHTML += ' <span class="badge badge-success" style="background:#0f766e; color:#fff; padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; margin-right:8px;">جاهز</span>';
  }

  // Customer Info Consolidated
  document.getElementById('view-c-name').textContent = o.customer.name || '—';
  document.getElementById('view-c-phone').textContent = o.customer.phone || '—';

  const phone2El = document.getElementById('view-c-phone2');
  if (o.customer.secondPhone) {
    phone2El.textContent = o.customer.secondPhone;
    phone2El.style.display = 'block';
  } else {
    phone2El.style.display = 'none';
  }

  // Shipping Info
  document.getElementById('view-c-address').textContent = o.customer.address || 'لا يوجد عنوان';
  document.getElementById('view-c-gov').textContent = o.customer.government || 'لا يوجد محافظة';
  document.getElementById('view-c-zone').textContent = o.customer.zone || 'لا توجد منطقة';

  const notesEl = document.getElementById('view-c-notes');
  const notesContainer = document.getElementById('view-c-notes-container');
  if (o.customer.notes) {
    notesEl.textContent = o.customer.notes;
    notesContainer.style.display = 'block';
  } else {
    notesContainer.style.display = 'none';
  }

  // Payment
  const paymentLabels = {
    'vodafone_cash': 'فودافون كاش',
    'instapay': 'إنستاباي'
  };
  document.getElementById('view-payment-method').textContent = paymentLabels[o.paymentMethod] || o.paymentMethod;
  document.getElementById('view-paid-amount').textContent = formatPrice(o.paidAmount || 0);

  renderItems();
  updateTotals();
}

function getAvailableQty(p, selectedOptions = []) {
  if (selectedOptions.length > 0 && p.variants && p.variants.length > 0) {
    const v = p.variants.find(v => {
      return selectedOptions.every(so => v.combination[so.groupName] === so.label);
    });
    return (v && v.quantity !== null && v.quantity !== undefined) ? v.quantity : Infinity;
  }
  return (p.quantity !== null && p.quantity !== undefined) ? p.quantity : Infinity;
}

function renderItems() {
  const container = document.getElementById('order-items-container');
  if (!currentOrder.items || currentOrder.items.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">لا توجد منتجات في هذا الطلب</div>';
    return;
  }

  container.innerHTML = currentOrder.items.map((item, idx) => {
    const p = allProducts.find(x => x._id === item.productId) || {};
    const available = getAvailableQty(p, item.selectedOptions);
    const lowStock = available !== Infinity && item.quantity > available;

    const imgHtml = item.imageUrl

      ? `<img src="${item.imageUrl}" style="width:52px; height:52px; border-radius:8px; object-fit:contain; border:1px solid #f1f5f9;" alt="${item.name}">`
      : `<div style="width:52px; height:52px; border-radius:8px; background:#f8fafc; display:flex; align-items:center; justify-content:center; color:#94a3b8; border:1px solid #f1f5f9;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;

    const optText = (item.selectedOptions || []).map(op => op.label).join(' / ');
    return `
      <div style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #fff; display: flex; flex-direction: column; gap: 14px;">
        <!-- Top Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 52px;">
          <!-- Right side: Image + Name -->
          <div style="display: flex; align-items: center; gap: 12px; flex: 1.5;">
            ${imgHtml}
            <div style="text-align: right; display: flex; flex-direction: column; justify-content: center;">
              <div style="font-weight: 700; font-size: 0.95rem; color: #1e293b; line-height: 1.2;">${item.name}</div>
              ${optText ? `<div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">${optText}</div>` : ''}
              ${item.discount ? `<div style="font-size:0.75rem; color:#dc2626; margin-top:4px; font-weight:600;">خصم: ${formatPrice(item.discount)}</div>` : ''}
              ${lowStock ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:4px; font-weight:600; background:#fee2e2; padding:2px 8px; border-radius:4px; display:inline-block;">عذراً، يتوفر ${available} قطعة فقط</div>` : ''}
            </div>

          </div>
          
          <!-- Left side: Unit Price Block and Total Price -->
          <div style="display: flex; align-items: center; gap: 16px; flex: 1; justify-content: space-between;">
            <div style="font-size: 0.85rem; color: #64748b; white-space: nowrap; font-weight: 500; text-align: center; flex: 1;" dir="ltr">${formatPrice(item.basePrice)}x${item.quantity} </div>
            <div style="font-weight: 700; font-size: 1rem; color: #1e293b; min-width: 80px; text-align: left; flex: 1;">${formatPrice(item.finalPrice)}</div>
          </div>
        </div>

        <!-- Bottom Row -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="btn btn-sm" onclick="openItemDiscountModal(${idx})" style="background: #fff; border: 1px solid #e2e8f0; color: #475569; display: flex; align-items: center; gap: 6px; font-size: 0.8rem; padding: 6px 14px; border-radius: 8px; height: 36px; font-weight: 600;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><line x1="16" y1="8" x2="8" y2="16"/></svg>
              تطبيق خصم
            </button>
            
            <div style="display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #fff; height: 36px; min-width: 110px;">
              <button onclick="updateItemQty(${idx}, ${item.quantity + 1})" style="flex: 1; height: 100%; border: none; background: transparent; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;">+</button>
              <div style="width: 40px; text-align: center; font-weight: 700; font-size: 0.95rem; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; height: 100%; line-height: 36px;">${item.quantity}</div>
              <button onclick="${item.quantity > 1 ? `updateItemQty(${idx}, ${item.quantity - 1})` : ''}" style="flex: 1; height: 100%; border: none; background: ${item.quantity > 1 ? 'transparent' : '#f8fafc'}; cursor: ${item.quantity > 1 ? 'pointer' : 'not-allowed'}; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; color: ${item.quantity > 1 ? 'inherit' : '#cbd5e1'};" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
            </div>
          </div>

          <button onclick="removeItem(${idx})" style="background: #fff; border: 1px solid #f1f5f9; color: #ef4444; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; padding: 6px 14px; border-radius: 8px; height: 36px; cursor: pointer; font-weight: 500;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            إزالة
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updateTotals() {
  const o = currentOrder;
  let subtotal = 0;

  o.items.forEach(item => {
    // Standardized Absolute Pricing Model: basePrice is the unit price
    item.finalPrice = Math.max(0, (item.basePrice * item.quantity) - (item.discount || 0));
    subtotal += item.finalPrice;
  });

  o.totalPrice = Math.max(0, subtotal + (o.shippingFee || 0) - (o.discount || 0));

  document.getElementById('sum-subtotal').textContent = formatPrice(subtotal);
  document.getElementById('sum-items-count').textContent = o.items.reduce((s, i) => s + i.quantity, 0);
  document.getElementById('sum-shipping').textContent = formatPrice(o.shippingFee);

  const discRow = document.getElementById('sum-discount-row');
  if (o.discount !== 0 && o.discount !== undefined && o.discount !== null) {
    discRow.style.display = 'flex';
    document.getElementById('sum-discount').textContent = formatPrice(Math.abs(o.discount));
    const label = document.getElementById('sum-discount-label');
    if (label) {
      label.textContent = o.discount > 0 ? 'خصم الطلب' : 'إضافة للطلب';
      label.style.color = o.discount > 0 ? 'var(--danger)' : 'var(--primary)';
    }
  } else {
    discRow.style.display = 'none';
  }

  document.getElementById('sum-total').textContent = formatPrice(o.totalPrice);
  updatePaymentStatusUI();
}

function updatePaymentStatusUI() {
  const o = currentOrder;
  const remaining = Math.max(0, o.totalPrice - (o.paidAmount || 0));
  document.getElementById('sum-remaining').textContent = formatPrice(remaining);

  const btn = document.getElementById('btn-mark-paid');
  const badge = document.getElementById('view-payment-status');

  if (remaining === 0 && o.totalPrice > 0) {
    btn.style.display = 'none';
    badge.textContent = 'مدفوع';
    badge.style.background = '#dcfce7';
    badge.style.color = '#166534';
  } else if (o.paidAmount > 0) {
    btn.style.display = 'inline-block';
    badge.textContent = 'مدفوع جزئياً';
    badge.style.background = '#fef3c7';
    badge.style.color = '#92400e';
  } else {
    btn.style.display = 'inline-block';
    badge.textContent = 'غير مدفوع';
    badge.style.background = '#fee2e2';
    badge.style.color = '#991b1b';
  }
}

// ── Modals & Editing ───────────────────────────────────

window.openModal = function (modalId) {
  document.getElementById(modalId).style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

window.closeModal = function (modalId) {
  document.getElementById(modalId).style.display = 'none';
  // Only restore scroll if no other modals are open
  const openModals = document.querySelectorAll('.modal-overlay[style*="display: flex"]');
  if (openModals.length === 0) {
    document.body.style.overflow = '';
  }
};

window.openCustomerModal = function () {
  document.getElementById('modal-c-name').value = currentOrder.customer.name || '';
  document.getElementById('modal-c-phone').value = currentOrder.customer.phone || '';
  document.getElementById('modal-c-phone2').value = currentOrder.customer.secondPhone || '';
  
  const govName = currentOrder.customer.government || '';
  const govData = (window._fullShippingData || []).find(s => s.city === govName || s.cityOtherName === govName);
  
  const hiddenGov = document.getElementById('modal-c-gov');
  const searchGov = document.getElementById('modal-c-gov-search');
  
  if (govData) {
    hiddenGov.value = govData._id;
    searchGov.value = govData.cityOtherName || govData.city;
  } else {
    hiddenGov.value = '';
    searchGov.value = govName;
  }

  document.getElementById('modal-c-zone').value = currentOrder.customer.zone || '';
  document.getElementById('modal-c-address').value = currentOrder.customer.address || '';
  document.getElementById('modal-c-notes').value = currentOrder.customer.notes || '';
  openModal('customer-modal');
};

window.handleModalCityChange = async function (skipZoneClear = false) {
  const cityId = document.getElementById('modal-c-gov').value;
  const zoneInput = document.getElementById('modal-c-zone');
  if (!zoneInput) return;

  if (!skipZoneClear) {
    zoneInput.value = ''; // Clear current selection
  }
  window._modalZones = [];

  if (cityId) {
    try {
      const zones = await api.getZones(cityId);
      window._modalZones = zones || [];
    } catch (err) {
      console.error('Failed to fetch modal zones:', err);
      window._modalZones = [];
    }
  }
  
  renderModalZoneDropdown();
};

window.renderModalZoneDropdown = function () {
  const dropdown = document.getElementById('modal-c-zone-dropdown');
  const query = document.getElementById('modal-c-zone').value.toLowerCase().trim();
  
  if (!window._modalZones || window._modalZones.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  const isExactMatch = window._modalZones.some(z => {
    const label = `${z.otherName || z.name}${z.districtOtherName ? ` - ${z.districtOtherName}` : ''}`;
    return label.toLowerCase() === query;
  });

  const filtered = isExactMatch ? window._modalZones : window._modalZones.filter(z => 
    z.name.toLowerCase().includes(query) || (z.otherName && z.otherName.toLowerCase().includes(query))
  );

  dropdown.style.display = 'block';
  if (filtered.length === 0) {
    dropdown.innerHTML = '<div style="padding: 10px; color: #94a3b8; text-align: center;">لا توجد مناطق مطابقة</div>';
  } else {
    dropdown.innerHTML = filtered.map(z => {
      const zoneLabel = `${z.otherName || z.name}${z.districtOtherName ? ` - ${z.districtOtherName}` : ''}`;
      return `
        <div class="dropdown-item" onclick="selectModalZone('${zoneLabel.replace(/'/g, "\\'")}')" 
          style="padding: 10px 16px; cursor: pointer; transition: background 0.2s;"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          ${zoneLabel}
        </div>
      `;
    }).join('');
  }
}

window.selectModalZone = function(val) {
  const zoneInput = document.getElementById('modal-c-zone');
  zoneInput.value = val;
  document.getElementById('modal-c-zone-dropdown').style.display = 'none';
};

document.addEventListener('click', (e) => {
  const container = document.getElementById('modal-c-zone-search-container');
  const dropdown = document.getElementById('modal-c-zone-dropdown');
  if (container && !container.contains(e.target)) {
    dropdown.style.display = 'none';
  }

  const govContainer = document.getElementById('modal-c-gov-search-container');
  const govDropdown = document.getElementById('modal-c-gov-dropdown');
  if (govContainer && !govContainer.contains(e.target)) {
    govDropdown.style.display = 'none';
  }
});

window.applyCustomerChanges = async function () {
  const name = document.getElementById('modal-c-name').value.trim();
  const phone = document.getElementById('modal-c-phone').value.trim();
  const cityId = document.getElementById('modal-c-gov').value;
  const cityNameFromSearch = document.getElementById('modal-c-gov-search').value.trim();
  const zone = document.getElementById('modal-c-zone').value;

  let govData = (window._fullShippingData || []).find(s => s._id === cityId);
  const cityName = govData ? (govData.cityOtherName || govData.city) : cityNameFromSearch;

  if (!name || !phone || !cityName || !zone) {
    showToast('الاسم ورقم الهاتف والمدينة والمنطقة مطلوبة', 'error');
    return;
  }

  // Arabic-only name validation
  if (!/^[\u0600-\u06FF\s]+$/.test(name)) {
    showToast('يرجى إدخال اسم العميل باللغة العربية فقط', 'error');
    return;
  }

  // English-only phone validation (digits)
  const phone2 = document.getElementById('modal-c-phone2').value.trim();
  if (!/^[0-9+]+$/.test(phone) || (phone2 && !/^[0-9+]+$/.test(phone2))) {
    showToast('يرجى إدخال رقم الهاتف بالأرقام الإنجليزية فقط', 'error');
    return;
  }

  if (!/^01[0-9]{9}$/.test(phone)) {
    showToast('رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01', 'error');
    return;
  }

  currentOrder.customer.name = name;
  currentOrder.customer.phone = phone;
  currentOrder.customer.secondPhone = document.getElementById('modal-c-phone2').value.trim();
  currentOrder.customer.government = cityName;
  currentOrder.customer.zone = zone;
  
  // Update shipping fee based on city automatically (Ensure it is a number)
  const newFee = govData ? parseFloat(govData.fee) : 0;
  currentOrder.shippingFee = isNaN(newFee) ? 0 : newFee;

  currentOrder.customer.address = document.getElementById('modal-c-address').value.trim();
  currentOrder.customer.notes = document.getElementById('modal-c-notes').value.trim();

  renderOrder();
  updateTotals();
  closeModal('customer-modal');

  // Trigger unsaved changes bar
  if (window.markAsModified) window.markAsModified();
};

window.openPaymentModal = function () {
  document.getElementById('modal-payment-method').value = currentOrder.paymentMethod || 'vodafone_cash';
  document.getElementById('modal-paid-amount').value = currentOrder.paidAmount || '';

  openModal('payment-modal');
};

window.applyPaymentChanges = async function () {
  currentOrder.paymentMethod = document.getElementById('modal-payment-method').value;
  currentOrder.paidAmount = parseFloat(document.getElementById('modal-paid-amount').value) || 0;

  renderOrder();
  closeModal('payment-modal');

  // Save immediately as requested
  await saveOrderChanges(true);
  
  if (window.hideBar) window.hideBar();
};

window.resendPaymentConfirmationDirect = async function() {
  if (!currentOrder || (currentOrder.paidAmount || 0) <= 0) {
    showToast('يجب أن يكون المبلغ المدفوع أكبر من 0 لإرسال التأكيد', 'error');
    return;
  }
  
  const confirmed = await window.showConfirmModal('إرسال تأكيد', 'هل تريد إرسال تأكيد الدفع والفاتورة للعميل الآن؟');
  if (!confirmed) return;

  currentOrder.forcePaymentWebhook = true;
  
  showToast('جاري إرسال التأكيد...', 'info');
  await saveOrderChanges(true); // Save with trigger
}

// ── Actions ────────────────────────────────────────────

// ── Drag-and-Drop Reorder ──────────────────────────────
let dragIdx = null;

window.onDragStart = function (e) {
  dragIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
};

window.onDragOver = function (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.currentTarget;
  card.style.borderTop = '3px solid var(--primary)';
};

window.onDrop = function (e) {
  e.preventDefault();
  const dropIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.style.borderTop = '';
  if (dragIdx !== null && dragIdx !== dropIdx) {
    const items = currentOrder.items;
    const [moved] = items.splice(dragIdx, 1);
    items.splice(dropIdx, 0, moved);
    renderItems();
    updateTotals();
    if (window.markAsModified) window.markAsModified();
  }
};

window.onDragEnd = function (e) {
  e.currentTarget.style.opacity = '1';
  // Clean up all border highlights
  document.querySelectorAll('.product-card-item').forEach(el => {
    el.style.borderTop = '';
  });
  dragIdx = null;
};

window.moveItem = function (idx, direction) {
  const items = currentOrder.items;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= items.length) return;
  [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
  renderItems();
  updateTotals();
  if (window.markAsModified) window.markAsModified();
};

window.updateItemQty = function (idx, val) {
  const qty = parseInt(val, 10);
  if (qty >= 1) {
    currentOrder.items[idx].quantity = qty;
    updateTotals();
    renderItems();
    if (window.markAsModified) window.markAsModified();
  }
};

window.promptItemQty = function (idx) {
  const item = currentOrder.items[idx];
  document.getElementById('modal-qty-idx').value = idx;
  document.getElementById('modal-item-qty').value = item.quantity;
  openModal('item-qty-modal');
};

window.applyItemQty = function () {
  const idx = parseInt(document.getElementById('modal-qty-idx').value, 10);
  const qty = parseInt(document.getElementById('modal-item-qty').value, 10);
  if (qty >= 1 && currentOrder.items[idx]) {
    currentOrder.items[idx].quantity = qty;
    updateTotals();
    renderItems();
    if (window.markAsModified) window.markAsModified();
  }
  closeModal('item-qty-modal');
  
  // Refresh ready modal if open
  if (document.getElementById('ready-confirm-modal').style.display === 'flex') {
    markAsReady();
  }
};

window.openItemDiscountModal = function (idx) {
  const item = currentOrder.items[idx];
  document.getElementById('modal-item-idx').value = idx;
  document.getElementById('modal-item-discount').value = item.discount || '';
  openModal('item-discount-modal');
};

window.removeItem = function (idx) {
  const item = currentOrder.items[idx];
  if (!item) return;

  document.getElementById('modal-delete-idx').value = idx;
  const previewEl = document.getElementById('delete-item-preview');
  const imgHtml = item.imageUrl
    ? `<div style="position:relative"><img src="${item.imageUrl}" style="width:80px;height:80px;border-radius:8px;object-fit:contain;"><span style="position:absolute;bottom:-5px;left:-5px;background:#64748b;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;border:2px solid #fff;">${item.quantity}</span></div>`
    : `<div style="width:80px;height:80px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;

  previewEl.innerHTML = `
    <div style="font-weight:600; color:#1e293b; font-size:1rem; text-align:right; flex:1; margin-right:16px;">${item.name}</div>
    ${imgHtml}
  `;

  openModal('delete-confirm-modal');
};

window.confirmRemoveItem = function () {
  const idx = parseInt(document.getElementById('modal-delete-idx').value);
  if (!isNaN(idx)) {
    currentOrder.items.splice(idx, 1);
    closeModal('delete-confirm-modal');
    updateTotals();
    renderItems();
    if (window.markAsModified) window.markAsModified();
  }
};

window.promptOrderDiscount = function () {
  openModal('order-discount-modal');
  document.getElementById('modal-order-discount').value = currentOrder.discount || '';
};

window.openOrderDiscountModal = function () {
  openModal('order-discount-modal');
  document.getElementById('modal-order-discount').value = currentOrder.discount || '';
};

window.applyOrderDiscount = async function () {
  const val = document.getElementById('modal-order-discount').value;
  currentOrder.discount = parseFloat(val) || 0;
  closeModal('order-discount-modal');
  updateTotals();

  // Trigger unsaved changes bar
  if (window.markAsModified) window.markAsModified();

  // Refresh ready modal if open
  if (document.getElementById('ready-confirm-modal').style.display === 'flex') {
    markAsReady();
  }
};

window.openItemDiscountModal = function (idx) {
  const item = currentOrder.items[idx];
  document.getElementById('modal-item-idx').value = idx;
  document.getElementById('modal-item-discount').value = item.discount || '';
  openModal('item-discount-modal');
};

window.applyItemDiscount = async function () {
  const idx = parseInt(document.getElementById('modal-item-idx').value);
  const val = document.getElementById('modal-item-discount').value;
  const item = currentOrder.items[idx];
  if (item) {
    item.discount = parseFloat(val) || 0;
    closeModal('item-discount-modal');
    updateTotals();
    renderItems();

    // Trigger unsaved changes bar
    if (window.markAsModified) window.markAsModified();

    // Refresh ready modal if open
    if (document.getElementById('ready-confirm-modal').style.display === 'flex') {
      markAsReady();
    }
  }
};

window.markFullyPaid = async function () {
  currentOrder.paidAmount = currentOrder.totalPrice;
  currentOrder.paid = true;
  currentOrder.forcePaymentWebhook = true;
  
  // Instant UI update
  renderOrder();
  
  showToast('جارٍ تحديث حالة الدفع وحفظ الطلب...', 'info');
  
  // Save immediately
  await saveOrderChanges(true);
};

// ── Save ───────────────────────────────────────────────

window.saveOrderChanges = async function (silent = false) {
  const btn = document.getElementById('save-all-btn');
  const originalText = btn ? btn.textContent : '';

  if (!silent && btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;display:inline-block;vertical-align:middle;"></span> جارٍ الحفظ...';
  }

  // Zone validation
  if (currentOrder.customer.zone) {
    const zoneOptions = (window._modalZones || []).map(z => z.otherName || z.name);
    if (zoneOptions.length > 0 && !zoneOptions.includes(currentOrder.customer.zone)) {
      showToast('يرجى اختيار منطقة صحيحة من القائمة', 'error');
      if (!silent && btn) { 
        btn.disabled = false; 
        btn.textContent = 'حفظ التغييرات'; 
      }
      return false;
    }
  }

  try {
      const updates = {
        items: currentOrder.items.map(item => ({
          ...item,
          selectedOptions: (item.selectedOptions || []).map(opt => ({
            groupName: opt.groupName,
            label: opt.label
          }))
        })),
        discount: currentOrder.discount,
        shippingFee: currentOrder.shippingFee,
        totalPrice: currentOrder.totalPrice,
        paymentMethod: currentOrder.paymentMethod,
        paidAmount: currentOrder.paidAmount,
        paid: currentOrder.paidAmount >= currentOrder.totalPrice,
        customer: currentOrder.customer,
        forcePaymentWebhook: currentOrder.forcePaymentWebhook
      };

    await api.updateOrder(currentOrder.orderId, updates);
    currentOrder.forcePaymentWebhook = false; // Reset the flag

    if (!silent) {
      showToast('تم حفظ التغييرات بنجاح <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'حفظ التغييرات';
      }
    } else {
      // For silent saves (like immediate payment updates), we can show a brief success if not handled by caller
      // showToast('تم تحديث البيانات', 'success');
    }

    // Update baseline for discard
    originalOrder = JSON.parse(JSON.stringify(currentOrder));
    renderOrder();
    return true;
  } catch (err) {
    showToast(err.message || 'فشل الحفظ', 'error');
    return false;
  } finally {
    if (!silent && btn) {
      btn.disabled = false;
      btn.textContent = originalText || 'حفظ التغييرات';
    }
  }
};

window.cancelOrder = async function () {
  const confirmed = await window.showConfirmModal('تأكيد الإلغاء', 'هل أنت متأكد من إلغاء هذا الطلب؟ سيتم إرسال إشعار بذلك وتصفير القيم.');
  if (!confirmed) return;

  try {
    const btn = document.getElementById('cancel-order-btn');
    btn.disabled = true;
    btn.textContent = 'جارٍ الإلغاء...';

    await api.cancelOrder(currentOrder.orderId);
    showToast('تم إلغاء الطلب بنجاح');
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    showToast(err.message || 'فشل الإلغاء', 'error');
    document.getElementById('cancel-order-btn').disabled = false;
    document.getElementById('cancel-order-btn').textContent = 'إلغاء الطلب';
  }
};

// ── Modal Products (Persistent Selection) ───────────────
let modalSelectedProducts = new Set(); // Stores product IDs
let modalSelectedVariants = new Map(); // Key: pid-comboStr, Value: {pid, combo, price}

window.openProductsModal = async function () {
  modalSelectedProducts.clear();
  modalSelectedVariants.clear();
  openModal('products-modal');
  if (Object.keys(collectionsMap).length === 0) {
    try {
      const cols = await api.getCollections();
      const sel = document.getElementById('modal-col-filter');
      cols.forEach(c => {
        collectionsMap[c._id] = c.name;
        sel.add(new Option(c.name, c._id));
      });
    } catch (e) { }
  }
  
  if (allProducts.length === 0) {
    const listEl = document.getElementById('modal-products-list');
    listEl.innerHTML = '<div style="padding:20px; text-align:center;">جاري تحميل المنتجات...</div>';
    try {
      // Use caching for modal products to load faster
      allProducts = await api.getProducts(1, 1000, true, '', '', '', true);
    } catch (err) {
      console.error('Failed to load products for modal', err);
    }
  }
  renderModalProducts();
};

window.closeProductsModal = function () {
  closeModal('products-modal');
};

window.handleModalSelect = function(pid, checked) {
  if (checked) modalSelectedProducts.add(pid);
  else modalSelectedProducts.delete(pid);
};

window.handleModalVariantSelect = function(pid, comboStr, price, checked) {
  const key = `${pid}-${comboStr}`;
  if (checked) {
    modalSelectedVariants.set(key, { pid, combo: JSON.parse(decodeURIComponent(comboStr)), price });
  } else {
    modalSelectedVariants.delete(key);
  }
};

window.renderModalProducts = function () {
  const q = document.getElementById('modal-search').value.toLowerCase().trim();
  const col = document.getElementById('modal-col-filter').value;
  const listEl = document.getElementById('modal-products-list');

  let filtered = allProducts;
  if (q) filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
  if (col) filtered = filtered.filter(p => p.collectionId === col);

  listEl.innerHTML = filtered.map(p => {
    const isChecked = modalSelectedProducts.has(p._id);
    const imgHtml = p.imageUrl ? `<img src="${p.imageUrl}" class="pli-img">` : `<div class="pli-img"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;
    const hasOptions = p.options && p.options.length > 0;
    const effectiveBase = (p.salePrice && p.salePrice < p.basePrice) ? p.salePrice : p.basePrice;

    if (!hasOptions) {
      return `
        <div style="width: 100%; display: block;">
          <label class="product-list-item" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color); width: 100%; box-sizing: border-box;">
            <div class="pli-info" style="display:flex; align-items:center; gap:20px;">
              ${imgHtml}
              <div>
                <div style="font-weight:600;font-size:0.875rem">${p.name}</div>
                <div style="font-size:0.85rem;color:var(--primary)">${formatPrice(effectiveBase)}</div>
              </div>
            </div>
            <input type="checkbox" class="pli-checkbox product-select-cb" value="${p._id}" 
              ${isChecked ? 'checked' : ''}
              onchange="handleModalSelect('${p._id}', this.checked)"
              style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer;">
          </label>
        </div>
      `;
    }

    let variantsHtml = '';
    const combinations = p.variants && p.variants.length > 0 ? [] : getProductCombinations(p.options);
    
    if (p.variants && p.variants.length > 0) {
      variantsHtml = p.variants.map((v, idx) => {
        const comboList = Object.entries(v.combination).map(([g, l]) => ({ groupName: g, label: l }));
        const title = comboList.map(c => c.label).join(' / ');
        const finalPrice = (v.salePrice !== null && v.salePrice !== undefined) ? v.salePrice : v.price;
        const comboStr = encodeURIComponent(JSON.stringify(comboList));
        const vKey = `${p._id}-${comboStr}`;
        return `
          <label class="product-variant-item" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color); background:#fafafa; cursor:pointer; padding-right:48px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="font-size:0.9rem;font-weight:500;">${title}</div>
              <div style="font-size:0.85rem;color:var(--primary)">${formatPrice(finalPrice)}</div>
            </div>
            <input type="checkbox" class="pli-checkbox product-variant-cb" 
              data-pid="${p._id}" data-combo="${comboStr}" data-price="${finalPrice}"
              ${modalSelectedVariants.has(vKey) ? 'checked' : ''}
              onchange="handleModalVariantSelect('${p._id}', '${comboStr}', ${finalPrice}, this.checked)">
          </label>
        `;
      }).join('');
    } else {
      variantsHtml = combinations.map((combo, idx) => {
        const title = combo.map(c => c.label).join(' / ');
        const optionsPriceTotal = combo.reduce((sum, c) => sum + (c.price || 0), 0);
        // Matching storefront logic: options prices REPLACE base price if no variants
        const finalPrice = optionsPriceTotal > 0 ? optionsPriceTotal : effectiveBase;
        const comboStr = encodeURIComponent(JSON.stringify(combo));
        const vKey = `${p._id}-${comboStr}`;
        return `
          <label class="product-variant-item" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color); background:#fafafa; cursor:pointer; padding-right:48px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="font-size:0.9rem;font-weight:500;">${title}</div>
              <div style="font-size:0.85rem;color:var(--primary)">${formatPrice(finalPrice)}</div>
            </div>
            <input type="checkbox" class="pli-checkbox product-variant-cb" 
              data-pid="${p._id}" data-combo="${comboStr}" data-price="${finalPrice}"
              ${modalSelectedVariants.has(vKey) ? 'checked' : ''}
              onchange="handleModalVariantSelect('${p._id}', '${comboStr}', ${finalPrice}, this.checked)">
          </label>
        `;
      }).join('');
    }

    return `
      <div>
        <div class="product-list-item" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color); cursor:pointer;" onclick="toggleProductVariants('${p._id}')">
          <div class="pli-info" style="display:flex; align-items:center; gap:12px;">
            ${imgHtml}
            <div style="font-weight:600;font-size:0.95rem">${p.name}</div>
          </div>
          <div id="icon-${p._id}" style="transition:transform 0.2s; color:var(--text-muted); display:flex; align-items:center; justify-content:center; width:32px; height:32px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>
        <div id="variants-${p._id}" style="display:none;">
          ${variantsHtml}
        </div>
      </div>
    `;
  }).join('');
};

window.addSelectedProducts = function () {
  // 1. Add simple products from persistent set
  modalSelectedProducts.forEach(pid => {
    const p = allProducts.find(x => x._id === pid);
    if (p) {
      const effectiveBase = (p.salePrice && p.salePrice < p.basePrice) ? p.salePrice : p.basePrice;
      const existing = currentOrder.items.find(i => i.productId === p._id && (!i.selectedOptions || i.selectedOptions.length === 0));
      if (existing) {
        existing.quantity++;
      } else {
        currentOrder.items.push({
          productId: p._id,
          name: p.name,
          imageUrl: p.imageUrl || '',
          basePrice: effectiveBase,
          selectedOptions: [],
          quantity: 1,
          discount: 0,
          finalPrice: effectiveBase
        });
      }
    }
  });

  // 2. Add variants from persistent map
  modalSelectedVariants.forEach(v => {
    const p = allProducts.find(x => x._id === v.pid);
    if (p) {
      const variantPrice = v.price;
      const combo = v.combo;
      const existing = currentOrder.items.find(i => {
        if (i.productId !== p._id) return false;
        if (!i.selectedOptions || i.selectedOptions.length !== combo.length) return false;
        return combo.every(c => i.selectedOptions.some(so => so.groupName === c.groupName && so.label === c.label));
      });

      if (existing) {
        existing.quantity++;
      } else {
        currentOrder.items.push({
          productId: p._id,
          name: p.name,
          imageUrl: p.imageUrl || '',
          basePrice: variantPrice,
          selectedOptions: combo,
          quantity: 1,
          discount: 0,
          finalPrice: variantPrice
        });
      }
    }
  });

  renderItems();
  updateTotals();
  if (window.markAsModified) window.markAsModified();
  closeProductsModal();
};

window.toggleDetailsMenu = function (e) {
  e.stopPropagation();
  const menu = document.getElementById('details-menu');
  const isVisible = menu.style.display === 'block';
  menu.style.display = isVisible ? 'none' : 'block';

  if (!isVisible) {
    const hideMenu = () => {
      menu.style.display = 'none';
      document.removeEventListener('click', hideMenu);
    };
    document.addEventListener('click', hideMenu);
  }
};

window.archiveCurrentOrder = async function () {
  const confirmed = await window.showConfirmModal('تأكيد الأرشفة', 'هل أنت متأكد من أرشفة هذا الطلب؟');
  if (!confirmed) return;
  try {
    document.body.classList.add('is-loading');
    await api.archiveOrders([currentOrder.orderId]);
    showToast('تم أرشفة الطلب بنجاح');
    window.location.href = 'orders';
  } catch (err) {
    showToast(err.message || 'فشل الأرشفة', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }
};

window.deleteCurrentOrder = async function () {
  const confirmed = await window.showConfirmModal('تأكيد الحذف', 'سيتم حذف هذا الطلب نهائياً. هل أنت متأكد؟');
  if (!confirmed) return;
  try {
    document.body.classList.add('is-loading');
    await api.deleteOrder(currentOrder.orderId);
    showToast('تم حذف الطلب بنجاح');
    window.location.href = 'orders';
  } catch (err) {
    showToast(err.message || 'فشل الحذف', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }
};

window.markAsReady = function () {
  if (!currentOrder) return;
  
  const modalItems = document.getElementById('ready-modal-items');
  const orderIdEl = document.getElementById('ready-modal-order-id');
  if (orderIdEl) orderIdEl.textContent = `#${currentOrder.orderId}`;
  
  // Track fulfillment locally in the modal
  if (!window.fulfillmentState || window.fulfillmentOrderRef !== currentOrder.orderId) {
    window.fulfillmentOrderRef = currentOrder.orderId;
    window.fulfillmentState = currentOrder.items.map(item => ({
      ...item,
      current: 0
    }));
  }

  const renderFulfillmentList = () => {
    modalItems.innerHTML = window.fulfillmentState.map((item, idx) => {
      const imgHtml = item.imageUrl
        ? `<div style="position:relative; width:64px; height:64px;">
             <img src="${item.imageUrl}" style="width:64px; height:64px; border-radius:16px; object-fit:contain; border:1px solid #f1f5f9;" alt="${item.name}">
             <div style="position:absolute; bottom:-4px; right:-4px; background:#fef3c7; color:#d97706; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:10px; border:2px solid #fff; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
               ${item.current}/${item.quantity}
             </div>
           </div>`
        : `<div style="position:relative; width:64px; height:64px; border-radius:16px; background:#f8fafc; display:flex; align-items:center; justify-content:center; color:#94a3b8; border:1px solid #f1f5f9;">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
             <div style="position:absolute; bottom:-4px; right:-4px; background:#fef3c7; color:#d97706; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:10px; border:2px solid #fff; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
               ${item.current}/${item.quantity}
             </div>
           </div>`;
        
      const optText = (item.selectedOptions || []).map(op => op.label).join(' / ');
      
      return `
        <div style="padding: 20px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div style="display: flex; gap: 16px; align-items: center; flex: 1;">
            ${imgHtml}
            <div style="text-align: right;">
              <div style="font-weight: 800; color: #1e293b; font-size: 0.95rem;">${item.name}</div>
              ${optText ? `<div style="color: #64748b; font-size: 0.85rem; margin-top: 2px;">${optText}</div>` : ''}
            </div>
          </div>
          
          <div style="display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 4px; border-radius: 12px; border: 1px solid #f1f5f9;">
            <button onclick="updateFulfillment(${idx}, 1)" style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">+</button>
            <div style="display: flex; align-items: center; gap: 4px; padding: 0 4px; min-width: 65px; justify-content: center;">
               <span style="font-weight: 800; color: #1e293b; font-size: 0.95rem;">${item.current}</span>
               <span style="color: #94a3b8; font-size: 0.75rem; font-weight: 600;">من ${item.quantity}</span>
            </div>
            <button onclick="updateFulfillment(${idx}, -1)" style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;" ${item.current === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>-</button>
          </div>
        </div>
      `;
    }).join('');

    // Check if all items are fulfilled
    const allDone = window.fulfillmentState.every(i => i.current >= i.quantity);
    const updateBtn = document.getElementById('ready-update-btn');
    if (updateBtn) {
      updateBtn.disabled = !allDone;
      updateBtn.style.background = allDone ? '#0f766e' : '#f1f5f9';
      updateBtn.style.color = allDone ? '#fff' : '#94a3b8';
      updateBtn.style.cursor = allDone ? 'pointer' : 'not-allowed';
      updateBtn.onclick = allDone ? confirmMarkAsReady : null;
    }
  };

  window.updateFulfillment = (idx, delta) => {
    const item = window.fulfillmentState[idx];
    const newVal = item.current + delta;
    if (newVal >= 0 && newVal <= item.quantity) {
      item.current = newVal;
      renderFulfillmentList();
    }
  };

  renderFulfillmentList();
  openModal('ready-confirm-modal');
};

window.confirmMarkAsReady = async function () {
  try {
    closeModal('ready-confirm-modal');
    document.body.classList.add('is-loading');
    const updated = await api.updateOrder(currentOrder.orderId, { status: 'ready' });
    currentOrder = updated;
    if (typeof originalOrder !== 'undefined') originalOrder = JSON.parse(JSON.stringify(updated));
    renderOrder();
    showToast('تم تجهيز الطلب بنجاح', 'success');
    if (window.hideBar) window.hideBar();
  } catch (err) {
    showToast('فشل تحديث حالة الطلب', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }
};
// printOrderInvoice consolidated at top
