/** Admin product form — create/edit */
let optionGroups = [];
let variants = []; // New hierarchical variants
let editId = null;
let productImages = [];
let allCollections = [];
let selectedCollectionIds = [];
let optionEditModes = [];
let originalProductData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAdmin()) return;
  const params = new URLSearchParams(window.location.search);
  editId = params.get('id');

  document.body.classList.add('is-loading');

  try {
    const [collections, product] = await Promise.all([
      api.getCollections().catch(() => []),
      editId ? api.getProduct(editId) : Promise.resolve(null)
    ]);

    allCollections = collections;
    initCollectionSelect();

    if (product) {
      originalProductData = JSON.parse(JSON.stringify(product));
      populateProductForm(product);
    } else {
      originalProductData = null;
      populateProductForm(null);
    }
    document.body.classList.remove('is-loading');
  } catch (err) {
    console.error('Error loading page data:', err);
    showToast('فشل تحميل البيانات', 'error');
    document.body.classList.remove('is-loading');
  }

  const productForm = document.getElementById('product-form');
  if (productForm) {
    productForm.addEventListener('submit', saveProduct);

    // Global Save Handler for the unsaved changes bar
    window.handleGlobalSave = async () => {
      // Trigger the form submit
      const event = new Event('submit', { cancelable: true, bubbles: true });
      productForm.dispatchEvent(event);
      return true; // We assume success or toast will handle error
    };

    window.handleGlobalDiscard = () => {
      populateProductForm(originalProductData ? JSON.parse(JSON.stringify(originalProductData)) : null);
      if (window.hideBar) window.hideBar();
    };
  }

  // Delete button logic
  const deleteBtn = document.getElementById('delete-btn');
  if (deleteBtn && editId) {
    deleteBtn.style.display = 'block';
    deleteBtn.addEventListener('click', deleteCurrentProduct);
  }

  const addOptBtn = document.getElementById('add-option-group');
  if (addOptBtn) addOptBtn.addEventListener('click', addOptionGroup);

  const enableVarCheck = document.getElementById('enable-variants');
  if (enableVarCheck) {
    enableVarCheck.addEventListener('change', (e) => {
      document.getElementById('variant-setup-container').style.display = e.target.checked ? 'block' : 'none';
      if (e.target.checked && optionGroups.length === 0) addOptionGroup();
    });
  }

  const bulkBtn = document.getElementById('bulk-edit-btn');
  if (bulkBtn) bulkBtn.style.display = 'none';

  const confirmBulkBtn = document.getElementById('confirm-bulk-edit');
  if (confirmBulkBtn) confirmBulkBtn.style.display = 'none';

  // File upload logic
  const fileInput = document.getElementById('image-file-input');
  const dropzone = document.getElementById('add-image-dropzone');

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--primary)'; });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.style.borderColor = ''; });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '';
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files) handleFiles(e.target.files);
      e.target.value = '';
    });
  }

  function handleFiles(files) {
    const progressContainer = document.getElementById('upload-progress');
    const progressBar = progressContainer ? progressContainer.querySelector('.upload-progress-bar-fill') : null;
    const progressText = document.getElementById('upload-progress-text');
    if (progressContainer) progressContainer.style.display = 'flex';

    const promises = Array.from(files).map(file =>
      api.uploadFile(file, (percent) => {
        if (progressBar) progressBar.style.width = percent + '%';
        if (progressText) progressText.textContent = `رفع ${percent}%`;
      }).then(res => {
        if (res && res.url) productImages.push(res.url);
      }).catch(err => {
        console.error('Upload failed', err);
        showToast('فشل رفع الصورة', 'error');
      })
    );

    Promise.all(promises).then(() => {
      renderImages();
      if (progressContainer) progressContainer.style.display = 'none';
      if (progressBar) progressBar.style.width = '0%';
      if (progressText) progressText.textContent = '';
    });
  }

  function initCollectionSelect() {
    const trigger = document.getElementById('p-collections-trigger');
    const searchInput = document.getElementById('p-collections-search');
    const dropdown = document.getElementById('p-collections-dropdown');
    const tagsContainer = document.getElementById('selected-collections-tags');
    const hiddenInput = document.getElementById('p-collections-hidden');

    function renderTags() {
      tagsContainer.innerHTML = selectedCollectionIds.map(id => {
        const col = allCollections.find(c => c._id === id);
        if (!col) return '';
        return `<div class="tag">${col.name}<span class="tag-remove" onclick="removeCollectionTag('${id}')">×</span></div>`;
      }).join('');
      hiddenInput.value = JSON.stringify(selectedCollectionIds);
    }

    window.removeCollectionTag = (id) => {
      selectedCollectionIds = selectedCollectionIds.filter(cid => cid !== id);
      renderTags();
      renderOptions();
    };

    // Auto-sync variants price when base price changes
    const pPrice = document.getElementById('p-price');
    const pSalePrice = document.getElementById('p-sale-price');

    if (pPrice) {
      pPrice.addEventListener('input', () => {
        validateMainProductPrices();
      });
      pPrice.addEventListener('change', () => {
        const val = Number(pPrice.value) || 0;
        if (variants.length > 0) {
          variants.forEach(v => { v.price = val; });
          renderVariantsTable();
        }
      });
    }
    if (pSalePrice) {
      pSalePrice.addEventListener('input', () => {
        validateMainProductPrices();
      });
      pSalePrice.addEventListener('change', () => {
        const val = pSalePrice.value ? Number(pSalePrice.value) : null;
        if (variants.length > 0) {
          variants.forEach(v => { v.salePrice = val; });
          renderVariantsTable();
        }
      });
    }

    function renderOptions(filter = '') {
      const filtered = allCollections.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
      if (filtered.length === 0) { dropdown.innerHTML = '<div class="no-results">لا توجد نتائج</div>'; return; }
      dropdown.innerHTML = filtered.map(c => {
        const isSelected = selectedCollectionIds.includes(c._id);
        const img = c.imageUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZjFmNWY5Ii8+PC9zdmc+';
        return `
          <div class="select-option ${isSelected ? 'selected' : ''}" onclick="toggleCollection('${c._id}')">
            <img src="${img}" class="option-img" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZjFmNWY5Ii8+PC9zdmc+'">
            <span class="option-name">${c.name}</span>
            ${isSelected ? '<span style="color:var(--primary-color)">✓</span>' : ''}
          </div>
        `;
      }).join('');
    }

    window.toggleCollection = (id) => {
      if (selectedCollectionIds.includes(id)) selectedCollectionIds = selectedCollectionIds.filter(cid => cid !== id);
      else selectedCollectionIds.push(id);
      renderTags();
      renderOptions(searchInput.value);
    };

    if (trigger) trigger.addEventListener('click', () => { dropdown.style.display = 'block'; searchInput.focus(); renderOptions(searchInput.value); });
    if (searchInput) searchInput.addEventListener('input', (e) => renderOptions(e.target.value));
    document.addEventListener('click', (e) => { if (!document.getElementById('p-collections-select').contains(e.target)) dropdown.style.display = 'none'; });
    renderTags();
  }
});


