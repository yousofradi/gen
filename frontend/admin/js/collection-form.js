let collectionId = new URLSearchParams(window.location.search).get('id');
let collectionProducts = [];
let allProducts = [];
let sortableList = null;
let originalCollection = null;
let selectedCollectionProductIds = new Set(); // Persistent selection for bulk actions

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAdmin()) return;
  document.body.classList.add('is-loading');

  try {
    await loadAllProducts();

    if (collectionId) {
      document.title = 'تعديل التصنيف — Admin';
      const formTitle = document.getElementById('form-page-title');
      if (formTitle) formTitle.textContent = 'تعديل التصنيف';
      await loadCollection(collectionId);
    } else {
      document.title = 'إضافة تصنيف — Admin';
      const formTitle = document.getElementById('form-page-title');
      if (formTitle) formTitle.textContent = 'إضافة تصنيف';
      originalCollection = null;
      populateCollectionForm(null);
    }
  } finally {
    document.body.classList.remove('is-loading');
  }

  document.getElementById('collection-form').addEventListener('submit', saveCollection);
  document.getElementById('products-search').addEventListener('input', filterCollectionProducts);
  document.getElementById('available-search').addEventListener('input', filterAvailableProducts);

  // Auto-slugify
  document.getElementById('c-name').addEventListener('input', (e) => {
    if (!collectionId) {
      const name = e.target.value;
      const slug = name.trim().toLowerCase()
        .replace(/[^\w\u0621-\u064A\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      document.getElementById('c-url').value = slug;
    }
  });

  window.handleGlobalSave = async () => {
    // Trigger form submit
    const form = document.getElementById('collection-form');
    if (form) {
      const event = new Event('submit', { cancelable: true, bubbles: true });
      form.dispatchEvent(event);
    }
    return true;
  };

  window.handleGlobalDiscard = () => {
    populateCollectionForm(originalCollection ? JSON.parse(JSON.stringify(originalCollection)) : null);
    if (window.hideBar) window.hideBar();
  };
});

async function loadAllProducts() {
  try {
    const res = await api.getProducts(1, 1000, true);
    allProducts = res.products ? res.products : res;
  } catch (e) {
    showToast('فشل تحميل المنتجات', 'error');
  }
}

async function loadCollection(id) {
  try {
    const col = await api.getCollection(id);
    originalCollection = JSON.parse(JSON.stringify(col));
    populateCollectionForm(col);
  } catch (e) {
    showToast('فشل تحميل المجموعة', 'error');
  }
}

function populateCollectionForm(col) {
  if (!col) {
    document.getElementById('c-name').value = '';
    document.getElementById('c-url').value = '';
    document.getElementById('c-image').value = '';
    document.getElementById('c-desc').innerHTML = '';
    updateImagePreview('');
    collectionProducts = [];
    renderProductsList();
    return;
  }
  document.getElementById('c-name').value = col.name;
  document.getElementById('c-url').value = col.urlName || '';
  document.getElementById('c-image').value = col.imageUrl || '';
  document.getElementById('c-desc').innerHTML = col.description || '';
  updateImagePreview(col.imageUrl || '');

  // Get products for this collection
  const associatedProducts = allProducts.filter(p => (p.collectionId === col._id || (p.collectionIds && p.collectionIds.includes(col._id))));
  
  if (col.productOrder && col.productOrder.length > 0) {
    // Sort based on saved productOrder
    const orderMap = {};
    col.productOrder.forEach((id, idx) => orderMap[id] = idx);
    collectionProducts = associatedProducts.sort((a, b) => {
      const idxA = orderMap[a._id] !== undefined ? orderMap[a._id] : 9999;
      const idxB = orderMap[b._id] !== undefined ? orderMap[b._id] : 9999;
      return idxA - idxB;
    });
  } else {
    collectionProducts = associatedProducts;
  }
  
  renderProductsList();
}

function updateImagePreview(url) {
  const container = document.getElementById('image-preview-container');
  if (url) {
    container.innerHTML = `<img src="${url}" alt="Collection Image">`;
  } else {
    container.innerHTML = `<span style="color:#aaa">لا توجد صورة</span>`;
  }
}

