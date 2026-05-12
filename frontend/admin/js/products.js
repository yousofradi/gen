let productsSortable = null;

/** Admin products list page */
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAdmin()) return;
  loadProducts();

  window.handleGlobalSave = async () => {
    const tbody = document.getElementById('products-tbody');
    const order = Array.from(tbody.children)
      .map((el, idx) => ({ id: el.getAttribute('data-id'), sortOrder: (currentPage - 1) * currentLimit + idx }))
      .filter(x => x.id);
    
    try {
      await api.reorderProducts(order);
      showToast('تم حفظ الترتيب بنجاح');
      if (window.hideBar) window.hideBar();
      return true;
    } catch (err) {
      showToast('فشل حفظ الترتيب', 'error');
      return false;
    }
  };

  window.handleGlobalDiscard = () => {
    loadProducts();
    if (window.hideBar) window.hideBar();
  };
});

let allProducts = [];
let currentPage = 1;
let totalPages = 1;
let currentLimit = 30;
let searchQuery = '';
let currentFilter = 'all';
let selectedProductIds = new Set(); // Persistent selection across search/pagination

async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div></td></tr>';
  try {
    const hasOptions = currentFilter === 'variable' ? 'true' : '';
    const [res, collections] = await Promise.all([
      api.getProducts(currentPage, currentLimit, true, '', searchQuery, hasOptions),
      api.getCollections().catch(() => [])
    ]);
    
    let products = res.products || res;
    totalPages = res.totalPages || 1;

    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:40px">لا توجد منتجات مطابقة للبحث</td></tr>';
      updatePaginationInfo(0);
      return;
    }

    allProducts = products;
    renderProducts(collections);
    updatePaginationInfo(res.total || products.length);
    updateBulkActions();

    // Initialize Sortable
    if (productsSortable) productsSortable.destroy();
    
    // Only enable reordering if not searching and on page 1 (or allow on any page but only reorder visible ones)
    const canReorder = !searchQuery && currentFilter === 'all';
    
    productsSortable = new Sortable(tbody, {
      handle: '.drag-handle',
      animation: 150,
      disabled: !canReorder,
      onEnd: () => {
        if (window.markAsModified) window.markAsModified();
      }
    });

    if (!canReorder) {
       document.querySelectorAll('.drag-handle').forEach(h => h.style.opacity = '0.3');
    }

  } catch (err) {
    console.error('Failed to load products:', err);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">فشل تحميل المنتجات</td></tr>';
  }
}