// ── Image Management ────────────────────────────────────

function removeImage(index) {
  productImages.splice(index, 1);
  renderImages();
  if (window.markAsModified) window.markAsModified();
}

let draggedImageIndex = null;

function renderImages() {
  const container = document.getElementById('images-list');
  const addBtn = document.getElementById('add-image-dropzone');

  if (!container || !addBtn) return;

  container.querySelectorAll('.image-item').forEach(el => el.remove());
  productImages.forEach((url, idx) => {
    const item = document.createElement('div');
    item.className = 'image-item';
    item.draggable = true;
    item.dataset.index = idx;
    item.style.cursor = 'grab';

    // Drag-and-drop reordering logic
    item.addEventListener('dragstart', (e) => {
      draggedImageIndex = idx;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.style.opacity = '0.5', 0);
    });
    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      draggedImageIndex = null;
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggedImageIndex !== null && draggedImageIndex !== idx) {
        const draggedImage = productImages[draggedImageIndex];
        productImages.splice(draggedImageIndex, 1);
        productImages.splice(idx, 0, draggedImage);
        renderImages();
      }
    });

    item.innerHTML = `
      <img src="${url}" alt="صورة ${idx + 1}" style="pointer-events: none;" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTEwIiBoZWlnaHQ9IjExMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTEwIiBoZWlnaHQ9IjExMCIgZmlsbD0iI2YxZjVmOSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk0YTNiOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPuKdjCBFcnJvcjwvdGV4dD48L3N2Zz4='">
      <button type="button" class="remove-img" onclick="removeImage(${idx})">×</button>
      ${idx === 0 ? '<span style="position:absolute;bottom:4px;right:4px;background:var(--primary);color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:8px;pointer-events:none;">رئيسية</span>' : ''}
    `;
    container.insertBefore(item, addBtn);
  });
}

// ── Variant Setup (Option Groups) ───────────────────────


