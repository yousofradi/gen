/** Admin orders management */
let showingArchived = false;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAdmin()) return;
  document.body.classList.add('is-loading');
  loadOrders();
});

let allOrdersData = [];
let currentFilter = 'all';
let currentPage = 1;
let currentLimit = 30;
let totalPages = 1;

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  const selectAllCb = document.getElementById('select-all-orders');
  if (selectAllCb) selectAllCb.checked = false;
  updateArchiveButton();

  tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding:32px;"><div class="spinner"></div></td></tr>';
  try {
    allOrdersData = await api.getOrders(showingArchived);
    updateFilterCounts();
    filterOrdersClient();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">فشل تحميل الطلبات</td></tr>';
  } finally {
    document.body.classList.remove('is-loading');
  }
}

async function loadOrdersSilently() {
  try {
    allOrdersData = await api.getOrders(showingArchived);
    updateFilterCounts();
    filterOrdersClient();
  } catch (err) {
    console.error('Auto-refresh failed', err);
  }
}

// Auto refresh every 30 seconds
setInterval(loadOrdersSilently, 30000);

window.setFilter = function (filter) {
  currentFilter = filter;
  currentPage = 1; // Reset to page 1 on filter change
  document.querySelectorAll('.order-tab').forEach(el => el.classList.remove('active'));
  document.querySelector(`.order-tab[data-filter="${filter}"]`)?.classList.add('active');

  if (filter === 'archived') {
    if (!showingArchived) {
      showingArchived = true;
      loadOrders();
      return;
    }
  } else {
    if (showingArchived) {
      showingArchived = false;
      loadOrders();
      return;
    }
  }
  updateFilterCounts();
  filterOrdersClient();
};

window.filterOrdersClient = function () {
  const searchInput = document.getElementById('order-search');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  let filtered = allOrdersData;

  if (currentFilter === 'pending') {
    filtered = filtered.filter(o => o.status === 'pending');
  }

  if (query) {
    filtered = filtered.filter(o =>
      o.orderId.toLowerCase().includes(query) ||
      (o.customer && o.customer.name && o.customer.name.toLowerCase().includes(query)) ||
      (o.customer && o.customer.phone && o.customer.phone.includes(query))
    );
  }

  // Pagination
  const total = filtered.length;
  totalPages = Math.ceil(total / currentLimit) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * currentLimit;
  const end = start + currentLimit;
  const pageData = filtered.slice(start, end);

  updatePaginationInfo(total);
  renderOrders(pageData);
};

function updatePaginationInfo(total) {
  const infoEl = document.getElementById('pagination-info');
  const pageDropdown = document.getElementById('page-dropdown');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  if (infoEl) infoEl.textContent = total.toString();
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

  if (pageDropdown) {
    let optionsHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      optionsHtml += `<option value="${i}" ${i === currentPage ? 'selected' : ''}>${i}</option>`;
    }
    pageDropdown.innerHTML = optionsHtml;
  }
}

window.changePage = function(delta) {
  const newPage = currentPage + delta;
  if (newPage < 1 || newPage > totalPages) return;
  currentPage = newPage;
  filterOrdersClient();
};

window.goToPage = function(page) {
  currentPage = parseInt(page) || 1;
  filterOrdersClient();
};

window.updateFilterCounts = function () {
  if (!showingArchived) {
    const elAll = document.getElementById('count-all');
    const elPending = document.getElementById('count-pending');
    const elUnpaid = document.getElementById('count-unpaid');

    if (elAll) elAll.textContent = allOrdersData.length;
    if (elPending) elPending.textContent = allOrdersData.filter(o => o.status === 'pending').length;
  }

  // Show number only for active tab
  document.querySelectorAll('.order-tab').forEach(tab => {
    const badge = tab.querySelector('.tab-badge');
    if (badge) {
      badge.style.display = tab.classList.contains('active') ? 'inline-block' : 'none';
    }
  });
};

