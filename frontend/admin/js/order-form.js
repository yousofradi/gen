/** Admin — Create Order form JS */

/** Debounce function to limit API calls */
function debounce(func, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

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
  
  // Suggest if query matches any part of the text or vice versa
  return nText.includes(nQuery) || nQuery.includes(nText);
}

let allProducts = [];
let allCustomers = [];
let shippingMap = {};
let cartItems = []; // [{ product, quantity, selectedOptions, discount }]

function getShippingFeeForCityAndZone(cityName, zoneName) {
  if (!window._shippingOptions || window._shippingOptions.length === 0) {
    const govData = (window._fullShippingData || []).find(s => 
      isCityEqual(s.city, cityName) || isCityEqual(s.cityOtherName, cityName)
    );
    return govData ? (govData.fee || 0) : 0;
  }

  const isCityEqual = (a, b) => {
    if (!a || !b) return false;
    const norm = (s) => s.replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase().trim();
    return norm(a) === norm(b);
  };

  let carrier = 'bosta';
  let govData = (window._fullShippingData || []).find(s => 
    isCityEqual(s.city, cityName) || isCityEqual(s.cityOtherName, cityName)
  );

  if (zoneName && govData && govData.zones && govData.zones.length > 0) {
    const selectedZoneObj = govData.zones.find(z => api.formatZoneName(z) === zoneName);
    if (!selectedZoneObj || selectedZoneObj.bostaAvailable === false || selectedZoneObj.dropOffAvailability === false) {
      carrier = 'egyptpost';
    }
  }

  if (carrier === 'egyptpost') {
    const postOption = window._shippingOptions.find(o => 
      o.name.includes('البريد') || o.name.toLowerCase().includes('post')
    ) || window._shippingOptions[0];
    
    const cityObj = postOption ? (postOption.cities || []).find(c => 
      isCityEqual(c.city, cityName)
    ) : null;
    return cityObj ? cityObj.fee : (postOption ? postOption.cost : 80);
  } else {
    const bostaOption = window._shippingOptions.find(o => 
      o.name.includes('بوسطة') || o.name.toLowerCase().includes('bosta')
    ) || window._shippingOptions[1] || window._shippingOptions[0];
    
    const cityObj = bostaOption ? (bostaOption.cities || []).find(c => 
      isCityEqual(c.city, cityName)
    ) : null;
    return cityObj ? cityObj.fee : (bostaOption ? bostaOption.cost : 150);
  }
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAdmin()) return;

  document.body.classList.add('is-loading');

  try {
    const [productsRes, shippingRes, settings, customersRes, collectionsRes, shippingOptionsRes] = await Promise.all([
      api.getProducts(1, 1000, true).catch(() => []),
      api.getShippingList().catch(() => []),
      api.getSetting('sundura_global_settings').catch(() => ({})),
      api.getCustomers().catch(() => []),
      api.getCollections().catch(() => []),
      api.getSetting('shipping_options').catch(() => [])
    ]);

    const products = (productsRes.products || productsRes).filter(p => p.status !== 'draft');
    allCustomers = customersRes || [];
    let shipping = shippingRes;
    window._globalSettings = settings || {};
    window._shippingOptions = shippingOptionsRes || [];

    allProducts = products;

    // Populate Collections Map and Modal Dropdown
    const colFilter = document.getElementById('modal-col-filter');
    if (colFilter) {
      colFilter.innerHTML = '<option value="">جميع المنتجات</option>';
      collectionsRes.forEach(c => {
        collectionsMap[c._id] = c.name;
        colFilter.add(new Option(c.name, c._id));
      });
    }
    window._fullShippingData = shipping; // Store full objects

    const searchInput = document.getElementById('c-gov-search');
    const dropdown = document.getElementById('gov-dropdown');
    const hiddenInput = document.getElementById('c-gov');

    if (searchInput && dropdown) {
      searchInput.addEventListener('focus', () => renderGovDropdown());
      searchInput.addEventListener('input', () => renderGovDropdown());
      
      document.addEventListener('click', (e) => {
        if (!document.getElementById('gov-search-container').contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });

        function renderGovDropdown() {
          const query = searchInput.value.trim();
          const filtered = window._fullShippingData.filter(s => 
            smartMatch(s.city, query) || (s.cityOtherName && smartMatch(s.cityOtherName, query))
          );

        if (filtered.length === 0) {
          dropdown.innerHTML = '<div style="padding: 10px; color: #94a3b8; text-align: center;">لا توجد نتائج</div>';
        } else {
          dropdown.innerHTML = filtered.map(s => `
            <div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; text-align:right;" 
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
        handleCityChange(); // Trigger existing city change logic
      };
    }

    // Populate Payment Methods
    const paymentMethodsContainer = document.getElementById('payment-methods');
    if (paymentMethodsContainer && settings.paymentMethods) {
      paymentMethodsContainer.innerHTML = settings.paymentMethods.map((m, idx) => `
        <label class="payment-method-card ${idx === 0 ? 'selected' : ''}" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <input type="radio" name="payment" value="${m.label}" ${idx === 0 ? 'checked' : ''} onchange="updatePaymentUI()" style="margin:0; width: 20px; height: 20px; accent-color: var(--primary);">
            <div style="text-align: right;">
              <div style="font-weight: 700; font-size: 1rem; color: #1e293b; margin-bottom: 2px;">${m.label}</div>
              <div style="font-size: 0.85rem; color: #64748b; font-family: monospace; letter-spacing: 0.5px;">${m.number}</div>
            </div>
          </div>
          <div style="width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid #f1f5f9; border-radius: 12px; overflow: hidden; padding: 4px;">
            ${m.logo ? `<img src="${m.logo}" style="max-width:100%; max-height:100%; object-fit:contain;">` : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`}
          </div>
        </label>
      `).join('');
    }
    document.body.classList.remove('is-loading');
  } catch (err) {
    showToast('فشل تحميل بيانات المتجر', 'error');
    document.body.classList.remove('is-loading');
  }

  setupSearch();
  setupCustomerSearch();
  setupZoneSearch();
  updatePaymentUI();

  // ── Validation Listeners ──
  const nameInput = document.getElementById('c-name');
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      const val = e.target.value;
      // Remove any non-Arabic characters (except spaces)
      const cleaned = val.replace(/[^\u0600-\u06FF\s]/g, '');
      if (val !== cleaned) {
        e.target.value = cleaned;
      }
    });
  }

  const phoneInput = document.getElementById('c-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      const val = e.target.value;
      // Remove any non-standard digits (except +)
      const cleaned = val.replace(/[^0-9+]/g, '');
      if (val !== cleaned) {
        e.target.value = cleaned;
      }
    });
  }

  // Global Save Handler for the unsaved changes bar
  window.handleGlobalSave = async () => {
    await submitOrder();
    return true;
  };

  // Global Discard Handler
  window.handleGlobalDiscard = () => {
    cartItems = [];
    renderCart();
    const fields = ['c-name', 'c-phone', 'c-second-phone', 'c-gov', 'c-address', 'c-notes', 'order-discount', 'paid-amount'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    updatePaymentUI();
    recalcSummary();
    if (window.hideBar) window.hideBar();
  };

  // Set initial customer mode on load (defaults to existing with hidden fields)
  toggleCustomerMode(false);

  // Check if recovering an abandoned cart
  const urlParams = new URLSearchParams(window.location.search);
  const recoverCartId = urlParams.get('recoverCartId');
  if (recoverCartId) {
    await recoverAbandonedCart(recoverCartId);
  }
});