function renderOptionSetup() {
  const container = document.getElementById('option-groups-setup');
  container.innerHTML = '';

  optionGroups.forEach((g, gi) => {
    if (optionEditModes[gi] === undefined) optionEditModes[gi] = !g.name;

    const card = document.createElement('div');
    card.className = `variant-group-card ${optionEditModes[gi] ? 'edit-mode' : 'display-mode'}`;

    if (optionEditModes[gi]) {
      // Edit Mode
      card.innerHTML = `
        <div class="variant-group-edit-body">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <div class="drag-handle group-drag-handle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </div>
            <label class="form-label" style="margin:0; white-space:nowrap; font-weight:600;">اسم الخيار</label>
            <input type="text" class="form-control" value="${g.name}" placeholder="مثال: اللون" onchange="updateGroupName(${gi}, this.value)" style="flex:1;">
          </div>
          
          <div id="option-values-${gi}">

            ${g.values.map((v, vi) => `
              <div class="variant-value-row" data-index="${vi}">
                <div class="drag-handle value-drag-handle">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                </div>
                <input type="text" class="form-control" value="${v}" placeholder="قيمة الخيار" onchange="updateValueName(${gi}, ${vi}, this.value)">
                <button type="button" class="btn-remove-value" onclick="removeOptionValue(${gi}, ${vi})" title="حذف">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            `).join('')}
          </div>
          
          <div class="variant-value-row">
            <div class="drag-handle" style="visibility:hidden">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </div>
            <button type="button" class="form-control add-value-btn" style="text-align:center; border:1px dashed var(--border-color); background:#fff; cursor:pointer; color:var(--text-muted); font-size:0.9rem; padding:10px;" onclick="addOptionValue(${gi})">إضافة قيمة أخرى</button>
            <button type="button" class="btn-remove-value" style="visibility:hidden">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
          
          <div class="variant-group-actions">
            <button type="button" class="btn-remove-group" onclick="removeOptionGroup(${gi})">إزالة</button>
            <button type="button" class="btn-save-group" onclick="saveOptionGroup(${gi})">حفظ</button>
          </div>
        </div>
      `;
    } else {
      // Display Mode
      card.innerHTML = `
        <div class="variant-group-body" onclick="editOptionGroup(${gi})">
          <div class="variant-group-display-info">
            <div class="drag-handle group-drag-handle" onclick="event.stopPropagation()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </div>
            <span class="name">${g.name}</span>
          </div>
          <div class="variant-group-display-tags">
            ${g.values.filter(v => v).map(v => `<span class="tag">${v}</span>`).join('')}
          </div>
        </div>
      `;
    }

    container.appendChild(card);




    // Initialize value sortable for this group if in edit mode
    if (optionEditModes[gi]) {
      new Sortable(document.getElementById(`option-values-${gi}`), {
        handle: '.value-drag-handle',
        animation: 150,
        onEnd: (evt) => {
          const vals = [...optionGroups[gi].values];
          const [moved] = vals.splice(evt.oldIndex, 1);
          vals.splice(evt.newIndex, 0, moved);
          optionGroups[gi].values = vals;
          syncVariants();
        }
      });
    }
  });

  // Initialize group sortable
  new Sortable(container, {
    handle: '.group-drag-handle',
    animation: 150,
    onEnd: (evt) => {
      const groups = [...optionGroups];
      const [moved] = groups.splice(evt.oldIndex, 1);
      groups.splice(evt.newIndex, 0, moved);
      optionGroups = groups;

      const modes = [...optionEditModes];
      const [movedMode] = modes.splice(evt.oldIndex, 1);
      modes.splice(evt.newIndex, 0, movedMode);
      optionEditModes = modes;

      syncVariants();
    }
  });
}

window.editOptionGroup = function (gi) {
  optionEditModes[gi] = true;
  renderOptionSetup();
}

window.saveOptionGroup = function (gi) {
  optionEditModes[gi] = false;
  renderOptionSetup();
}


function addOptionGroup() {
  optionGroups.push({ name: '', values: [''] });
  optionEditModes[optionGroups.length - 1] = true;
  renderOptionSetup();
  syncVariants();
}

function removeOptionGroup(gi) {
  optionGroups.splice(gi, 1);
  optionEditModes.splice(gi, 1);
  renderOptionSetup();
  syncVariants();
  if (window.markAsModified) window.markAsModified();
}

function addOptionValue(gi) {
  optionGroups[gi].values.push('');
  renderOptionSetup();
  syncVariants();
}

function removeOptionValue(gi, vi) {
  if (optionGroups[gi].values.length <= 1) return;
  optionGroups[gi].values.splice(vi, 1);
  renderOptionSetup();
  syncVariants();
}

function updateGroupName(gi, val) {
  const oldName = optionGroups[gi].name;
  optionGroups[gi].name = val;
  if (oldName && oldName !== val) {
    variants.forEach(v => {
      if (v.combination.hasOwnProperty(oldName)) {
        v.combination[val] = v.combination[oldName];
        delete v.combination[oldName];
      }
    });
  }
  syncVariants();
}

function updateValueName(gi, vi, val) {
  const groupName = optionGroups[gi].name;
  const oldVal = optionGroups[gi].values[vi];
  optionGroups[gi].values[vi] = val;
  if (oldVal && oldVal !== val && groupName) {
    variants.forEach(v => {
      if (v.combination[groupName] === oldVal) {
        v.combination[groupName] = val;
      }
    });
  }
  syncVariants();
}

// ── Variant Generation ──────────────────────────────────