function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody');

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:40px">لا توجد طلبات هنا</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => {
    // Format date as "27 أبريل 2026"
    const dateObj = new Date(o.createdAt);
    const dateStr = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });

    // Payment badge
    let payBadge = '';
    if (o.paymentMethod === 'vodafone_cash') {
      payBadge = `<span style="display:inline-block; padding:4px 12px; border-radius:16px; background:#fce7f3; color:#9d174d; font-size:0.85rem; font-weight:600;">ف.كاش</span>`;
    } else if (o.paymentMethod === 'instapay') {
      payBadge = `<span style="display:inline-block; padding:4px 12px; border-radius:16px; background:#dcfce7; color:#16a34a; font-size:0.85rem; font-weight:600;">إنستاباي</span>`;
    } else {
      payBadge = o.paymentMethod;
    }

    // Status badge
    let statusBadge = '';
    if (o.status === 'cancelled') {
      statusBadge = `<span style="display:inline-block; padding:4px 12px; border-radius:16px; background:#fee2e2; color:#dc2626; font-size:0.85rem; font-weight:600;">ملغي</span>`;
    } else if (o.paid) {
      statusBadge = `<span style="display:inline-block; padding:4px 12px; border-radius:16px; background:#dcfce7; color:#16a34a; font-size:0.85rem; font-weight:600;">مدفوع <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg></span>`;
    } else if (o.paidAmount > 0) {
      statusBadge = `<span style="display:inline-block; padding:4px 8px; border-radius:16px; background:#fef3c7; color:#92400e; font-size:0.8rem; font-weight:600; text-align:center;">مدفوع جزئياً<div style="font-size:0.7rem; font-weight:normal; opacity:0.9; margin-top:2px;">المتبقي: ${formatPrice(o.totalPrice - o.paidAmount)}</div></span>`;
    } else {
      statusBadge = `<span style="display:inline-block; padding:4px 12px; border-radius:16px; background:#f1f5f9; color:#475569; font-size:0.85rem; font-weight:600;">غير مدفوع</span>`;
    }

    const displayId = o.orderId.replace('Order-', '').replace('Scoop-', '');

    return `
      <tr onclick="viewOrder('${o.orderId}')" style="cursor:pointer; transition:background 0.2s;" onmouseover="if(!this.querySelector('.order-checkbox').checked) this.style.backgroundColor='#f8fafc'" onmouseout="if(!this.querySelector('.order-checkbox').checked) this.style.backgroundColor='transparent'">
        <td style="text-align: center;" onclick="event.stopPropagation();">
          <input type="checkbox" class="order-checkbox" value="${o.orderId}" onchange="updateArchiveButton()" style="width:16px; height:16px; border-radius:4px; accent-color:#0f766e;">
        </td>
        <td style="color:#0ea5e9; font-weight:600; font-size:0.95rem;" dir="ltr">#${displayId}</td>
        <td>
          <div style="font-weight:600; color:#1e293b;">${o.customer?.name || 'بدون اسم'}</div>
          <div style="font-size:0.85rem; color:#64748b; margin-top:2px;">${o.customer?.government || ''}</div>
          <div style="font-size:0.85rem; margin-top:4px;">
            ${o.carrier === 'egyptpost' 
              ? `<span style="display:inline-block; padding:3px 8px; border-radius:6px; background:#fee2e2; color:#dc2626; font-size:0.75rem; font-weight:700;">البريد المصري</span>`
              : `<span style="display:inline-block; padding:3px 8px; border-radius:6px; background:#e0f2fe; color:#0369a1; font-size:0.75rem; font-weight:700;">بوسطة${o.bostaTrackingNumber ? ` (#${o.bostaTrackingNumber})` : ''}</span>`
            }
          </div>
        </td>
        <td style="font-size:0.95rem; color:#475569;">${o.items?.length || 0} منتج</td>
        <td>${statusBadge}</td>
        <td>${payBadge}</td>
        <td>
          <div style="font-weight:700; color:#0ea5e9; white-space:nowrap;">${formatPrice(o.totalPrice)}</div>
          ${o.discount ? (o.discount > 0 
            ? `<div style="font-size:0.8rem; color:#dc2626;">خصم: ${formatPrice(o.discount)}</div>` 
            : `<div style="font-size:0.8rem; color:#10b981;">زياده ${Math.abs(o.discount)} ج.م</div>`
          ) : ''}
        </td>
        <td style="color:#64748b; font-size:0.85rem;">${dateStr}</td>
      </tr>
    `;
  }).join('');
  
  // Sync selection state UI
  updateArchiveButton();
}