async function recoverAbandonedCart(cartId) {
  try {
    const carts = await api.getAbandonedCarts();
    const cart = (carts || []).find(c => c._id === cartId);
    if (!cart) {
      showToast('السلة المتروكة غير موجودة أو تم حذفها', 'error');
      return;
    }

    // 1. Populate Customer Fields
    if (cart.customer) {
      if (document.getElementById('c-name')) document.getElementById('c-name').value = cart.customer.name || '';
      if (document.getElementById('c-phone')) document.getElementById('c-phone').value = cart.customer.phone || '';
      if (document.getElementById('c-second-phone')) document.getElementById('c-second-phone').value = cart.customer.secondPhone || '';
      if (document.getElementById('c-address')) document.getElementById('c-address').value = cart.customer.address || '';
      if (document.getElementById('c-notes')) document.getElementById('c-notes').value = cart.customer.notes || '';

      // Populate Governorate / City
      const govName = cart.customer.government;
      if (govName) {
        const s = (window._fullShippingData || []).find(x => 
          x.city === govName || x.cityOtherName === govName
        );
        if (s) {
          document.getElementById('c-gov').value = s._id;
          document.getElementById('c-gov-search').value = s.cityOtherName || s.city;
          
          // Trigger city change to load zones
          await handleCityChange();
          
          // Set Zone if present
          if (cart.customer.zone && document.getElementById('c-zone')) {
            document.getElementById('c-zone').value = cart.customer.zone;
          }
        }
      }
    }

    // 2. Populate Cart Items
    if (cart.items && cart.items.length > 0) {
      cartItems = [];
      for (const item of cart.items) {
        const p = allProducts.find(x => x._id === item.productId);
        if (p) {
          cartItems.push({
            product: p,
            quantity: item.quantity || 1,
            selectedOptions: item.selectedOptions || [],
            discount: item.discount || 0,
            price: item.unitPrice !== undefined ? item.unitPrice : item.basePrice
          });
        }
      }
      renderCart();
    }

    recalcSummary();

    // Set customer mode to 'new' since this is recovered data and not a selected existing customer profile
    const radioNew = document.querySelector('input[name="customer_type"][value="new"]');
    if (radioNew) {
      radioNew.checked = true;
    }
    const existingSection = document.getElementById('existing-customer-section');
    if (existingSection) {
      existingSection.style.display = 'none';
    }
    const fields = document.getElementById('customer-fields');
    if (fields) {
      fields.style.display = 'block';
    }

    // Automatically trigger the "Unsaved Changes" bar/alert
    if (window.markAsModified) {
      window.markAsModified();
    }

    showToast('تم استعادة بيانات السلة المتروكة بنجاح');
  } catch (err) {
    console.error('Failed to recover abandoned cart:', err);
    showToast('فشل استعادة بيانات السلة المتروكة', 'error');
  }
}