function syncVariants() {
  const validGroups = optionGroups.filter(g => g.name && g.values.some(v => v));

  if (validGroups.length === 0) {
    variants = [];
    renderVariantsTable();
    return;
  }

  const oldVariants = JSON.parse(JSON.stringify(variants));

  // Generate all combinations
  let combinations = [{}];
  validGroups.forEach(group => {
    let newCombos = [];
    group.values.filter(v => v).forEach(value => {
      combinations.forEach(combo => {
        newCombos.push({ ...combo, [group.name]: value });
      });
    });
    combinations = newCombos;
  });

  const defaultPrice = Number(document.getElementById('p-price').value) || 0;
  const defaultSalePrice = document.getElementById('p-sale-price').value ? Number(document.getElementById('p-sale-price').value) : null;

  // Multi-pass, non-duplicating matching strategy
  const newVariants = new Array(combinations.length).fill(null);
  const usedOldIndexes = new Set();
  const normalize = s => (s || '').trim().toLowerCase();

  // Pass 1: Exact Match (all keys and values match exactly, case/space insensitive)
  combinations.forEach((combo, comboIdx) => {
    const cKeys = Object.keys(combo);
    const matchedIdx = oldVariants.findIndex((v, oldIdx) => {
      if (usedOldIndexes.has(oldIdx)) return false;
      if (!v.combination) return false;
      const vKeys = Object.keys(v.combination);
      if (vKeys.length !== cKeys.length) return false;
      return cKeys.every(cKey => {
        const vKeyMatch = vKeys.find(vk => normalize(vk) === normalize(cKey));
        return vKeyMatch && normalize(v.combination[vKeyMatch]) === normalize(combo[cKey]);
      });
    });

    if (matchedIdx !== -1) {
      usedOldIndexes.add(matchedIdx);
      newVariants[comboIdx] = {
        ...oldVariants[matchedIdx],
        combination: combo
      };
    }
  });

  // Pass 2: Fuzzy Rename Match (if keys were renamed but value combinations match)
  combinations.forEach((combo, comboIdx) => {
    if (newVariants[comboIdx] !== null) return;
    
    const cValues = Object.values(combo).map(normalize);
    const matchedIdx = oldVariants.findIndex((v, oldIdx) => {
      if (usedOldIndexes.has(oldIdx)) return false;
      if (!v.combination) return false;
      const vValues = Object.values(v.combination).map(normalize);
      if (cValues.length !== vValues.length) return false;
      return cValues.every(cv => vValues.includes(cv));
    });

    if (matchedIdx !== -1) {
      usedOldIndexes.add(matchedIdx);
      newVariants[comboIdx] = {
        ...oldVariants[matchedIdx],
        combination: combo
      };
    }
  });

  // Pass 3: Partial Match - Deleting an option group (current keys are a subset of old keys)
  combinations.forEach((combo, comboIdx) => {
    if (newVariants[comboIdx] !== null) return;

    const cKeys = Object.keys(combo);
    const matchedIdx = oldVariants.findIndex((v, oldIdx) => {
      if (usedOldIndexes.has(oldIdx)) return false;
      if (!v.combination) return false;
      const vKeys = Object.keys(v.combination);
      if (cKeys.length >= vKeys.length) return false;
      return cKeys.every(cKey => {
        const vKeyMatch = vKeys.find(vk => normalize(vk) === normalize(cKey));
        return vKeyMatch && normalize(v.combination[vKeyMatch]) === normalize(combo[cKey]);
      });
    });

    if (matchedIdx !== -1) {
      usedOldIndexes.add(matchedIdx);
      newVariants[comboIdx] = {
        ...oldVariants[matchedIdx],
        combination: combo
      };
    }
  });

  // Pass 4: Partial Match - Adding an option group (old keys are a subset of current keys)
  combinations.forEach((combo, comboIdx) => {
    if (newVariants[comboIdx] !== null) return;

    const cKeys = Object.keys(combo);
    const matchedIdx = oldVariants.findIndex((v, oldIdx) => {
      if (usedOldIndexes.has(oldIdx)) return false;
      if (!v.combination) return false;
      const vKeys = Object.keys(v.combination);
      if (vKeys.length === 0 || vKeys.length >= cKeys.length) return false;
      return vKeys.every(vKey => {
        const cKeyMatch = cKeys.find(ck => normalize(ck) === normalize(vKey));
        return cKeyMatch && normalize(combo[cKeyMatch]) === normalize(v.combination[vKey]);
      });
    });

    if (matchedIdx !== -1) {
      usedOldIndexes.add(matchedIdx);
      newVariants[comboIdx] = {
        ...oldVariants[matchedIdx],
        combination: combo
      };
    }
  });

  // Pass 5: Value-based partial match (adding/deleting and renames simultaneously)
  combinations.forEach((combo, comboIdx) => {
    if (newVariants[comboIdx] !== null) return;

    const cValues = Object.values(combo).map(normalize);
    const matchedIdx = oldVariants.findIndex((v, oldIdx) => {
      if (usedOldIndexes.has(oldIdx)) return false;
      if (!v.combination) return false;
      const vValues = Object.values(v.combination).map(normalize);
      if (vValues.length === 0) return false;
      const currentSubset = cValues.every(cv => vValues.includes(cv));
      const oldSubset = vValues.every(vv => cValues.includes(vv));
      return currentSubset || oldSubset;
    });

    if (matchedIdx !== -1) {
      usedOldIndexes.add(matchedIdx);
      newVariants[comboIdx] = {
        ...oldVariants[matchedIdx],
        combination: combo
      };
    }
  });

  // Build the final variants array with proper defaults for new ones
  variants = combinations.map((combo, comboIdx) => {
    if (newVariants[comboIdx] !== null) {
      const existing = newVariants[comboIdx];
      return {
        ...existing,
        combination: combo,
        price: Number(existing.price) || defaultPrice,
        salePrice: existing.salePrice !== null ? (Number(existing.salePrice) || 0) : null,
        quantity: existing.quantity !== null ? (Number(existing.quantity) || 0) : null
      };
    }

    return {
      combination: combo,
      price: defaultPrice,
      salePrice: defaultSalePrice,
      cost: null,
      quantity: null,
      imageUrl: '',
      active: true
    };
  });

  renderVariantsTable();
  if (window.markAsModified) window.markAsModified();
}

