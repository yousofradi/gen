let allCarts = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Check auth
  const ok = await api.checkAdmin();
  if (!ok) {
    window.location.href = 'login.html';
    return;
  }

  // Remove is-loading from body and show layout
  document.body.classList.remove('is-loading');
  const layout = document.getElementById('main-content-layout');
  const spinner = document.getElementById('page-content-spinner');
  if (layout) layout.style.display = 'block';
  if (spinner) spinner.style.display = 'none';

  await loadAbandonedCarts();
});

async function loadAbandonedCarts() {
  const tbody = document.getElementById('carts-tbody');
  try {
    const carts = await api.getAbandonedCarts();
    allCarts = carts || [];
    renderCarts(allCarts);
  } catch (err) {
    console.error('Failed to load abandoned carts:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:24px; color:#ef4444; font-weight:bold;">فشل في تحميل السلات المتروكة</td></tr>`;
  }
}

function renderCarts(list) {
  const tbody = document.getElementById('carts-tbody');
  const countAll = document.getElementById('count-all');
  
  if (countAll) countAll.textContent = list.length;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:48px 24px; color:#64748b;">لا توجد سلات متروكة حالياً</td></tr>`;
    return;
  }

  let storeUrl = localStorage.getItem('admin_store_url') || window.location.origin;
  if (storeUrl.endsWith('/')) {
    storeUrl = storeUrl.slice(0, -1);
  }

  tbody.innerHTML = list.map(cart => {
    // Total value
    const total = cart.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    
    // Items listing
    const itemsListHtml = cart.items.map(item => {
      const optionsStr = item.selectedOptions && item.selectedOptions.length > 0
        ? ` (${item.selectedOptions.map(o => o.label).join(' / ')})`
        : '';
      return `<div style="margin-bottom: 4px;">
        <span class="badge-qty">${item.quantity}x</span> 
        <strong style="color:#1e293b;">${item.name}</strong>${optionsStr}
      </div>`;
    }).join('');

    // Customer display
    const custName = cart.customer?.name || '<span style="color:#a1a1aa; font-style:italic;">بدون اسم</span>';
    const custPhone = cart.customer?.phone || '<span style="color:#a1a1aa; font-style:italic;">بدون هاتف</span>';
    
    // WhatsApp direct link if phone exists
    let waLinkHtml = custPhone;
    if (cart.customer?.phone) {
      let cleanPhone = cart.customer.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;
      waLinkHtml = `<a href="https://wa.me/${cleanPhone}" target="_blank" style="color:#10b981; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
        <span>${cart.customer.phone}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
      </a>`;
    }

    // Secondary phone if present
    const phone2Str = cart.customer?.secondPhone ? `<div style="font-size:0.8rem; color:#64748b; margin-top:2px;">هاتف إضافي: ${cart.customer.secondPhone}</div>` : '';

    // Governorate & Zone
    const gov = cart.customer?.government || '';
    const zone = cart.customer?.zone || '';
    const address = cart.customer?.address || '';
    let addressDisplay = `<div style="font-weight:600; color:#334155;">${gov} ${zone ? ` - ${zone}` : ''}</div>`;
    if (address) {
      addressDisplay += `<div class="hide-mobile" style="font-size:0.8rem; color:#64748b; margin-top:4px; max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${address}">${address}</div>`;
    }

    // Time ago or formatted
    const date = new Date(cart.updatedAt);
    const dateFormatted = date.toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const recoverUrl = `${storeUrl}/checkout?recover=${cart.checkoutToken}`;

    return `
      <tr id="cart-row-${cart._id}" onclick="handleRowClick(event, '${cart._id}')" style="position: relative;">
        <!-- Mobile Delete Button (renders on the far left) -->
        <td class="mobile-delete-btn-cell" style="display: none; padding: 0; width: auto; border: none; align-items: center; justify-content: center;">
          <button class="mobile-delete-btn" onclick="deleteCart('${cart._id}', event)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </td>
        
        <td>
          <div style="font-weight:700; color:#0f172a;">${custName}</div>
          <div style="margin-top:4px;">${waLinkHtml}</div>
          ${phone2Str}
        </td>
        <td>${addressDisplay}</td>
        <td>
          <div style="max-height:80px; overflow-y:auto; padding-left:8px;">
            ${itemsListHtml}
          </div>
        </td>
        <td style="font-weight:800; color:#0f766e;">${formatPrice(total)}</td>
        <td style="font-size:0.8rem; color:#64748b;">${dateFormatted}</td>
        <td style="text-align: center;">
          <div style="display:flex; gap:8px; justify-content:center;">
            <button class="btn-action btn-confirm" onclick="confirmCart('${cart._id}', event)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>تأكيد السلة</span>
            </button>
            <button class="btn-action btn-delete" onclick="deleteCart('${cart._id}', event)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              <span>حذف</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterCarts() {
  const query = document.getElementById('cart-search').value.toLowerCase().trim();
  if (!query) {
    renderCarts(allCarts);
    return;
  }

  const filtered = allCarts.filter(cart => {
    const name = (cart.customer?.name || '').toLowerCase();
    const phone = (cart.customer?.phone || '').toLowerCase();
    const gov = (cart.customer?.government || '').toLowerCase();
    const zone = (cart.customer?.zone || '').toLowerCase();
    return name.includes(query) || phone.includes(query) || gov.includes(query) || zone.includes(query);
  });

  renderCarts(filtered);
}

function confirmCart(cartId, event) {
  if (event) event.stopPropagation();
  window.location.href = `order-form.html?recoverCartId=${cartId}`;
}

async function deleteCart(id, event) {
  if (event) event.stopPropagation();
  const ok = await showConfirmModal('حذف السلة المتروكة', 'هل أنت متأكد من رغبتك في حذف هذه السلة المتروكة؟ لا يمكن استعادتها بعد الحذف.');
  if (!ok) return;

  try {
    await api.deleteAbandonedCart(id);
    showToast('تم حذف السلة المتروكة بنجاح');
    
    // Remove from UI list
    allCarts = allCarts.filter(c => c._id !== id);
    renderCarts(allCarts);
  } catch (err) {
    console.error('Failed to delete cart:', err);
    showToast(err.message || 'فشل في حذف السلة المتروكة', 'error');
  }
}

function handleRowClick(event, cartId) {
  if (event.target.closest('button') || event.target.closest('a') || event.target.closest('input')) {
    return;
  }
  window.location.href = `order-form.html?recoverCartId=${cartId}`;
}