// ── Selection & Archiving ────────────────────────────────
window.toggleSelectAll = function () {
  const selectAll = document.getElementById('select-all-orders');
  const checkboxes = document.querySelectorAll('.order-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
  updateArchiveButton();
};

window.updateArchiveButton = function () {
  const allCheckboxes = document.querySelectorAll('.order-checkbox');
  const checkedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
  const filterBar = document.getElementById('filter-bar');
  const bulkBar = document.getElementById('bulk-actions-bar');
  const countBadge = document.getElementById('selected-count-badge');
  const selectAllCb = document.getElementById('select-all-orders');

  // Update "Select All" checkbox state
  if (selectAllCb && allCheckboxes.length > 0) {
    selectAllCb.checked = (allCheckboxes.length === checkedCheckboxes.length);
  }

  // Style rows
  allCheckboxes.forEach(cb => {
    const tr = cb.closest('tr');
    if (cb.checked) {
      tr.style.backgroundColor = '#f0fdf4';
    } else {
      tr.style.backgroundColor = 'transparent';
    }
  });

  if (checkedCheckboxes.length > 0) {
    if (filterBar) filterBar.style.display = 'none';
    if (bulkBar) {
      bulkBar.style.display = 'flex';
      if (countBadge) countBadge.textContent = checkedCheckboxes.length;
    }
  } else {
    if (filterBar) filterBar.style.display = 'flex';
    if (bulkBar) bulkBar.style.display = 'none';
  }
};

window.toggleBulkMenu = function (event) {
  event.stopPropagation();
  const menu = document.getElementById('bulk-menu');
  if (menu.style.display === 'block') {
    menu.style.display = 'none';
  } else {
    menu.style.display = 'block';
  }
};

// Close bulk menu when clicking outside
document.addEventListener('click', function (e) {
  const menu = document.getElementById('bulk-menu');
  if (menu && menu.style.display === 'block' && !e.target.closest('#bulk-actions-bar')) {
    menu.style.display = 'none';
  }
});

window.bulkAction = async function (action) {
  const menu = document.getElementById('bulk-menu');
  if (menu) menu.style.display = 'none';

  const checkboxes = document.querySelectorAll('.order-checkbox:checked');
  const orderIds = Array.from(checkboxes).map(cb => cb.value);
  if (!orderIds.length) return;

  if (action === 'archive') {
    if (showingArchived) {
      await unarchiveSelected();
    } else {
      await archiveSelected();
    }
  } else if (action === 'cancel') {
    const confirmed = await window.showConfirmModal('إلغاء الطلبات', `هل أنت متأكد من إلغاء ${orderIds.length} طلبات؟`);
    if (!confirmed) return;
    try {
      await api.cancelOrdersBatch(orderIds);
      showToast('تم إلغاء الطلبات بنجاح');
      loadOrders();
    } catch (err) {
      showToast(err.message || 'فشل إلغاء الطلبات', 'error');
    }
  } else if (action === 'delete') {
    const confirmed = await window.showConfirmModal('تأكيد الحذف', `هل أنت متأكد من حذف ${orderIds.length} طلبات نهائياً؟`);
    if (!confirmed) return;
    try {
      await api.deleteOrdersBatch(orderIds);
      showToast('تم حذف الطلبات بنجاح');
      loadOrders();
    } catch (err) {
      showToast(err.message || 'فشل حذف الطلبات', 'error');
    }
  } else if (action === 'add_tags' || action === 'remove_tags') {
    window.showToast('سيتم إضافة خاصية التصنيفات قريباً.', 'info'); // Placeholder
  }
};

window.unselectAll = function () {
  document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = false);
  const selectAllCb = document.getElementById('select-all-orders');
  if (selectAllCb) selectAllCb.checked = false;
  updateArchiveButton();
};

window.archiveSelected = async function () {
  const checkboxes = document.querySelectorAll('.order-checkbox:checked');
  const orderIds = Array.from(checkboxes).map(cb => cb.value);
  if (!orderIds.length) return;

  const confirmed = await window.showConfirmModal('تأكيد الأرشفة', `هل أنت متأكد من أرشفة ${orderIds.length} طلبات؟`);
  if (!confirmed) return;

  try {
    await api.archiveOrders(orderIds);
    showToast('تم أرشفة الطلبات بنجاح');
    loadOrders();
  } catch (err) {
    showToast(err.message || 'فشل أرشفة الطلبات', 'error');
  }
};