// ── Variant Table Rendering (Hierarchical with Expansion) ──

let expandedParents = new Set();

function renderVariantsTable() {
  const tbody = document.getElementById('variants-list-body');
  if (!tbody) return;

  if (variants.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#94a3b8">أضف خيارات للمنتج للبدء في إدارة المتغيرات</td></tr>';
    return;
  }

  const firstGroupName = optionGroups[0]?.name;
  if (!firstGroupName) return;

  const groups = {};
  variants.forEach((v, idx) => {
    const parentVal = v.combination[firstGroupName];
    if (!groups[parentVal]) groups[parentVal] = [];
    groups[parentVal].push({ ...v, originalIndex: idx });
  });

  const parentKeys = Object.keys(groups);
  // Auto-expand if only one group OR if there is only one parent value
  if (optionGroups.length === 1 || parentKeys.length === 1) {
    parentKeys.forEach(k => expandedParents.add(k));
  }

  let html = '';
  Object.entries(groups).forEach(([parentVal, children]) => {
    const isExpanded = expandedParents.has(parentVal);

    // Price ranges
    const prices = children.map(c => c.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = minPrice === maxPrice ? `${minPrice}` : `${minPrice} - ${maxPrice}`;

    const salePrices = children.map(c => c.salePrice).filter(p => p !== null);
    let salePriceRange = '-';
    if (salePrices.length > 0) {
      const minSale = Math.min(...salePrices);
      const maxSale = Math.max(...salePrices);
      salePriceRange = minSale === maxSale ? `${minSale}` : `${minSale} - ${maxSale}`;
    }

    const totalQty = children.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);

    // Skip Parent Row if only one group
    if (optionGroups.length > 1) {
      html += `
        <tr class="variant-row parent ${isExpanded ? 'expanded' : ''}" onclick="toggleVariantChildren('${parentVal}')">
          <td><input type="checkbox" class="selection-checkbox" onclick="event.stopPropagation()"></td>
          <td style="text-align:right">
            <div style="display:flex; align-items:center; gap:8px">
              <span style="font-weight:700">${parentVal}</span>
              <span style="font-size:0.85rem; color:#667085; font-weight:400; margin-right:4px">${children.length} متغيرات</span>
              <span class="expansion-arrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </span>
            </div>
          </td>
          <td>
            <div class="currency-input-group disabled">
              <span class="addon">ج.م</span>
              <input type="text" value="${priceRange}" disabled>
            </div>
          </td>
          <td>
            <div class="currency-input-group disabled">
              <span class="addon">ج.م</span>
              <input type="text" value="${salePriceRange}" disabled>
            </div>
          </td>
          <td style="text-align:center">
            <input type="text" class="qty-input" value="${totalQty}" disabled style="background:#f9fafb; color:#667085">
          </td>
        </tr>
      `;
    }

    // Children Rows
    children.forEach(c => {
      const otherOptions = Object.entries(c.combination)
        .filter(([key]) => key !== firstGroupName)
        .map(([key, val]) => val)
        .join(' / ');

      // If single group, don't indent
      const rowClass = optionGroups.length > 1 ? 'variant-row child child-indent' : 'variant-row child';
      const rowStyle = (optionGroups.length === 1 || isExpanded) ? 'table-row' : 'none';

      html += `
        <tr class="${rowClass} parent-${parentVal.replace(/\s+/g, '-')}" style="display:${rowStyle}">
          <td><input type="checkbox" class="selection-checkbox"></td>
          <td style="text-align:right">
            <div style="display:flex; align-items:center;">
              <button type="button" class="btn-gallery-teal" onclick="openGalleryModal(${c.originalIndex})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              </button>
              <span style="color:#0f766e; font-weight:500">${otherOptions || parentVal}</span>
            </div>
          </td>
          <td>
            <div class="currency-input-group">
              <span class="addon">ج.م</span>
              <input type="number" class="variant-price" data-idx="${c.originalIndex}" value="${c.price}" oninput="validateVariantRow(this, ${c.originalIndex})" onchange="updateVariantField(${c.originalIndex}, 'price', this.value)">
            </div>
          </td>
          <td>
            <div class="currency-input-group">
              <span class="addon">ج.م</span>
              <input type="number" class="variant-saleprice" data-idx="${c.originalIndex}" value="${c.salePrice || ''}" oninput="validateVariantRow(this, ${c.originalIndex})" onchange="updateVariantField(${c.originalIndex}, 'salePrice', this.value)">
            </div>
          </td>
          <td style="text-align:center">
            <input type="number" class="qty-input" value="${c.quantity === null ? '' : c.quantity}" placeholder="∞" onchange="updateVariantField(${c.originalIndex}, 'quantity', this.value)">
          </td>
        </tr>
      `;
    });

  });

  tbody.innerHTML = html;
  validateAllVariantRows();
}