window.promptImage = function () {
  document.getElementById('modal-image-url').value = document.getElementById('c-image').value || '';
  document.getElementById('image-url-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeImageModal = function () {
  document.getElementById('image-url-modal').classList.add('hidden');
  document.body.style.overflow = '';
};

window.applyImageUrl = function (btn) {
  if (btn) btn.disabled = true;
  const url = document.getElementById('modal-image-url').value.trim();
  if (url) {
    document.getElementById('c-image').value = url;
    updateImagePreview(url);
    if (window.markAsModified) window.markAsModified();
  }
  closeImageModal();
};

window.removeImage = function () {
  document.getElementById('c-image').value = '';
  updateImagePreview('');
  if (window.markAsModified) window.markAsModified();
};

window.uploadCollectionImage = function (files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  const progressContainer = document.getElementById('upload-progress');
  const progressBar = progressContainer ? progressContainer.querySelector('.upload-progress-bar-fill') : null;
  const progressText = document.getElementById('upload-progress-text');

  if (progressContainer) progressContainer.style.display = 'block';

  api.uploadFile(file, (percent) => {
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressText) progressText.textContent = `رفع ${percent}%`;
  }).then(res => {
    if (res && res.url) {
      document.getElementById('c-image').value = res.url;
      updateImagePreview(res.url);
      if (window.markAsModified) window.markAsModified();
    }
  }).catch(err => {
    console.error('Upload failed', err);
    showToast('فشل رفع الصورة', 'error');
  }).finally(() => {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '';
    document.getElementById('collection-image-upload').value = ''; // reset input
  });
};

function renderProductsList(productsToRender = collectionProducts) {
  document.getElementById('products-count').textContent = collectionProducts.length;
  const list = document.getElementById('collection-products-list');

  if (productsToRender.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:#999">لا توجد منتجات في هذه المجموعة</div>';
    if (sortableList) sortableList.destroy();
    return;
  }

  list.innerHTML = productsToRender.filter(p => p.status !== 'draft').map(p => {
    const isSelected = selectedCollectionProductIds.has(p._id);
    const inStock = p.stock > 0 || (p.variants && p.variants.some(v => v.stock > 0));
    
    return `
    <div class="product-row ${isSelected ? 'selected-for-drag' : ''}" data-id="${p._id}" style="transition: background 0.2s;">
      <div style="display:flex; align-items:center; gap:12px;">
        <input type="checkbox" class="product-select-cb collection-checkbox" data-id="${p._id}" 
          ${isSelected ? 'checked' : ''}
          onchange="handleProductSelect('${p._id}', this.checked)">
        <div class="btn-reorder" style="cursor:grab; color:#94a3b8;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
      </div>
      <img src="${p.imageUrl || p.images?.[0] || ''}" onerror="this.style.display='none'" style="width:48px; height:48px; border-radius:8px; object-fit:cover; border:1px solid #f1f5f9;">
      <div style="flex:1;">
        <div style="font-weight:600; font-size:0.95rem; color:#1e293b; margin-bottom:4px;">${p.name}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span style="font-size:0.75rem; padding:2px 8px; border-radius:12px; background:${p.active ? '#f0fdf4' : '#fef2f2'}; color:${p.active ? '#16a34a' : '#dc2626'}; font-weight:600; display:flex; align-items:center; gap:4px; cursor:pointer;" onclick="toggleProductRowStatus('${p._id}', ${!p.active})">
            <span style="width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
            ${p.active ? 'نشط' : 'غير نشط'}
          </span>
          <span style="font-size:0.75rem; padding:2px 8px; border-radius:12px; background:${inStock ? '#eff6ff' : '#fff7ed'}; color:${inStock ? '#2563eb' : '#ea580c'}; font-weight:600;">
            ${inStock ? 'في المخزون' : 'نفذ من المخزن'}
          </span>
        </div>
      </div>
      <button type="button" class="btn-remove" onclick="removeProductFromCollection('${p._id}')" style="background:#f1f5f9; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#94a3b8; border:none; transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'; this.style.color='#ef4444'" onmouseout="this.style.background='#f1f5f9'; this.style.color='#94a3b8'">×</button>
    </div>
    `;
  }).join('');

  if (sortableList) sortableList.destroy();
  sortableList = new Sortable(list, {
    handle: '.btn-reorder',
    animation: 150,
    multiDrag: true,
    selectedClass: 'selected-for-drag',
    // Set initial selection
    onChoose: function(evt) {
      // Sync Sortable selection with our checkboxes when starting a drag
      const selectedIds = Array.from(selectedCollectionProductIds);
      document.querySelectorAll('.product-row').forEach(row => {
        const id = row.getAttribute('data-id');
        if (selectedIds.includes(id)) {
          Sortable.utils.select(row);
        } else {
          Sortable.utils.deselect(row);
        }
      });
    },
    onEnd: function (evt) {
      // Re-sync array based on DOM after multi-drag
      const rows = Array.from(list.children);
      const newOrderIds = rows.map(r => r.getAttribute('data-id'));
      
      const draftIds = collectionProducts.filter(p => p.status === 'draft').map(p => p._id);
      const combinedIds = [...newOrderIds, ...draftIds];
      
      collectionProducts = combinedIds.map(id => allProducts.find(p => p._id === id)).filter(Boolean);
      
      if (window.markAsModified) window.markAsModified();
      
      // Update the count badge if needed (though it usually disappears on end)
      const badges = document.querySelectorAll('.drag-badge');
      badges.forEach(b => b.remove());
    },
    // Custom ghost for multi-drag count
    setData: function (dataTransfer, dragEl) {
      const selectedCount = selectedCollectionProductIds.size || 1;
      if (selectedCount > 1) {
        const badge = document.createElement('div');
        badge.className = 'drag-badge';
        badge.textContent = selectedCount;
        badge.style.cssText = `
          position: absolute;
          top: -10px;
          right: -10px;
          background: #3b82f6;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          z-index: 1000;
        `;
        dragEl.style.position = 'relative';
        dragEl.appendChild(badge);
      }
    }
  });
}