window.unarchiveSelected = async function () {
  const checkboxes = document.querySelectorAll('.order-checkbox:checked');
  const orderIds = Array.from(checkboxes).map(cb => cb.value);
  if (!orderIds.length) return;

  const confirmed = await window.showConfirmModal('تأكيد إلغاء الأرشفة', `هل أنت متأكد من إلغاء أرشفة ${orderIds.length} طلبات؟`);
  if (!confirmed) return;

  try {
    await api.unarchiveOrders(orderIds);
    showToast('تم إلغاء أرشفة الطلبات بنجاح');
    loadOrders();
  } catch (err) {
    showToast(err.message || 'فشل إلغاء أرشفة الطلبات', 'error');
  }
};

// Removed toggleArchivedView as it's replaced by setFilter('archived')

// ── View Order ───────────────────────────────────────────
window.viewOrder = function (orderId) {
  window.location.href = `order-details?id=${orderId}`;
};

// ── Delete Order ───────────────────────────────────────
window.deleteOrder = async function (orderId) {
  const confirmed = await window.showConfirmModal('تأكيد الحذف', 'هل أنت متأكد من حذف هذا الطلب؟');
  if (!confirmed) return;
  try {
    await api.deleteOrder(orderId);
    showToast('تم حذف الطلب');
    loadOrders();
  } catch (err) {
    showToast(err.message || 'فشل الحذف', 'error');
  }
};

// ── Print Bulk Invoices (Native High Quality) ───────────────────────────
window.printInvoices = async function () {
  const adminKey = localStorage.getItem('adminKey') || '';
  const btn = document.getElementById('print-invoices-btn');
  const originalText = btn ? btn.innerHTML : 'تحميل جميع الفواتير';
  
  if (btn) {
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-color:#475569;border-top-color:transparent;margin:0"></div>';
    btn.disabled = true;
  }

  showToast('جاري تحضير الفواتير للتحميل المجاني والمباشر...', 'info');
  
  try {
    const url = `${API_BASE}/orders/bulk/invoice-html?adminKey=${adminKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to generate invoice HTML');
    }

    const htmlText = await response.text();
    
    // Configure html2pdf options
    const opt = {
      margin: [4, 4, 4, 4], // 4mm margins
      filename: `bulk-invoices-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
    };
    
    // Generate and download PDF on the client side directly from the HTML text
    await html2pdf().from(htmlText).set(opt).save();
    
    showToast('تم تحميل الفواتير بنجاح ✅');
  } catch (err) {
    console.error('PDF Generation Error:', err);
    showToast('فشل تحميل الفواتير: ' + err.message, 'error');
  } finally {
    if (btn) {
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 500);
    }
  }
};

window.shipOrders = async function () {
  const btn = document.getElementById('ship-orders-btn');
  const originalHtml = btn ? btn.innerHTML : 'شحن الطلبات';

  // Filter for "active and paid" orders (Full or Partial) that don't have a Bosta ID yet
  // Exclude cancelled and archived orders
  const ordersToShip = allOrdersData.filter(o => 
    o.status !== 'cancelled' && 
    o.status !== 'archived' &&
    (o.paid === true || (o.paidAmount && o.paidAmount > 0)) && 
    !o.bostaDeliveryId
  );

  if (ordersToShip.length === 0) {
    showToast('لا توجد طلبات مدفوعة جاهزة للشحن حالياً', 'info');
    return;
  }

  const confirmed = await window.showConfirmModal('تأكيد الشحن', `هل تريد شحن ${ordersToShip.length} طلبات عبر Bosta؟`);
  if (!confirmed) return;

  if (btn) {
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-color:#fff;border-top-color:transparent;margin:0"></div>';
    btn.disabled = true;
  }

  try {
    const orderIds = ordersToShip.map(o => o.orderId);
    const result = await api.shipOrdersBulk(orderIds);
    showToast(result.message || `تم شحن ${result.count} طلبات بنجاح`, 'success');
  } catch (err) {
    console.error(`Failed to ship orders bulk:`, err);
    showToast(err.message || 'فشل شحن الطلبات', 'error');
  }

  if (btn) {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }

  loadOrders();
};