window.toggleVariantChildren = function (parentVal) {

  if (expandedParents.has(parentVal)) {
    expandedParents.delete(parentVal);
  } else {
    expandedParents.add(parentVal);
  }
  renderVariantsTable();
}

window.updateVariantField = function (idx, field, val) {
  if (field === 'price' || field === 'salePrice' || field === 'quantity' || field === 'cost') {
    variants[idx][field] = val === '' ? (field === 'quantity' || field === 'cost' ? null : 0) : Number(val);
  } else {
    variants[idx][field] = val;
  }
  if (window.markAsModified) window.markAsModified();
}

window.removeVariant = function (idx) {
  variants.splice(idx, 1);
  renderVariantsTable();
  if (window.markAsModified) window.markAsModified();
}

window.toggleVariantGroup = function (parentVal, active) {
  const firstGroupName = optionGroups[0].name;
  variants.forEach(v => {
    if (v.combination[firstGroupName] === parentVal) {
      v.active = active;
    }
  });
}

// ── Internal Gallery Modal ──────────────────────────────

let currentPickingVariantIndex = null;

window.openGalleryModal = function (idx) {
  currentPickingVariantIndex = idx;
  const grid = document.getElementById('gallery-modal-grid');
  const confirmBtn = document.getElementById('confirm-gallery-selection');

  grid.innerHTML = productImages.map((img, i) => `
    <div class="gallery-item ${variants[idx].imageUrl === img ? 'selected' : ''}" onclick="selectGalleryImage('${img}')">
      <div class="gallery-item-check"></div>
      <img src="${img}">
    </div>
  `).join('');

  // Disable button if no image is currently selected for this variant
  if (confirmBtn) {
    confirmBtn.disabled = !variants[idx].imageUrl;
  }

  document.getElementById('gallery-modal').style.display = 'flex';
}

window.selectGalleryImage = function (url) {
  document.querySelectorAll('.gallery-item').forEach(el => {
    el.classList.toggle('selected', el.querySelector('img').src === url);
  });
  variants[currentPickingVariantIndex].imageUrl = url;

  const confirmBtn = document.getElementById('confirm-gallery-selection');
  if (confirmBtn) confirmBtn.disabled = false;
}

window.closeGalleryModal = function () {
  document.getElementById('gallery-modal').style.display = 'none';
  renderVariantsTable();
}

document.getElementById('confirm-gallery-selection').addEventListener('click', closeGalleryModal);

// ── Bulk Edit Logic ─────────────────────────────────────

function openBulkEditModal() {
  const tbody = document.getElementById('bulk-edit-list');
  const modal = document.getElementById('bulk-edit-modal');

  // Update subtitle with count
  const oldSubtitle = modal.querySelector('.bulk-edit-subtitle');
  if (oldSubtitle) oldSubtitle.remove();
  const subtitle = document.createElement('div');
  subtitle.className = 'bulk-edit-subtitle';
  subtitle.textContent = `أنت تقوم بتعديل ${variants.length} متغيرات`;
  modal.querySelector('.modal-header').insertAdjacentElement('afterend', subtitle);

  tbody.innerHTML = variants.map((v, idx) => {
    const name = Object.values(v.combination).join(' / ');
    return `
      <tr>
        <td style="font-weight:500; color:#101828">${name}</td>
        <td style="text-align:center">
          <div class="img-icon-btn" onclick="openGalleryModal(${idx})">
            ${v.imageUrl ? `<img src="${v.imageUrl}">` : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'}
          </div>
        </td>
        <td>
          <div class="input-group-rtl">
            <span class="addon">ج.م</span>
            <input type="number" value="${v.price}" onchange="updateVariantField(${idx}, 'price', this.value)">
          </div>
        </td>
        <td>
          <div class="input-group-rtl">
            <span class="addon">ج.م</span>
            <input type="number" value="${v.salePrice || ''}" onchange="updateVariantField(${idx}, 'salePrice', this.value)">
          </div>
        </td>
        <td>
          <div class="input-group-rtl">
            <span class="addon">ج.م</span>
            <input type="number" value="${v.cost || ''}" onchange="updateVariantField(${idx}, 'cost', this.value)">
          </div>
        </td>
      </tr>
    `;
  }).join('');
  modal.style.display = 'flex';
}


window.updateBulkField = function (idx, field, val) {
  updateVariantField(idx, field, val);
}

function closeBulkEditModal() {
  document.getElementById('bulk-edit-modal').style.display = 'none';
  renderVariantsTable();
}

function applyBulkEdit() {
  closeBulkEditModal();
}

// ── Save ─────────────────────────────────────────────────