function filterCollectionProducts(e) {
  const q = e.target.value.toLowerCase();
  const filtered = collectionProducts.filter(p => p.name.toLowerCase().includes(q));
  renderProductsList(filtered);
}

window.removeProductFromCollection = async function (id) {
  collectionProducts = collectionProducts.filter(p => p._id !== id);
  renderProductsList();
  if (window.markAsModified) window.markAsModified();
};

/* --- Select Products Modal --- */

window.openSelectModal = function () {
  document.getElementById('select-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderSelectModalLists();
};

window.closeSelectModal = function () {
  document.getElementById('select-modal').classList.add('hidden');
  document.body.style.overflow = '';
};

function renderSelectModalLists(query = '') {
  const selectedBox = document.getElementById('selected-products-box');
  const availableBox = document.getElementById('available-products-box');

  selectedBox.innerHTML = collectionProducts.map(p => `
    <div class="product-item">
      <button type="button" class="btn-remove" onclick="toggleProductSelect('${p._id}', false)">×</button>
      <div style="flex:1;font-size:0.9rem">${p.name}</div>
      <img src="${p.imageUrl || p.images?.[0] || ''}" style="width:30px;height:30px;object-fit:contain;border-radius:4px">
    </div>
  `).join('');

  const available = allProducts.filter(p => !collectionProducts.some(cp => cp._id === p._id) && p.status !== 'draft');
  const filteredAvailable = query ? available.filter(p => p.name.toLowerCase().includes(query)) : available;

  availableBox.innerHTML = filteredAvailable.map(p => `
    <div class="product-item">
      <button type="button" style="color:green;background:none;border:none;font-size:1.2rem;cursor:pointer" onclick="toggleProductSelect('${p._id}', true)">+</button>
      <div style="flex:1;font-size:0.9rem">${p.name}</div>
      <img src="${p.imageUrl || p.images?.[0] || ''}" style="width:30px;height:30px;object-fit:contain;border-radius:4px">
    </div>
  `).join('');
}

window.toggleProductSelect = async function (id, add) {
  if (add) {
    const p = allProducts.find(p => p._id === id);
    if (p) collectionProducts.unshift(p);
  } else {
    collectionProducts = collectionProducts.filter(p => p._id !== id);
  }
  renderSelectModalLists(document.getElementById('available-search').value.toLowerCase());
  if (window.markAsModified) window.markAsModified();
};

function filterAvailableProducts(e) {
  renderSelectModalLists(e.target.value.toLowerCase());
}

window.saveSelectedProducts = function (btn) {
  if (btn) btn.disabled = true;
  renderProductsList();
  closeSelectModal();
};

window.updateProductSelectionUI = function() {
  const bar = document.getElementById('collection-bulk-bar');
  if (bar) {
    bar.style.display = selectedCollectionProductIds.size > 0 ? 'flex' : 'none';
    const countEl = document.getElementById('selected-products-count');
    if (countEl) countEl.textContent = selectedCollectionProductIds.size;
  }
};

window.handleProductSelect = function (pid, checked) {
  if (checked) selectedCollectionProductIds.add(pid);
  else selectedCollectionProductIds.delete(pid);
  
  const row = document.querySelector(`.product-row[data-id="${pid}"]`);
  if (row) {
    if (checked) row.classList.add('selected-for-drag');
    else row.classList.remove('selected-for-drag');
  }

  updateProductSelectionUI();
};

window.toggleSelectAllProducts = function(masterCb) {
  const cbs = document.querySelectorAll('.product-select-cb');
  cbs.forEach(cb => {
    cb.checked = masterCb.checked;
    const pid = cb.getAttribute('data-id');
    const row = cb.closest('.product-row');
    if (masterCb.checked) {
      selectedCollectionProductIds.add(pid);
      if (row) row.classList.add('selected-for-drag');
    } else {
      selectedCollectionProductIds.delete(pid);
      if (row) row.classList.remove('selected-for-drag');
    }
  });
  updateProductSelectionUI();
};

window.bulkRemoveProducts = async function() {
  const selected = document.querySelectorAll('.product-select-cb:checked');
  if (selected.length === 0) return;

  const confirmed = await window.showConfirmModal('إزالة المنتجات', `هل أنت متأكد من إزالة ${selectedCollectionProductIds.size} منتجات من هذه المجموعة؟`);
  if (!confirmed) return;

  const idsToRemove = Array.from(selectedCollectionProductIds);
  collectionProducts = collectionProducts.filter(p => !idsToRemove.includes(p._id));
  selectedCollectionProductIds.clear();
  
  renderProductsList();
  updateProductSelectionUI();
  if (window.markAsModified) window.markAsModified();
};

window.bulkUpdateStatus = async function(active) {
  if (selectedCollectionProductIds.size === 0) return;

  const ids = Array.from(selectedCollectionProductIds);
  
  // Update local state
  collectionProducts.forEach(p => {
    if (ids.includes(p._id)) p.active = active;
  });

  renderProductsList();
  updateProductSelectionUI();
  if (window.markAsModified) window.markAsModified();
  showToast(`تم ${active ? 'تفعيل' : 'تعطيل'} المنتجات المحددة`);
};

window.toggleProductRowStatus = function(id, newStatus) {
  const selectedIds = Array.from(selectedCollectionProductIds);
  
  if (selectedIds.includes(id)) {
    // If the clicked row is selected, apply to all selected
    collectionProducts.forEach(p => {
      if (selectedIds.includes(p._id)) p.active = newStatus;
    });
    showToast(`تم ${newStatus ? 'تفعيل' : 'تعطيل'} ${selectedIds.length} منتجات`);
  } else {
    // Just this row
    const p = collectionProducts.find(x => x._id === id);
    if (p) p.active = newStatus;
  }
  
  renderProductsList();
  updateProductSelectionUI();
  if (window.markAsModified) window.markAsModified();
};

window.openReorderModal = function () {
  showToast('يمكنك سحب وإفلات المنتجات في القائمة للترتيب', 'info');
};

async function autoSaveCollection() {
  if (!collectionId) return;
  const data = {
    name: document.getElementById('c-name').value.trim(),
    urlName: document.getElementById('c-url').value.trim() || undefined,
    imageUrl: document.getElementById('c-image').value,
    description: document.getElementById('c-desc').innerHTML.trim(),
    productOrder: collectionProducts.map(p => p._id)
  };

  try {
    const savedCol = await api.updateCollection(collectionId, data);
    
    // Also update products collection batch if needed
    // In auto-save we only update the collection metadata (name, order, etc)
    // The actual product-to-collection mapping might need an extra call if it's a new product added
    
    // Update products mapping
    const productIds = collectionProducts.map(p => p._id);
    await api._request(`/products/collection/batch`, {
      method: 'PUT',
      body: JSON.stringify({
        productIds: productIds,
        collectionId: collectionId,
        action: 'set'
      }),
      admin: true
    });

    originalCollection = JSON.parse(JSON.stringify(savedCol));
    if (window.hideBar) window.hideBar();
    showToast('تم الحفظ تلقائياً');
  } catch (err) {
    console.error('Auto-save failed', err);
    showToast('فشل الحفظ التلقائي', 'error');
  }
}

async function saveCollection(e) {
  e.preventDefault();
  const btn = document.getElementById('header-save-btn') || e.target.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'جارٍ الحفظ...';
  }
  const data = {
    name: document.getElementById('c-name').value.trim(),
    urlName: document.getElementById('c-url').value.trim() || undefined,
    imageUrl: document.getElementById('c-image').value,
    description: document.getElementById('c-desc').innerHTML.trim(),
    productOrder: collectionProducts.map(p => p._id)
  };

  try {
    if (collectionId) {
      savedCol = await api.updateCollection(collectionId, data);
      showToast('تم التحديث بنجاح');
    } else {
      savedCol = await api.createCollection(data);
      collectionId = savedCol._id;
      showToast('تم الإنشاء بنجاح');
      
      const formTitle = document.getElementById('form-page-title');
      if (formTitle) formTitle.textContent = 'تعديل التصنيف';
      document.title = 'تعديل التصنيف — Admin';
      const newUrl = 'collection-form.html?id=' + collectionId;
      setTimeout(() => window.location.href = newUrl, 1000);
    }

    // Now update products collection bulk
    const productIds = collectionProducts.map(p => p._id);
    await api._request(`/products/collection/batch`, {
      method: 'PUT',
      body: JSON.stringify({
        productIds: productIds,
        collectionId: collectionId,
        action: 'set'
      }),
      admin: true
    });

    originalCollection = JSON.parse(JSON.stringify(savedCol));
    if (window.hideBar) window.hideBar();

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'حفظ التصنيف';
    }
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'حفظ التصنيف';
    }
  }
}
