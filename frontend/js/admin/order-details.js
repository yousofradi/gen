/** Admin — Order Details JS */

let currentOrder = null;
let originalOrder = null;
let allProducts = [];
let collectionsMap = {};
let shippingMap = {};

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
    const [order, shipping, settings, productsRes] = await Promise.all([
      api.getOrder(orderId),
      api.getShipping().catch(() => ({})),
      api.getSetting('sundura_global_settings').catch(() => ({})),
      api.getProducts(1, 1000, true).catch(() => [])
    ]);

    currentOrder = order;
    originalOrder = JSON.parse(JSON.stringify(order));
    shippingMap = shipping;
    allProducts = Array.isArray(productsRes) ? productsRes : (productsRes.products || []);

    // Fallback if DB is empty
    if (Object.keys(shippingMap).length === 0) {
      shippingMap = {
        'القاهرة': 85, 'الجيزة': 85, 'الإسكندرية': 85, 'البحيرة': 85, 'القليوبية': 85, 'الغربية': 85, 'المنوفية': 85, 'دمياط': 85, 'الدقهلية': 85, 'كفر الشيخ': 85, 'الشرقية': 85, 'الاسماعيلية': 95, 'السويس': 95, 'بورسعيد': 95, 'الفيوم': 110, 'بني سويف': 110, 'المنيا': 110, 'اسيوط': 110, 'سوهاج': 130, 'قنا': 130, 'أسوان': 130, 'الأقصر': 130, 'البحر الأحمر': 130, 'مرسي مطروح': 135, 'الوادي الجديد': 135, 'شمال سيناء': 135, 'جنوب سيناء': 135
      };
    }

    // Populate government dropdown
    const govSelect = document.getElementById('modal-c-gov');
    if (govSelect) {
      Object.keys(shippingMap).forEach(gov => {
        govSelect.add(new Option(gov, gov));
      });
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
    document.getElementById('cancel-order-btn').style.display = 'none';
    document.getElementById('page-order-id').innerHTML += ' <span class="badge badge-danger">ملغي</span>';
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

function renderItems() {
  const container = document.getElementById('order-items-container');
  if (!currentOrder.items || currentOrder.items.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">لا توجد منتجات في هذا الطلب</div>';
    return;
  }

  container.innerHTML = currentOrder.items.map((item, idx) => {
    const p = allProducts.find(x => x._id === item.productId) || {};
    let finalImageUrl = item.imageUrl;
    if (!finalImageUrl && p) {
      if (p.variants && item.selectedOptions && item.selectedOptions.length > 0) {
        const matchingVariant = p.variants.find(v => {
          if (!v.combination) return false;
          return item.selectedOptions.every(opt => v.combination[opt.groupName] === opt.label);
        });
        if (matchingVariant && matchingVariant.imageUrl) {
          finalImageUrl = matchingVariant.imageUrl;
        }
      }
      if (!finalImageUrl) {
        finalImageUrl = (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || '');
      }
    }

    const imgHtml = finalImageUrl
      ? `<img src="${finalImageUrl}" style="width:52px; height:52px; border-radius:8px; object-fit:contain; border:1px solid #f1f5f9;" alt="${item.name}">`
      : `<div style="width:52px; height:52px; border-radius:8px; background:#f8fafc; display:flex; align-items:center; justify-content:center; color:#94a3b8; border:1px solid #f1f5f9;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;

    const optText = (item.selectedOptions || []).map(op => op.label).join(' / ');
    const unitPrice = item.basePrice + (item.selectedOptions || []).reduce((s, op) => s + (op.price || 0), 0);

    return `
      <div style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #fff; display: flex; flex-direction: column; gap: 14px;">
        <!-- Top Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 52px;">
          <!-- Right side: Image + Name -->
          <div style="display: flex; align-items: center; gap: 12px; flex: 1.5;">
            ${imgHtml}
            <div style="text-align: right; display: flex; flex-direction: column; justify-content: center;">
              <div style="font-weight: 700; font-size: 13px; color: #1e293b; line-height: 1.2;">${item.name}</div>
              ${optText ? `<div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">${optText}</div>` : ''}
              ${item.discount ? `<div style="font-size:0.75rem; color:#dc2626; margin-top:4px; font-weight:600;">خصم: ${formatPrice(item.discount)}</div>` : ''}
            </div>
          </div>
          
          <!-- Left side: Unit Price Block and Total Price -->
          <div style="display: flex; align-items: center; gap: 16px; flex: 1; justify-content: space-between;">
            <div style="font-size: 0.85rem; color: #64748b; white-space: nowrap; font-weight: 500; text-align: center; flex: 1;" dir="ltr">${formatPrice(unitPrice)} × ${item.quantity}</div>
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
    const optExtra = (item.selectedOptions || []).reduce((s, op) => s + (op.price || 0), 0);
    item.finalPrice = Math.max(0, (item.basePrice + optExtra) * item.quantity - (item.discount || 0));
    subtotal += item.finalPrice;
  });

  o.totalPrice = Math.max(0, subtotal + o.shippingFee - (o.discount || 0));

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
  document.getElementById('modal-c-gov').value = currentOrder.customer.government || '';
  document.getElementById('modal-c-address').value = currentOrder.customer.address || '';
  document.getElementById('modal-c-notes').value = currentOrder.customer.notes || '';
  openModal('customer-modal');
};

window.applyCustomerChanges = async function () {
  const name = document.getElementById('modal-c-name').value.trim();
  const phone = document.getElementById('modal-c-phone').value.trim();

  if (!name || !phone) {
    showToast('الاسم ورقم الهاتف مطلوبان', 'error');
    return;
  }

  currentOrder.customer.name = name;
  currentOrder.customer.phone = phone;
  currentOrder.customer.secondPhone = document.getElementById('modal-c-phone2').value.trim();
  currentOrder.customer.government = document.getElementById('modal-c-gov').value;
  currentOrder.customer.address = document.getElementById('modal-c-address').value.trim();
  currentOrder.customer.notes = document.getElementById('modal-c-notes').value.trim();

  renderOrder();
  closeModal('customer-modal');

  // Trigger unsaved changes bar
  if (window.markAsModified) window.markAsModified();
};

window.openPaymentModal = function () {
  document.getElementById('modal-payment-method').value = currentOrder.paymentMethod || 'vodafone_cash';
  document.getElementById('modal-paid-amount').value = currentOrder.paidAmount || 0;
  openModal('payment-modal');
};

window.applyPaymentChanges = async function () {
  currentOrder.paymentMethod = document.getElementById('modal-payment-method').value;
  currentOrder.paidAmount = parseFloat(document.getElementById('modal-paid-amount').value) || 0;
  currentOrder.forcePaymentWebhook = true; // Flag to force trigger webhook
  renderOrder();
  closeModal('payment-modal');

  // Save immediately
  await saveOrderChanges(true);

  // Hide the unsaved changes bar
  const bar = document.getElementById('unsaved-changes-bar');
  if (bar) bar.classList.remove('visible');
};

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
};

