let productsSortable = null;

/** Admin products list page */
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAdmin()) return;
  document.body.classList.add('is-loading');
  loadProducts();

  // Global save/discard handle for potential future use (though reordering is disabled)
  window.handleGlobalSave = async () => {
     return true;
  };

  window.handleGlobalDiscard = () => {
    loadProducts();
  };
});

let allProducts = [];
let currentPage = 1;
let totalPages = 1;
let currentLimit = 30;
let searchQuery = '';
let currentFilter = 'active';
let selectedProductIds = new Set(); 

async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center"><div class="spinner"></div></td></tr>';
  try {
    // Pass the current filter directly as the status parameter
    const statusParam = currentFilter;
    
    const [res, collections] = await Promise.all([
      api.getProducts(currentPage, currentLimit, true, '', searchQuery, '', statusParam),
      api.getCollections().catch(() => [])
    ]);
    
    let products = res.products || res;
    totalPages = res.totalPages || 1;

    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:40px">لا توجد منتجات مطابقة للبحث</td></tr>';
      updatePaginationInfo(0);
      document.body.classList.remove('is-loading');
      return;
    }

    allProducts = products;
    renderProducts(collections);
    document.body.classList.remove('is-loading');
    
    // Fetch total counts for specific tabs
    const [activeRes, draftRes] = await Promise.all([
      api.getProducts(1, 1, true, '', '', '', 'active'),
      api.getProducts(1, 1, true, '', '', '', 'draft')
    ]);
    
    updatePaginationInfo(res.total || products.length, activeRes.total, draftRes.total);
    updateBulkActions();

  } catch (err) {
    console.error('Failed to load products:', err);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">فشل تحميل المنتجات</td></tr>';
  }
}

function updatePaginationInfo(total, countAllTotal, countDraftTotal) {
  const infoEl = document.getElementById('pagination-info');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageDropdown = document.getElementById('page-dropdown');
  const limitDropdown = document.getElementById('items-per-page');

  if (infoEl) infoEl.textContent = `إجمالي: ${total} - صفحة ${currentPage} من ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  
  const countAll = document.getElementById('count-all');
  const countDraft = document.getElementById('count-draft');

  if (countAll && countAllTotal !== undefined) countAll.textContent = countAllTotal;
  if (countDraft && countDraftTotal !== undefined) countDraft.textContent = countDraftTotal;

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
    const isInactive = p.status === 'draft' || p.active === false;
    const statusLabel = isInactive ? 'مؤرشف' : 'نشط';
    const statusClass = isInactive ? 'badge-warning' : 'badge-success';
    const priceDisplay = p.salePrice && p.salePrice < p.basePrice
      ? `<span style="font-weight:700">${formatPrice(p.salePrice)}</span> <span style="text-decoration:line-through;color:#999;font-size:0.8rem">${formatPrice(p.basePrice)}</span>`
      : `<span style="font-weight:700">${formatPrice(p.basePrice)}</span>`;

    return `
      <tr data-id="${p._id}" style="cursor:pointer" onclick="onRowClick(event, '${p._id}')">
        <td style="width:40px;text-align:center" onclick="event.stopPropagation()">
          <input type="checkbox" class="product-checkbox" value="${p._id}" 
            ${selectedProductIds.has(p._id) ? 'checked' : ''} 
            onchange="handleProductSelect('${p._id}', this.checked)">
        </td>
        <td style="width:60px; text-align:center;">
          ${mainImg
        ? `<img src="${mainImg}" alt="${p.name}" style="width:50px;height:50px;border-radius:10px;object-fit:contain;border:1px solid var(--border-color)">`
        : `<div style="width:50px;height:50px;border-radius:10px;background:var(--bg-body);display:flex;align-items:center;justify-content:center;font-size:1.2rem"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`}
        </td>
        <td style="text-align: right; padding-right: 12px;">
          <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name || 'بدون اسم'}</div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div style="font-size:0.85rem; color:var(--primary); font-weight:700">${priceDisplay}</div>
            <span class="badge ${statusClass}" style="font-size: 0.65rem; padding: 1px 6px;">${statusLabel}</span>
            <span style="font-size: 0.75rem; color: #64748b;">(Qty: ${p.quantity !== null && p.quantity !== undefined ? p.quantity : '∞'})</span>
          </div>
        </td>
      </tr>
    `}).join('');

  const selectAll = document.getElementById('select-all');
  if (selectAll) selectAll.checked = false;
}

window.onRowClick = function (event, productId) {
  window.location.href = `product-form?id=${productId}`;
};

window.toggleProductActive = async function (id, active) {
  try {
    const status = active ? 'active' : 'draft';
    await api.updateProduct(id, { active, status });
    showToast('تم تحديث حالة المنتج');
    loadProducts(); // Reload to reflect changes and potentially move to top
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
  const ids = Array.from(selectedProductIds);
  if (!ids.length) return;

  const menu = document.getElementById('bulk-menu');
  if (menu) menu.style.display = 'none';

  const bulkBtn = document.querySelector('.btn-bulk-action'); // The trigger button
  const oldContent = bulkBtn ? bulkBtn.innerHTML : '';

  if (action === 'delete') {
    const confirmed = await window.showConfirmModal('تأكيد الحذف', `هل أنت متأكد من حذف ${ids.length} منتج نهائياً؟`);
    if (!confirmed) return;
    
    if (bulkBtn) {
      bulkBtn.disabled = true;
      bulkBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;display:inline-block;vertical-align:middle;"></span> جاري الحذف...';
    }

    try {
      await api.deleteProductsBatch(ids);
      showToast('تم حذف المنتجات بنجاح');
      unselectAll();
      loadProducts();
    } catch (err) {
      showToast(err.message || 'فشل حذف المنتجات', 'error');
      if (bulkBtn) {
        bulkBtn.disabled = false;
        bulkBtn.innerHTML = oldContent;
      }
    }
  } else if (action === 'draft' || action === 'active') {
    const statusText = action === 'draft' ? 'مسودة' : 'نشط';
    const confirmed = await window.showConfirmModal('تأكيد التحديث', `هل أنت متأكد من تغيير حالة ${ids.length} منتج إلى ${statusText}؟`);
    if (!confirmed) return;

    if (bulkBtn) {
      bulkBtn.disabled = true;
      bulkBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;display:inline-block;vertical-align:middle;"></span> جاري التحديث...';
    }

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

    unselectAll();
    loadProducts();
    
    if (bulkBtn) {
      bulkBtn.disabled = false;
      bulkBtn.innerHTML = oldContent;
    }
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

window.exportProductsJSON = async function() {
  try {
    showToast('جاري تحضير ملف التصدير...');
    // Fetch all products (passing a very large limit to get everything)
    const res = await api.getProducts(1, 5000, true);
    const products = res.products || res || [];
    
    if (!products.length) {
      showToast('لا توجد منتجات لتصديرها', 'error');
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(products, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `products_export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    showToast('تم تصدير المنتجات بنجاح');
  } catch (err) {
    console.error('Export failed:', err);
    showToast('فشل تصدير المنتجات: ' + err.message, 'error');
  }
};