// ── Products Modal ─────────────────────────────────────
let collectionsMap = {};
window.openModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
};

window.closeModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
  const openModals = document.querySelectorAll('.modal-overlay[style*="display: flex"]');
  if (openModals.length === 0) {
    document.body.style.overflow = '';
  }
};

// ── Modal Products (Persistent Selection) ───────────────
let modalSelectedProducts = new Set(); // Stores product IDs
let modalSelectedVariants = new Map(); // Key: pid-comboStr, Value: {pid, combo, price}

window.openProductsModal = async function () {
  modalSelectedProducts.clear();
  modalSelectedVariants.clear();
  openModal('products-modal');

  if (allProducts.length === 0) {
    const listEl = document.getElementById('modal-products-list');
    if (listEl) listEl.innerHTML = '<div style="padding:20px; text-align:center;">جاري تحميل المنتجات...</div>';
    try {
      const productsRes = await api.getProducts(1, 1000, true, '', '', '', '', true).catch(() => []);
      allProducts = (productsRes.products || productsRes).filter(p => p.status !== 'draft');
    } catch (err) {
      console.error('Failed to load products for modal', err);
    }
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
  const qEl = document.getElementById('modal-search');
  const colEl = document.getElementById('modal-col-filter');
  const listEl = document.getElementById('modal-products-list');
  if (!listEl) return;

  const q = qEl ? qEl.value.toLowerCase().trim() : '';
  const col = colEl ? colEl.value : '';

  let filtered = (Array.isArray(allProducts) ? allProducts : (allProducts.products || []))
    .filter(p => p.status !== 'draft');

  // Filter by stock
  filtered = filtered.filter(p => {
    if (p.variants && p.variants.length > 0) {
      return p.variants.some(v => v.quantity === null || v.quantity > 0);
    }
    return p.quantity === null || p.quantity > 0;
  });

  if (q) filtered = filtered.filter(p => smartMatch(p.name, q));
  if (col) filtered = filtered.filter(p => p.collectionId === col || (p.collectionIds && p.collectionIds.includes(col)));

  if (!filtered.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">لا توجد منتجات</div>';
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const isChecked = modalSelectedProducts.has(p._id);
    const imgUrl = (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || '');
    const imgHtml = imgUrl ? `<img src="${imgUrl}" class="pli-img" loading="lazy">` : `<div class="pli-img"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;
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
    if (p.variants && p.variants.length > 0) {
      variantsHtml = p.variants
        .filter(v => v.quantity === null || v.quantity > 0)
        .map((v, idx) => {
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
      const combinations = getProductCombinations(p.options);
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
  if (modalSelectedProducts.size === 0 && modalSelectedVariants.size === 0) {
    return showToast('اختر منتجاً واحداً على الأقل', 'error');
  }

  // 1. Add simple products
  modalSelectedProducts.forEach(pid => {
    const p = allProducts.find(x => x._id === pid);
    if (p) {
      const existing = cartItems.find(c => c.product._id === p._id && (!c.selectedOptions || c.selectedOptions.length === 0));
      if (existing) {
        existing.quantity++;
      } else {
        cartItems.push({ product: p, quantity: 1, selectedOptions: [], discount: 0 });
      }
    }
  });

  // 2. Add variants
  modalSelectedVariants.forEach(data => {
    const p = allProducts.find(x => x._id === data.pid);
    if (p) {
      const combo = data.combo;
      const variantPrice = data.price;
      const existing = cartItems.find(c => {
        if (c.product._id !== p._id) return false;
        if (!c.selectedOptions || c.selectedOptions.length !== combo.length) return false;
        return combo.every(cv => c.selectedOptions.some(so => so.groupName === cv.groupName && so.label === cv.label));
      });

      if (existing) {
        existing.quantity++;
      } else {
        cartItems.push({
          product: p,
          quantity: 1,
          selectedOptions: combo,
          discount: 0,
          price: variantPrice
        });
      }
    }
  });

  renderCart();
  closeProductsModal();
  if (window.markAsModified) window.markAsModified();
};

function getAvailableQty(p, selectedOptions = []) {
  if (selectedOptions.length > 0 && p.variants && p.variants.length > 0) {
    const v = p.variants.find(v => {
      return selectedOptions.every(so => v.combination[so.groupName] === so.label);
    });
    return (v && v.quantity !== null && v.quantity !== undefined) ? v.quantity : Infinity;
  }
  return (p.quantity !== null && p.quantity !== undefined) ? p.quantity : Infinity;
}



window.removeCartItem = function (index) {
  cartItems.splice(index, 1);
  renderCart();
  if (window.markAsModified) window.markAsModified();
};

window.updateItemQty = function (idx, val) {
  const qty = parseInt(val, 10);
  if (qty >= 1) {
    cartItems[idx].quantity = qty;
    recalcSummary();
    renderCart();
    if (window.markAsModified) window.markAsModified();
  }
};

window.openItemDiscountModal = function (idx) {
  const item = cartItems[idx];
  document.getElementById('modal-item-idx').value = idx;
  document.getElementById('modal-item-discount').value = item.discount || '';
  openModal('item-discount-modal');
};

window.applyItemDiscount = function () {
  const idx = parseInt(document.getElementById('modal-item-idx').value);
  const val = document.getElementById('modal-item-discount').value;
  const item = cartItems[idx];
  if (item) {
    item.discount = parseFloat(val) || 0;
    closeModal('item-discount-modal');
    recalcSummary();
    renderCart();
  }
};

function renderCart() {
  const container = document.getElementById('cart-items-container');
  if (cartItems.length === 0) {
    container.innerHTML = `
      <div class="empty-cart" id="empty-cart-msg">
        <div class="empty-cart-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
        </div>
        <h3>السلة فارغة</h3>
        <p style="font-size:0.9rem">ابحث عن منتج أعلاه لإضافته</p>
      </div>`;
    recalcSummary();
    return;
  }

  container.innerHTML = cartItems.map((c, i) => {
    const p = c.product;
    
    // Find matching variant option specific image url
    let finalImageUrl = '';
    if (p && p.variants && c.selectedOptions && c.selectedOptions.length > 0) {
      const matchingVariant = p.variants.find(v => {
        if (!v.combination) return false;
        return c.selectedOptions.every(opt => v.combination[opt.groupName] === opt.label);
      });
      if (matchingVariant && matchingVariant.imageUrl) {
        finalImageUrl = matchingVariant.imageUrl;
      }
    }
    
    // Fall back to product base image url
    if (!finalImageUrl && p) {
      finalImageUrl = (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || '');
    }

    const imgHtml = finalImageUrl
      ? `<img src="${finalImageUrl}" style="width:52px; height:52px; border-radius:8px; object-fit:contain; border:1px solid #f1f5f9;" alt="${p.name}" loading="lazy">`
      : `<div style="width:52px; height:52px; border-radius:8px; background:#f8fafc; display:flex; align-items:center; justify-content:center; color:#94a3b8; border:1px solid #f1f5f9;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;

    const optText = (c.selectedOptions || []).map(op => op.label).join(' / ');
    const effectiveUnitPrice = c.price !== undefined ? c.price : ((p.salePrice && p.salePrice < p.basePrice) ? p.salePrice : p.basePrice);
    
    const available = getAvailableQty(p, c.selectedOptions);
    const lowStock = available !== Infinity && c.quantity > available;

    return `
      <div style="padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #fff; display: flex; flex-direction: column; gap: 14px;">
        <!-- Top Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 52px;">
          <!-- Right side: Image + Name -->
          <div style="display: flex; align-items: center; gap: 12px; flex: 1.5; min-width: 0;">
            ${imgHtml}
            <div style="text-align: right; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
              <div style="font-weight: 700; font-size: 0.95rem; color: #1e293b; line-height: 1.2; word-break: break-word;">${p.name}</div>
              ${optText ? `<div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">${optText}</div>` : ''}
              ${c.discount ? (c.discount > 0 
                ? `<div style="font-size:0.75rem; color:#dc2626; margin-top:4px; font-weight:600;">خصم: ${formatPrice(c.discount)}</div>` 
                : `<div style="font-size:0.75rem; color:#10b981; margin-top:4px; font-weight:600;">زياده ${Math.abs(c.discount)} ج.م</div>`
              ) : ''}
              ${lowStock ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:4px; font-weight:600; background:#fee2e2; padding:2px 8px; border-radius:4px; display:inline-block;">عذراً، يتوفر ${available} قطعة فقط</div>` : ''}
            </div>
          </div>
          
          <!-- Left side: Unit Price Block and Total Price -->
          <div style="display: flex; align-items: center; gap: 16px; flex: 1; justify-content: space-between;">
            <div style="font-size: 0.85rem; color: #64748b; white-space: nowrap; font-weight: 500; text-align: center; flex: 1;" dir="ltr">${c.quantity} x ${formatPrice(effectiveUnitPrice)}</div>
            <div style="font-weight: 700; font-size: 1rem; color: #1e293b; min-width: 80px; text-align: left; flex: 1;">${formatPrice(itemTotal(c))}</div>
          </div>
        </div>

        <!-- Bottom Row -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button type="button" class="btn btn-sm" onclick="openItemDiscountModal(${i})" style="background: #fff; border: 1px solid #e2e8f0; color: #475569; display: flex; align-items: center; gap: 6px; font-size: 0.8rem; padding: 6px 14px; border-radius: 8px; height: 36px; font-weight: 600;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><line x1="16" y1="8" x2="8" y2="16"/></svg>
              تطبيق خصم
            </button>
            
            <div style="display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #fff; height: 36px; min-width: 110px;">
              <button type="button" onclick="updateItemQty(${i}, ${c.quantity + 1})" style="flex: 1; height: 100%; border: none; background: transparent; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;">+</button>
              <div style="width: 40px; text-align: center; font-weight: 700; font-size: 0.95rem; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; height: 100%; line-height: 36px;">${c.quantity}</div>
              <button type="button" onclick="${c.quantity > 1 ? `updateItemQty(${i}, ${c.quantity - 1})` : ''}" style="flex: 1; height: 100%; border: none; background: ${c.quantity > 1 ? 'transparent' : '#f8fafc'}; cursor: ${c.quantity > 1 ? 'pointer' : 'not-allowed'}; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; color: ${c.quantity > 1 ? 'inherit' : '#cbd5e1'};" ${c.quantity <= 1 ? 'disabled' : ''}>-</button>
            </div>
          </div>

          <button type="button" onclick="removeCartItem(${i})" style="background: #fff; border: 1px solid #f1f5f9; color: #ef4444; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; padding: 6px 14px; border-radius: 8px; height: 36px; cursor: pointer; font-weight: 500;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            إزالة
          </button>
        </div>
      </div>`;
  }).join('');
  recalcSummary();
}

function itemTotal(c) {
  const effectiveUnitPrice = c.price !== undefined ? c.price : ((c.product.salePrice && c.product.salePrice < c.product.basePrice) ? c.product.salePrice : c.product.basePrice);
  return Math.max(0, effectiveUnitPrice * c.quantity - (c.discount || 0));
}

window.handleCityChange = async function() {
  const cityId = document.getElementById('c-gov').value;
  const zoneInput = document.getElementById('c-zone');
  const zoneDropdown = document.getElementById('zone-dropdown');
  if (!zoneInput || !zoneDropdown) return;
  
  zoneInput.value = '';
  zoneDropdown.innerHTML = '';
  window._currentCityZones = [];
  window._currentCityZonesList = [];

  if (cityId) {
    // 1. Try local data first (highly reliable)
    const localGov = (window._fullShippingData || []).find(s => s._id === cityId);
    let zones = [];
    if (localGov && localGov.zones && localGov.zones.length > 0) {
      zones = localGov.zones;
    } else {
      // 2. Fallback to API fetch
      try {
        zones = await api.getZones(cityId);
      } catch (e) {
        console.error('Failed to load zones', e);
      }
    }
    
    window._currentCityZonesList = zones || [];
    window._currentCityZones = (zones || []).map(z => api.formatZoneName(z));
    renderZoneDropdown(window._currentCityZones);
  }
  
  const zoneContainer = document.getElementById('c-zone-container');
  if (zoneContainer) {
    if (window._currentCityZones && window._currentCityZones.length > 0) {
      zoneContainer.style.display = 'block';
      zoneInput.required = true;
    } else {
      zoneContainer.style.display = 'none';
      zoneInput.required = false;
    }
  }
  
  recalcSummary();
};

window.recalcSummary = function () {
  let subtotal = 0;
  cartItems.forEach(c => subtotal += itemTotal(c));
  const cityId = document.getElementById('c-gov').value;
  const data = (window._fullShippingData || []).find(s => s._id === cityId);
  const cityName = data ? (data.cityOtherName || data.city) : '';
  const zoneName = document.getElementById('c-zone').value;

  const shipping = getShippingFeeForCityAndZone(cityName, zoneName);

  const orderDiscount = parseFloat(document.getElementById('order-discount').value) || 0;
  const total = Math.max(0, subtotal + shipping - orderDiscount);
  document.getElementById('sum-subtotal').textContent = formatPrice(subtotal);
  document.getElementById('sum-shipping').textContent = formatPrice(shipping);
  document.getElementById('sum-total').textContent = formatPrice(total);
};

window.updatePaymentUI = function () {
  document.querySelectorAll('.payment-method-card').forEach(card => {
    card.classList.toggle('selected', card.querySelector('input').checked);
  });
};

window.submitOrder = async function () {
  if (cartItems.length === 0) return showToast('أضف منتجاً واحداً على الأقل', 'error');
  const name = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const address = document.getElementById('c-address').value.trim();
  const cityId = document.getElementById('c-gov').value;
  const zone = document.getElementById('c-zone').value;
  
  const govData = (window._fullShippingData || []).find(s => s._id === cityId);
  const cityName = govData ? (govData.cityOtherName || govData.city) : '';

  const hasZones = window._currentCityZones && window._currentCityZones.length > 0;
  if (!name || !phone || !address || !cityName || (hasZones && !zone)) return showToast('يرجى ملء جميع الحقول المطلوبة للعميل', 'error');

  // Arabic-only name validation
  if (!/^[\u0600-\u06FF\s]+$/.test(name)) {
    return showToast('يرجى إدخال اسم العميل باللغة العربية فقط', 'error');
  }

  // English-only phone validation (digits)
  if (!/^[0-9+]+$/.test(phone)) {
    return showToast('يرجى إدخال رقم الهاتف بالأرقام الإنجليزية فقط', 'error');
  }

  // Resolve carrier first
  let carrier = 'bosta';
  if (zone && window._currentCityZonesList && window._currentCityZonesList.length > 0) {
    const selectedZoneObj = window._currentCityZonesList.find(z => api.formatZoneName(z) === zone);
    if (!selectedZoneObj || selectedZoneObj.bostaAvailable === false || selectedZoneObj.dropOffAvailability === false) {
      carrier = 'egyptpost';
    }
  }

  // Zone validation
  const zoneOptions = window._currentCityZones || [];
  if (zoneOptions.length > 0 && !zoneOptions.includes(zone)) {
    showToast('يرجى اختيار منطقة صحيحة من القائمة', 'error');
    return;
  }

  const btn = document.getElementById('submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2.5px;margin:0;"></span> جارٍ الحفظ...';
  }

  const finalItems = cartItems.map(c => {
    const p = c.product;
    let variantImageUrl = '';
    if (p.variants && p.variants.length > 0 && c.selectedOptions && c.selectedOptions.length > 0) {
      const matchingVariant = p.variants.find(varObj => {
        if (!varObj.combination) return false;
        return c.selectedOptions.every(opt => varObj.combination[opt.groupName] === opt.label);
      });
      if (matchingVariant && matchingVariant.imageUrl) {
        variantImageUrl = matchingVariant.imageUrl;
      }
    }

    return {
      productId: c.product._id,
      name: c.product.name,
      imageUrl: variantImageUrl || ((c.product.images && c.product.images.length > 0) ? c.product.images[0] : (c.product.imageUrl || '')),
      basePrice: c.price !== undefined ? c.price : ((c.product.salePrice && c.product.salePrice < c.product.basePrice) ? c.product.salePrice : c.product.basePrice),
      selectedOptions: c.selectedOptions,
      quantity: c.quantity,
      discount: c.discount || 0,
      finalPrice: itemTotal(c)
    };
  });

  const shippingFee = getShippingFeeForCityAndZone(cityName, zone);

  const payload = {
    customer: { 
      name, 
      phone, 
      secondPhone: document.getElementById('c-second-phone').value.trim(), 
      address, 
      government: cityName, 
      zone: zone,
      notes: document.getElementById('c-notes').value.trim() 
    },
    items: finalItems,
    discount: parseFloat(document.getElementById('order-discount').value) || 0,
    paymentMethod: document.querySelector('input[name="payment"]:checked').value,
    paidAmount: Math.max(0, parseFloat(document.getElementById('paid-amount').value) || 0),
    shippingFee: shippingFee,
    carrier: carrier
  };

  try {
    const res = await api.createOrder(payload);
    showToast('تم إنشاء الطلب بنجاح!');
    
    // If the order was created from a recovered abandoned cart, delete the abandoned cart from the database
    const params = new URLSearchParams(window.location.search);
    const recoverCartId = params.get('recoverCartId');
    if (recoverCartId) {
      try {
        await api.deleteAbandonedCart(recoverCartId);
      } catch (deleteErr) {
        console.error('Failed to delete abandoned cart after recovery:', deleteErr);
      }
    }

    if (res && res.orderId) {
      setTimeout(() => window.location.href = `order-details.html?id=${res.orderId}`, 1000);
    }
    updatePaymentUI();
    recalcSummary();
    if (window.hideBar) window.hideBar();

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'حفظ الطلب';
    }
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء إنشاء الطلب', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'حفظ الطلب';
    }
  }
};


window.handleSearchClick = function () {
  const input = document.getElementById('customer-search');
  const display = document.getElementById('selected-customer-display');
  const dropdown = document.getElementById('customer-dropdown');
  
  if (display && display.classList.contains('active')) {
    // If already selected, just toggle dropdown
    dropdown.classList.toggle('active');
    if (dropdown.classList.contains('active') && allCustomers.length > 0) {
      renderCustomerDropdown(allCustomers);
    }
  } else {
    input.focus();
  }
};

window.setupCustomerSearch = function () {
  const input = document.getElementById('customer-search');
  const dropdown = document.getElementById('customer-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('focus', () => {
    if (allCustomers.length > 0) {
      renderCustomerDropdown(allCustomers);
      dropdown.classList.add('active');
    }
  });

  const debouncedCustomerSearch = debounce((q) => {
    // Reset selected state if user types
    resetCustomerSelectionUI();

    if (!q) {
      renderCustomerDropdown(allCustomers);
      return;
    }
    const filtered = allCustomers.filter(c => 
      (c.name && smartMatch(c.name, q)) || 
      (c.phone && c.phone.includes(q))
    );
    renderCustomerDropdown(filtered);
    dropdown.classList.add('active');
  }, 300);

  input.addEventListener('input', (e) => {
    debouncedCustomerSearch(e.target.value.toLowerCase().trim());
  });

  document.addEventListener('click', (e) => {
    const container = document.getElementById('customer-search-container');
    if (container && !container.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
};

function resetCustomerSelectionUI() {
  const input = document.getElementById('customer-search');
  const icon = document.getElementById('customer-search-icon');
  const display = document.getElementById('selected-customer-display');
  const nameField = document.getElementById('c-name');

  if (display && display.classList.contains('active')) {
    display.classList.remove('active');
    if (input) input.style.display = 'block';
    if (icon) icon.style.display = 'block';
    
    // Clear fields
    if (nameField) {
      nameField.value = '';
      nameField.readOnly = false;
      document.getElementById('c-phone').value = '';
      document.getElementById('c-phone').readOnly = false;
      document.getElementById('c-second-phone').value = '';
      document.getElementById('c-address').value = '';
      document.getElementById('c-gov').value = '';
      const govSearch = document.getElementById('c-gov-search');
      if (govSearch) govSearch.value = '';
      document.getElementById('c-zone').value = '';
      document.getElementById('zone-dropdown').innerHTML = '';
    }

    // Hide customer fields again in existing customer mode
    const fields = document.getElementById('customer-fields');
    const mode = document.querySelector('input[name="customer_type"]:checked')?.value;
    if (fields && mode === 'existing') fields.style.display = 'none';
  }
}

function renderCustomerDropdown(customers) {
  const dropdown = document.getElementById('customer-dropdown');
  if (!dropdown) return;

  if (customers.length === 0) {
    dropdown.innerHTML = '<div style="padding:16px; text-align:center; color:#64748b; font-size:0.9rem;">لا يوجد عملاء بهذا الاسم</div>';
    return;
  }

  dropdown.innerHTML = customers.map(c => {
    const initials = c.name ? c.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';
    return `
      <div class="customer-item" onclick="selectCustomer('${c.phone}')">
        <div class="customer-avatar">${initials}</div>
        <div class="customer-info-row">
          <div class="customer-name-row">${c.name || 'بدون اسم'}</div>
          <div class="customer-phone-row">+${c.phone}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.selectCustomer = async function (phone) {
  const customer = allCustomers.find(c => c.phone === phone);
  if (!customer) return;

  document.getElementById('c-name').value = customer.name || '';
  document.getElementById('c-phone').value = customer.phone || '';
  document.getElementById('c-second-phone').value = customer.secondPhone || '';
  
  // Map government name to ID
  const govName = customer.government || '';
  const govData = (window._fullShippingData || []).find(s => s.city === govName || s.cityOtherName === govName);
  document.getElementById('c-gov').value = govData ? govData._id : '';
  const searchInput = document.getElementById('c-gov-search');
  if (searchInput && govData) {
    searchInput.value = govData.cityOtherName || govData.city;
  }

  await handleCityChange(); // Populates zones
  document.getElementById('c-zone').value = customer.zone || '';
  document.getElementById('c-address').value = customer.address || '';
  
  document.getElementById('customer-search').value = customer.name || customer.phone;
  document.getElementById('customer-dropdown').classList.remove('active');
  
  // Update UI to "selected" state
  const input = document.getElementById('customer-search');
  const icon = document.getElementById('customer-search-icon');
  const display = document.getElementById('selected-customer-display');
  const sAvatar = document.getElementById('selected-avatar');
  const sName = document.getElementById('selected-name');
  const sPhone = document.getElementById('selected-phone');

  if (display) {
    const initials = customer.name ? customer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';
    sAvatar.textContent = initials;
    sName.textContent = customer.name || 'بدون اسم';
    sPhone.textContent = '+' + customer.phone;
    
    display.classList.add('active');
    if (input) input.style.display = 'none';
    if (icon) icon.style.display = 'none';
  }

  // Display all the input fields populated with data
  const fields = document.getElementById('customer-fields');
  if (fields) fields.style.display = 'block';

  // Disable editing of primary info for selected customers
  document.getElementById('c-name').readOnly = true;
  document.getElementById('c-phone').readOnly = true;
  
  if (window.recalcSummary) recalcSummary();
  if (window.markAsModified) window.markAsModified();
};

window.toggleCustomerMode = function (autoExpand = true) {
  const mode = document.querySelector('input[name="customer_type"]:checked').value;
  const existingSection = document.getElementById('existing-customer-section');
  const fields = document.getElementById('customer-fields');
  
  if (mode === 'new') {
    existingSection.style.display = 'none';
    if (fields) fields.style.display = 'block';
    // Clear fields
    document.getElementById('c-name').value = '';
    document.getElementById('c-phone').value = '';
    document.getElementById('c-second-phone').value = '';
    document.getElementById('c-address').value = '';
    document.getElementById('c-gov').value = '';
    const govSearch = document.getElementById('c-gov-search');
    if (govSearch) govSearch.value = '';
    document.getElementById('c-zone').value = '';
    document.getElementById('zone-dropdown').innerHTML = '';
    document.getElementById('customer-search').value = '';
    
    // Reset selected UI
    resetCustomerSelectionUI();
  } else {
    existingSection.style.display = 'block';
    
    // In existing customer mode, hide the input fields until a customer is chosen
    const display = document.getElementById('selected-customer-display');
    const isSelected = display && display.classList.contains('active');
    if (fields) {
      fields.style.display = isSelected ? 'block' : 'none';
    }
    
    if (autoExpand) {
      // Proactively expand/show the customer dropdown list and focus the input when Exist Customer is selected!
      const dropdown = document.getElementById('customer-dropdown');
      const input = document.getElementById('customer-search');
      if (dropdown && allCustomers.length > 0) {
        renderCustomerDropdown(allCustomers);
        dropdown.classList.add('active');
        if (input) {
          setTimeout(() => {
            input.focus();
          }, 50);
        }
      }
    }
  }
};

window.setupSearch = function () {
  const input = document.getElementById('product-search-input');
  if (!input) return;
  const debouncedProductSearch = debounce((q) => {
    const results = document.getElementById('search-results');
    if (q.length < 2) { results.innerHTML = ''; return; }
    const products = Array.isArray(allProducts) ? allProducts : [];
    const filtered = products.filter(p => smartMatch(p.name, q));
    results.innerHTML = filtered.map(p => `
      <div class="search-item" onclick="addToCart('${p._id}')">
        <div style="font-weight:600">${p.name}</div>
        <div style="font-size:0.85rem;color:var(--text-muted)">${formatPrice(p.salePrice || p.basePrice)}</div>
      </div>
    `).join('');
  }, 300);

  input.addEventListener('input', (e) => {
    debouncedProductSearch(e.target.value.toLowerCase().trim());
  });
};

window.setupZoneSearch = function () {
  const input = document.getElementById('c-zone');
  const dropdown = document.getElementById('zone-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('focus', () => {
    if (window._currentCityZones && window._currentCityZones.length > 0) {
      renderZoneDropdown(window._currentCityZones);
      dropdown.classList.add('active');
    }
  });

  input.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (!q) {
      renderZoneDropdown(window._currentCityZones);
      return;
    }
    
    // Remove exact match short-circuit so we only show matched options
    const filtered = (window._currentCityZones || []).filter(z => smartMatch(z, q));
    
    renderZoneDropdown(filtered);
    dropdown.classList.add('active');
  });

  document.addEventListener('click', (e) => {
    const container = document.getElementById('zone-search-container');
    if (container && !container.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
};

function renderZoneDropdown(zones) {
  const dropdown = document.getElementById('zone-dropdown');
  if (!dropdown) return;

  if (!zones || zones.length === 0) {
    dropdown.innerHTML = '<div style="padding:16px; text-align:center; color:#64748b; font-size:0.9rem;">لا توجد مناطق</div>';
    return;
  }

  dropdown.innerHTML = zones.map(z => `
    <div class="customer-item" onclick="selectZone('${z}')">
      <div style="font-weight:600; color:#1e293b; font-size:0.95rem;">${z}</div>
    </div>
  `).join('');
}

window.selectZone = function (name) {
  document.getElementById('c-zone').value = name;
  document.getElementById('zone-dropdown').classList.remove('active');
  
  recalcSummary();
  if (window.markAsModified) window.markAsModified();
};

window.addToCart = function (id) {
  const p = allProducts.find(x => x._id === id);
  if (!p) return;
  cartItems.push({ product: p, quantity: 1, selectedOptions: [], discount: 0 });
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('product-search-input').value = '';
  renderCart();
  if (window.markAsModified) window.markAsModified();
};