window.openItemDiscountModal = function (idx) {
  const item = currentOrder.items[idx];
  document.getElementById('modal-item-idx').value = idx;
  document.getElementById('modal-item-discount').value = item.discount || 0;
  openModal('item-discount-modal');
};

window.removeItem = function (idx) {
  const item = currentOrder.items[idx];
  if (!item) return;

  document.getElementById('modal-delete-idx').value = idx;
  const previewEl = document.getElementById('delete-item-preview');
  const imgHtml = item.imageUrl
    ? `<div style="position:relative"><img src="${item.imageUrl}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;"><span style="position:absolute;bottom:-5px;left:-5px;background:#64748b;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;border:2px solid #fff;">${item.quantity}</span></div>`
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
  document.getElementById('modal-order-discount').value = currentOrder.discount || 0;
};

window.openOrderDiscountModal = function () {
  openModal('order-discount-modal');
  document.getElementById('modal-order-discount').value = currentOrder.discount || 0;
};

window.applyOrderDiscount = async function () {
  const val = document.getElementById('modal-order-discount').value;
  currentOrder.discount = parseFloat(val) || 0;
  closeModal('order-discount-modal');
  updateTotals();

  // Trigger unsaved changes bar
  if (window.markAsModified) window.markAsModified();
};

window.openItemDiscountModal = function (idx) {
  const item = currentOrder.items[idx];
  document.getElementById('modal-item-idx').value = idx;
  document.getElementById('modal-item-discount').value = item.discount || 0;
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
  }
};

window.markFullyPaid = async function () {
  currentOrder.paidAmount = currentOrder.totalPrice;
  currentOrder.forcePaymentWebhook = true;
  renderOrder();

  // Save immediately
  await saveOrderChanges(true);

  // Hide the unsaved changes bar
  const bar = document.getElementById('unsaved-changes-bar');
  if (bar) bar.classList.remove('visible');
};