async function saveProduct(e) {
  e.preventDefault();
  const btn = document.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';
  }

  const salePriceVal = document.getElementById('p-sale-price').value;
  const qtyVal = document.getElementById('p-quantity').value;

  const data = {
    name: document.getElementById('p-name').value.trim(),
    basePrice: Number(document.getElementById('p-price').value),
    salePrice: salePriceVal ? Number(salePriceVal) : null,
    images: productImages,
    imageUrl: productImages.length > 0 ? productImages[0] : '',
    description: document.getElementById('p-desc').value.trim(),
    collectionIds: selectedCollectionIds,
    collectionId: selectedCollectionIds.length > 0 ? selectedCollectionIds[0] : null,
    status: document.getElementById('p-status').value,
    quantity: qtyVal !== '' ? Number(qtyVal) : null,
    options: optionGroups.filter(g => g.name && g.values.some(v => v)).map(g => ({
      name: g.name,
      required: true,
      values: g.values.filter(v => v).map(v => ({ label: v, price: 0 }))
    })),
    variants: document.getElementById('enable-variants').checked ? variants.map(v => ({
      ...v,
      combination: v.combination
    })) : []
  };

  try {
    if (editId) { 
      await api.updateProduct(editId, data); 
      showToast('تم تحديث المنتج'); 
    } else { 
      const res = await api.createProduct(data); 
      showToast('تم إضافة المنتج');
      if (res && res._id) {
        editId = res._id;
        const formTitle = document.getElementById('form-title');
        if (formTitle) formTitle.textContent = 'تعديل المنتج';
        document.title = 'تعديل المنتج | لوحة التحكم';
        const newUrl = window.location.pathname + '?id=' + editId;
        window.history.replaceState({ path: newUrl }, '', newUrl);
        const deleteBtn = document.getElementById('delete-btn');
        if (deleteBtn) deleteBtn.style.display = 'block';
      }
    }
    
    hasUnsavedChanges = false;
    originalProductData = JSON.parse(JSON.stringify(data));
    if (window.hideBar) window.hideBar();
    
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'حفظ المنتج';
      btn.classList.remove('pulse');
    }
  } catch (err) {
    showToast(err.message || 'حدث خطأ', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'حفظ المنتج';
    }
  }
}
async function deleteCurrentProduct() {
  if (!editId) return;
  const name = document.getElementById('p-name').value;
  const confirmed = await window.showConfirmModal('تأكيد الحذف', `هل أنت متأكد من حذف المنتج "${name}"؟ سيتم حذفه نهائياً.`);
  if (!confirmed) return;

  try {
    const btn = document.getElementById('delete-btn');
    if (btn) btn.disabled = true;

    await api.deleteProduct(editId);
    showToast('تم حذف المنتج بنجاح');

    // Crucial: hide the unsaved bar before redirecting so no alert shows
    const bar = document.getElementById('unsaved-changes-bar');
    if (bar) bar.classList.remove('visible');

    setTimeout(() => window.location.href = 'products', 800);
  } catch (err) {
    showToast(err.message || 'فشل حذف المنتج', 'error');
    const btn = document.getElementById('delete-btn');
    if (btn) btn.disabled = false;
  }
}

function populateProductForm(p) {
  if (!p) {
    document.getElementById('form-title').textContent = 'إضافة منتج جديد';
    document.getElementById('p-name').value = '';
    document.getElementById('p-price').value = '';
    document.getElementById('p-sale-price').value = '';
    document.getElementById('p-desc').value = '';
    document.getElementById('p-status').value = 'active';
    document.getElementById('p-quantity').value = '';
    selectedCollectionIds = [];
    const tagsContainer = document.getElementById('selected-collections-tags');
    if (tagsContainer) tagsContainer.innerHTML = '';
    productImages = [];
    renderImages();
    optionGroups = [];
    variants = [];
    document.getElementById('enable-variants').checked = false;
    document.getElementById('variant-setup-container').style.display = 'none';
    renderOptionSetup();
    renderVariantsTable();
    return;
  }

  document.getElementById('form-title').textContent = 'تعديل المنتج';
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-price').value = p.basePrice;
  document.getElementById('p-sale-price').value = p.salePrice || '';
  document.getElementById('p-desc').value = p.description || '';
  document.getElementById('p-status').value = p.status || 'active';
  document.getElementById('p-quantity').value = (p.quantity != null) ? p.quantity : '';

  const colIds = p.collectionIds || [];
  if (p.collectionId && !colIds.includes(p.collectionId)) colIds.push(p.collectionId);
  selectedCollectionIds = [...colIds];

  const tagsContainer = document.getElementById('selected-collections-tags');
  const hiddenInput = document.getElementById('p-collections-hidden');
  if (tagsContainer) {
    tagsContainer.innerHTML = selectedCollectionIds.map(id => {
      const col = allCollections.find(c => c._id === id);
      if (!col) return '';
      return `<div class="tag">${col.name}<span class="tag-remove" onclick="removeCollectionTag('${id}')">×</span></div>`;
    }).join('');
  }
  if (hiddenInput) hiddenInput.value = JSON.stringify(selectedCollectionIds);

  productImages = p.images && p.images.length > 0 ? [...p.images] : (p.imageUrl ? [p.imageUrl] : []);
  renderImages();

  optionGroups = (p.options || []).map(g => ({
    name: g.name,
    values: g.values.map(v => v.label)
  }));
  optionEditModes = optionGroups.map(() => false);

  const seenIds = new Set();
  variants = (p.variants || []).map(v => {
    let combo = v.combination instanceof Map ? Object.fromEntries(v.combination) : v.combination;
    
    // Clean up duplicate _ids to heal legacy/corrupted data
    let variantId = v._id;
    if (variantId) {
      if (seenIds.has(variantId)) {
        variantId = undefined; // Strip duplicate ID so Mongoose generates a clean new one
      } else {
        seenIds.add(variantId);
      }
    }

    return {
      _id: variantId,
      combination: combo,
      price: v.price,
      salePrice: v.salePrice,
      cost: v.cost || null,
      quantity: v.quantity,
      imageUrl: v.imageUrl,
      active: v.active !== false
    };
  });

  if (optionGroups.length > 0) {
    document.getElementById('enable-variants').checked = true;
    document.getElementById('variant-setup-container').style.display = 'block';
    
    // Check if there are any duplicate combinations in the loaded variants
    const combinationStrings = new Set();
    let hasDuplicateCombinations = false;
    variants.forEach(v => {
      const str = Object.entries(v.combination || {})
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, val]) => `${k}:${val}`)
        .join('|');
      if (combinationStrings.has(str)) {
        hasDuplicateCombinations = true;
      } else {
        combinationStrings.add(str);
      }
    });

    if (variants.length === 0 || hasDuplicateCombinations) {
      syncVariants();
    }
  } else {
    document.getElementById('enable-variants').checked = false;
    document.getElementById('variant-setup-container').style.display = 'none';
  }
  renderOptionSetup();
  renderVariantsTable();
  validateMainProductPrices();
}