function updatePaginationInfo(total) {
  const infoEl = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageDropdown = document.getElementById('page-dropdown');
  const limitDropdown = document.getElementById('items-per-page');

  if (infoEl) infoEl.textContent = `إجمالي: ${total} - صفحة ${currentPage} من ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  const countAll = document.getElementById('count-all');
  const countVar = document.getElementById('count-variable');

  if (currentFilter === 'variable') {
    if (countVar) countVar.textContent = total;
  } else {
    if (countAll) countAll.textContent = total;
  }

  if (pageDropdown) {
    let optionsHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      optionsHtml += `<option value="${i}" ${i === currentPage ? 'selected' : ''}>${i}</option>`;
    }
    pageDropdown.innerHTML = optionsHtml;
  }

  if (limitDropdown) {
    limitDropdown.value = currentLimit.toString();
  }
}

window.changePage = function (delta) {
  const newPage = currentPage + delta;
  if (newPage < 1 || newPage > totalPages) return;
  currentPage = newPage;
  loadProducts();
};

window.goToPage = function (page) {
  const newPage = parseInt(page);
  if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
  currentPage = newPage;
  loadProducts();
};

window.changeLimit = function (limit) {
  currentLimit = parseInt(limit) || 30;
  currentPage = 1;
  loadProducts();
};

function renderProducts(collections) {
  const tbody = document.getElementById('products-tbody');
  const colMap = {};
  if (collections) collections.forEach(c => colMap[c._id] = c.name);

  const getMainImage = (p) => {
    if (p.images && p.images.length > 0) return p.images[0];
    return p.imageUrl || '';
  };

  tbody.innerHTML = allProducts.map((p, idx) => {
    const mainImg = getMainImage(p);
    const statusLabel = p.status === 'draft' ? 'مسودة' : 'نشط';
    const statusClass = p.status === 'draft' ? 'badge-warning' : 'badge-success';
    const priceDisplay = p.salePrice && p.salePrice < p.basePrice
      ? `<span style="font-weight:700">${formatPrice(p.salePrice)}</span> <span style="text-decoration:line-through;color:#999;font-size:0.8rem">${formatPrice(p.basePrice)}</span>`
      : `<span style="font-weight:700">${formatPrice(p.basePrice)}</span>`;

    return `
      <tr data-id="${p._id}" style="cursor:pointer" onclick="onRowClick(event, '${p._id}')">
        <td class="drag-handle" style="width:30px; cursor:grab; color:#94a3b8; text-align:center;" onclick="event.stopPropagation()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </td>
        <td style="width:40px;text-align:center" onclick="event.stopPropagation()">
          <input type="checkbox" class="product-checkbox" value="${p._id}" 
            ${selectedProductIds.has(p._id) ? 'checked' : ''} 
            onchange="handleProductSelect('${p._id}', this.checked)">
        </td>
        <td>
          ${mainImg
        ? `<img src="${mainImg}" alt="${p.name}" style="width:54px;height:54px;border-radius:8px;object-fit:cover;border:1px solid var(--border-color)">`
        : `<div style="width:54px;height:54px;border-radius:8px;background:var(--bg-body);display:flex;align-items:center;justify-content:center;font-size:1.4rem"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`}
        </td>
        <td>
          <div style="font-weight:600; font-size:0.95rem; margin-bottom:4px">${p.name || 'بدون اسم'}</div>
          <div class="mobile-price-show" style="display:none; font-size:0.85rem; color:var(--primary); font-weight:700">${priceDisplay}</div>
        </td>
        <td>${priceDisplay}</td>
        <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      </tr>
    `}).join('');

  const selectAll = document.getElementById('select-all');
  if (selectAll) selectAll.checked = false;

  // Update header to match columns
  const header = document.querySelector('.products-table thead tr');
  if (header && header.children.length === 5) {
     const th = document.createElement('th');
     th.style.width = '30px';
     header.insertBefore(th, header.firstChild);
  }
}

window.onRowClick = function (event, productId) {
  window.location.href = `product-form?id=${productId}`;
};

window.toggleProductActive = async function (id, active) {
  try {
    const status = active ? 'active' : 'draft';
    await api.updateProduct(id, { active, status });
    showToast('تم تحديث حالة المنتج');
  } catch (err) {
    showToast(err.message, 'error');
    loadProducts();
  }
};

window.toggleSelectAll = function () {
  const selectAll = document.getElementById('select-all');
  const checkboxes = document.querySelectorAll('.product-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked;
    if (selectAll.checked) selectedProductIds.add(cb.value);
    else selectedProductIds.delete(cb.value);
  });
  updateBulkActions();
};

window.unselectAll = function () {
  selectedProductIds.clear();
  const selectAll = document.getElementById('select-all');
  if (selectAll) selectAll.checked = false;
  const checkboxes = document.querySelectorAll('.product-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  updateBulkActions();
};

window.handleProductSelect = function (pid, checked) {
  if (checked) selectedProductIds.add(pid);
  else selectedProductIds.delete(pid);
  updateBulkActions();
};

window.updateBulkActions = function () {
  const bulkBar = document.getElementById('bulk-actions-bar');
  const badge = document.getElementById('selected-count-badge');
  if (bulkBar) {
    if (selectedProductIds.size > 0) {
      bulkBar.style.display = 'flex';
      if (badge) badge.textContent = selectedProductIds.size;
    } else {
      bulkBar.style.display = 'none';
      const menu = document.getElementById('bulk-menu');
      if (menu) menu.style.display = 'none';
    }
  }
};

window.toggleBulkMenu = function (e) {
  e.stopPropagation();
  const menu = document.getElementById('bulk-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

document.addEventListener('click', (e) => {
  const menu = document.getElementById('bulk-menu');
  if (menu && menu.style.display === 'block' && !e.target.closest('#bulk-menu') && !e.target.closest('.btn-secondary')) {
    menu.style.display = 'none';
  }
});

window.bulkAction = async function (action) {
  const checkboxes = document.querySelectorAll('.product-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => cb.value);
  if (!ids.length) return;

  const menu = document.getElementById('bulk-menu');
  if (menu) menu.style.display = 'none';

  if (action === 'delete') {
    const confirmed = await window.showConfirmModal('تأكيد الحذف', `هل أنت متأكد من حذف ${ids.length} منتج نهائياً؟`);
    if (!confirmed) return;
    try {
      await api.deleteProductsBatch(ids);
      showToast('تم حذف المنتجات بنجاح');
      loadProducts();
    } catch (err) {
      showToast(err.message || 'فشل حذف المنتجات', 'error');
    }
  } else if (action === 'draft' || action === 'active') {
    const statusText = action === 'draft' ? 'مسودة' : 'نشط';
    const confirmed = await window.showConfirmModal('تأكيد التحديث', `هل أنت متأكد من تغيير حالة ${ids.length} منتج إلى ${statusText}؟`);
    if (!confirmed) return;

    showToast('جاري التحديث...', 'info');
    let hasError = false;
    for (const id of ids) {
      try {
        await api.updateProduct(id, { active: action === 'active', status: action });
      } catch (e) {
        hasError = true;
      }
    }
    if (hasError) showToast('حدث خطأ أثناء تحديث بعض المنتجات', 'warning');
    else showToast('تم التحديث بنجاح');

    loadProducts();
  }
};

let searchDebounce;
window.filterProductsClient = function () {
  searchQuery = document.getElementById('product-search').value;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    currentPage = 1;
    loadProducts();
  }, 400);
};

window.setFilter = function (f) {
  currentFilter = f;
  currentPage = 1;
  document.querySelectorAll('.order-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === f);
  });
  loadProducts();
};

window.deleteProduct = async function (id, name) {
  const confirmed = await window.showConfirmModal('تأكيد الحذف', `هل أنت متأكد من حذف المنتج "${name}"؟`);
  if (!confirmed) return;
  try {
    await api.deleteProduct(id);
    showToast('تم حذف المنتج');
    loadProducts();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── CSV Import Modal ───────────────────────────────────
window.openBulkImportModal = function () {
  document.getElementById('bulk-import-modal').style.display = 'flex';
  document.getElementById('csv-progress').classList.add('hidden');
  document.getElementById('csv-import-btn').disabled = false;
  const fileInput = document.getElementById('csv-file-input');
  if (fileInput) fileInput.value = '';
};

window.closeBulkImportModal = function () {
  document.getElementById('bulk-import-modal').style.display = 'none';
};

window.submitCSVImport = async function () {
  const fileInput = document.getElementById('csv-file-input');
  const cleanCheckbox = document.getElementById('csv-clean-checkbox');
  const collectionsCheckbox = document.getElementById('csv-collections-checkbox');
  const progressEl = document.getElementById('csv-progress');
  const progressBar = document.getElementById('csv-progress-bar');
  const progressText = document.getElementById('csv-progress-text');
  const importBtn = document.getElementById('csv-import-btn');

  if (!fileInput.files || !fileInput.files[0]) {
    showToast('اختر ملف CSV أولاً', 'error');
    return;
  }

  const file = fileInput.files[0];
  if (!file.name.endsWith('.csv')) {
    showToast('يجب أن يكون الملف بصيغة CSV', 'error');
    return;
  }

  importBtn.disabled = true;
  progressEl.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressText.textContent = 'جاري التحميل...';

  try {
    const res = await api.importProducts(file, cleanCheckbox.checked, collectionsCheckbox.checked, (percent) => {
      progressBar.style.width = percent + '%';
      progressText.textContent = `جاري رفع الملف... ${percent}%`;
    });

    progressBar.style.width = '100%';
    progressText.textContent = '✅ ' + (res.message || 'تم الاستيراد بنجاح!');
    showToast(res.message || 'تم استيراد المنتجات بنجاح');

    setTimeout(() => {
      closeBulkImportModal();
      loadProducts();
    }, 1500);

  } catch (err) {
    progressBar.style.width = '0%';
    progressText.textContent = '❌ فشل الاستيراد: ' + (err.message || 'خطأ غير معروف');
    showToast('فشل استيراد الملف: ' + err.message, 'error');
    importBtn.disabled = false;
  }
};