// ── Save ───────────────────────────────────────────────

window.saveOrderChanges = async function (silent = false) {
  const btn = document.getElementById('save-all-btn');
  if (!silent && btn) {
    btn.disabled = true;
    btn.textContent = 'جارٍ الحفظ...';
  }

  try {
    const updates = {
      items: currentOrder.items,
      discount: currentOrder.discount,
      paymentMethod: currentOrder.paymentMethod,
      paidAmount: currentOrder.paidAmount,
      paid: currentOrder.paidAmount >= currentOrder.totalPrice,
      customer: currentOrder.customer,
      forcePaymentWebhook: currentOrder.forcePaymentWebhook,
      updatedAt: currentOrder.updatedAt
    };

    await api.updateOrder(currentOrder.orderId, updates);
    currentOrder.forcePaymentWebhook = false; // Reset the flag

    if (!silent) {
      showToast('تم حفظ التغييرات <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'حفظ التغييرات';
      }
    } else {
      showToast('تم تحديث البيانات بنجاح', 'success');
    }
    
    // Update baseline for discard
    originalOrder = JSON.parse(JSON.stringify(currentOrder));
    renderOrder();
    return true;
  } catch (err) {
    if (err.message === 'conflict' || err.message.includes('conflict') || err.message.includes('تعارض')) {
      await window.showConfirmModal(
        'تنبيه تعارض البيانات',
        'تم تعديل هذا الطلب بالفعل بواسطة مستخدم آخر أو في نافذة أخرى. يجب إعادة تحميل الصفحة للحصول على البيانات الأحدث وتجنب الكتابة فوق التعديلات الأخرى.',
        false
      );
      window.location.reload();
      return false;
    }
    if (!silent && btn) {
      btn.disabled = false;
      btn.textContent = 'حفظ التغييرات';
    }
    showToast(err.message || 'فشل الحفظ', 'error');
    return false;
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

// ── Modal Products ─────────────────────────────────────
window.openProductsModal = async function () {
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
  renderModalProducts();
};

window.closeProductsModal = function () {
  closeModal('products-modal');
};

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

window.renderModalProducts = function () {
  const q = document.getElementById('modal-search').value.toLowerCase().trim();
  const col = document.getElementById('modal-col-filter').value;
  const listEl = document.getElementById('modal-products-list');

  let filtered = allProducts;
  if (q) filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
  if (col) filtered = filtered.filter(p => p.collectionId === col);

  listEl.innerHTML = filtered.map(p => {
    const imgUrl = (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || '');
    const imgHtml = imgUrl ? `<img src="${imgUrl}" class="pli-img">` : `<div class="pli-img"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;
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
            <input type="checkbox" class="pli-checkbox product-select-cb" value="${p._id}" style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer;">
          </label>
        </div>
      `;
    }

    let variantsHtml = '';
    if (p.variants && p.variants.length > 0) {
      variantsHtml = p.variants.map((v, idx) => {
        const comboList = Object.entries(v.combination).map(([g, l]) => ({ groupName: g, label: l }));
        const title = comboList.map(c => c.label).join(' / ');
        const finalPrice = (v.salePrice !== null && v.salePrice !== undefined) ? v.salePrice : v.price;
        const comboStr = encodeURIComponent(JSON.stringify(comboList));
        return `
          <label class="product-variant-item" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color); background:#fafafa; cursor:pointer; padding-right:48px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="font-size:0.9rem;font-weight:500;">${title}</div>
              <div style="font-size:0.85rem;color:var(--primary)">${formatPrice(finalPrice)}</div>
            </div>
            <input type="checkbox" class="pli-checkbox product-variant-cb" data-pid="${p._id}" data-combo="${comboStr}">
          </label>
        `;
      }).join('');
    } else {
      const combinations = getProductCombinations(p.options);
      variantsHtml = combinations.map((combo, idx) => {
        const title = combo.map(c => c.label).join(' / ');
        const extraPrice = combo.reduce((sum, c) => sum + (c.price || 0), 0);
        const finalPrice = extraPrice > 0 ? extraPrice : effectiveBase;
        const comboStr = encodeURIComponent(JSON.stringify(combo));
        return `
          <label class="product-variant-item" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color); background:#fafafa; cursor:pointer; padding-right:48px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="font-size:0.9rem;font-weight:500;">${title}</div>
              <div style="font-size:0.85rem;color:var(--primary)">${formatPrice(finalPrice)}</div>
            </div>
            <input type="checkbox" class="pli-checkbox product-variant-cb" data-pid="${p._id}" data-combo="${comboStr}">
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

window.openProductsModal = async function () {
  openModal('products-modal');

  if (allProducts.length === 0) {
    const listEl = document.getElementById('modal-products-list');
    listEl.innerHTML = '<div style="padding:20px; text-align:center;">جاري تحميل المنتجات...</div>';
    try {
      const [products, collections] = await Promise.all([
        api.getProducts(),
        api.getCollections()
      ]);
      allProducts = products;
      const colFilter = document.getElementById('modal-col-filter');
      colFilter.innerHTML = '<option value="">جميع المنتجات</option>';
      collections.forEach(c => {
        colFilter.add(new Option(c.name, c._id));
      });
    } catch (err) {
      console.error('Failed to load products for modal', err);
    }
  }
  renderModalProducts();
};

window.addSelectedProducts = function () {
  // 1. Add simple products
  const checkedSimple = document.querySelectorAll('.product-select-cb:checked');
  checkedSimple.forEach(cb => {
    const p = allProducts.find(x => x._id === cb.value);
    if (p) {
      const effectiveBase = (p.salePrice && p.salePrice < p.basePrice) ? p.salePrice : p.basePrice;
      const existing = currentOrder.items.find(i => i.productId === p._id && (!i.selectedOptions || i.selectedOptions.length === 0));
      if (existing) {
        existing.quantity++;
      } else {
        currentOrder.items.push({
          productId: p._id,
          name: p.name,
          imageUrl: (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || ''),
          basePrice: effectiveBase,
          selectedOptions: [],
          quantity: 1,
          discount: 0,
          finalPrice: effectiveBase
        });
      }
    }
  });

  // 2. Add variants
  const checkedVariants = document.querySelectorAll('.product-variant-cb:checked');
  checkedVariants.forEach(cb => {
    const p = allProducts.find(x => x._id === cb.dataset.pid);
    if (p) {
      const effectiveBase = (p.salePrice && p.salePrice < p.basePrice) ? p.salePrice : p.basePrice;
      const combo = JSON.parse(decodeURIComponent(cb.dataset.combo));
      // Check if this exact variant is already in cart
      const existing = currentOrder.items.find(i => {
        if (i.productId !== p._id) return false;
        if (!i.selectedOptions || i.selectedOptions.length !== combo.length) return false;
        return combo.every(c => i.selectedOptions.some(so => so.groupName === c.groupName && so.label === c.label));
      });

      if (existing) {
        existing.quantity++;
      } else {
        const extraPrice = combo.reduce((sum, c) => sum + (c.price || 0), 0);
        let variantImageUrl = '';
        if (p.variants && p.variants.length > 0 && combo && combo.length > 0) {
          const matchingVariant = p.variants.find(varObj => {
            if (!varObj.combination) return false;
            return combo.every(opt => varObj.combination[opt.groupName] === opt.label);
          });
          if (matchingVariant && matchingVariant.imageUrl) {
            variantImageUrl = matchingVariant.imageUrl;
          }
        }

        currentOrder.items.push({
          productId: p._id,
          name: p.name,
          imageUrl: variantImageUrl || ((p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || '')),
          basePrice: effectiveBase,
          selectedOptions: combo,
          quantity: 1,
          discount: 0,
          finalPrice: effectiveBase + extraPrice
        });
      }
    }
  });

  closeProductsModal();
  updateTotals();
  renderItems();
  if (window.markAsModified) window.markAsModified();
};

window.toggleDetailsMenu = function(e) {
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

window.archiveCurrentOrder = async function() {
  if (!confirm('?? ??? ????? ?? ????? ??? ??????')) return;
  try {
    await api.archiveOrders([currentOrder.orderId]);
    showToast('??? ????? ????? ?????');
    window.location.href = 'orders';
  } catch (err) {
    showToast(err.message || '??? ????? ?????', 'error');
  }
};

window.deleteCurrentOrder = async function() {
  if (!confirm('???? ??? ????? ???????. ?? ??? ??????')) return;
  try {
    await api.deleteOrder(currentOrder.orderId);
    showToast('?? ??? ????? ?????');
    window.location.href = 'orders';
  } catch (err) {
    showToast(err.message || '??? ??? ?????', 'error');
  }
};