window.validateVariantRow = function(inputEl, idx) {
  const row = inputEl.closest('tr');
  if (!row) return;

  const priceInput = row.querySelector('.variant-price');
  const salePriceInput = row.querySelector('.variant-saleprice');
  
  if (!priceInput || !salePriceInput) return;

  const price = Number(priceInput.value) || 0;
  const salePriceVal = salePriceInput.value;
  
  const priceGroup = priceInput.closest('.currency-input-group');
  const salePriceGroup = salePriceInput.closest('.currency-input-group');
  
  if (salePriceVal !== '' && Number(salePriceVal) > price) {
    if (priceGroup) priceGroup.classList.add('input-error');
    if (salePriceGroup) salePriceGroup.classList.add('input-error');
    
    let errorMsg = row.querySelector('.variant-price-error');
    if (!errorMsg) {
      errorMsg = document.createElement('div');
      errorMsg.className = 'variant-price-error';
      errorMsg.style.color = 'var(--danger)';
      errorMsg.style.fontSize = '0.78rem';
      errorMsg.style.marginTop = '4px';
      errorMsg.style.textAlign = 'right';
      errorMsg.textContent = 'سعر الخصم لا يمكن أن يكون أكبر من السعر الأساسي';
      
      salePriceGroup.parentNode.appendChild(errorMsg);
    }
  } else {
    if (priceGroup) priceGroup.classList.remove('input-error');
    if (salePriceGroup) salePriceGroup.classList.remove('input-error');
    
    const errorMsg = row.querySelector('.variant-price-error');
    if (errorMsg) errorMsg.remove();
  }
}

window.validateAllVariantRows = function() {
  document.querySelectorAll('tr.variant-row.child').forEach(row => {
    const salePriceInput = row.querySelector('.variant-saleprice');
    if (salePriceInput) {
      const idx = salePriceInput.getAttribute('data-idx');
      validateVariantRow(salePriceInput, Number(idx));
    }
  });
}

window.validateMainProductPrices = function() {
  const priceInput = document.getElementById('p-price');
  const salePriceInput = document.getElementById('p-sale-price');
  if (!priceInput || !salePriceInput) return;

  const price = Number(priceInput.value) || 0;
  const salePriceVal = salePriceInput.value;

  const parent = salePriceInput.parentNode;
  
  if (salePriceVal !== '' && Number(salePriceVal) > price) {
    priceInput.classList.add('input-error');
    salePriceInput.classList.add('input-error');
    
    let errorMsg = parent.querySelector('.main-price-error');
    if (!errorMsg) {
      errorMsg = document.createElement('div');
      errorMsg.className = 'main-price-error';
      errorMsg.style.color = 'var(--danger)';
      errorMsg.style.fontSize = '0.78rem';
      errorMsg.style.marginTop = '4px';
      errorMsg.style.textAlign = 'right';
      errorMsg.textContent = 'سعر الخصم لا يمكن أن يكون أكبر من السعر الأساسي';
      parent.appendChild(errorMsg);
    }
  } else {
    priceInput.classList.remove('input-error');
    salePriceInput.classList.remove('input-error');
    const errorMsg = parent.querySelector('.main-price-error');
    if (errorMsg) errorMsg.remove();
  }
}
