/** Product detail page — full product view with gallery, options, add to cart */
let currentProduct = null;
let selectedQty = 1;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  const handle = params.get('name');

  const loading = document.getElementById('product-loading');
  const detail = document.getElementById('product-detail');

  if (!productId && !handle) {
    loading.innerHTML = '<p style="text-align:center;color:#999">لم يتم تحديد المنتج</p>';
    return;
  }

  try {
    if (handle) {
      currentProduct = await api.getProductByHandle(handle);
    } else {
      currentProduct = await api.getProduct(productId);
    }
    
    document.title = `${currentProduct.name} | `;
    document.getElementById('breadcrumb-name').textContent = currentProduct.name;
    document.getElementById('breadcrumb-container').classList.remove('hidden');
    loading.classList.add('hidden');
    detail.classList.remove('hidden');
    detail.classList.add('fade-in');
    renderProduct(currentProduct);
    
    if (currentProduct.collectionId) {
      loadRelatedProducts(currentProduct.collectionId, currentProduct._id);
    } else if (currentProduct.collectionIds && currentProduct.collectionIds.length > 0) {
      loadRelatedProducts(currentProduct.collectionIds[0], currentProduct._id);
    }
  } catch (err) {
    loading.innerHTML = '<p style="text-align:center;color:#ef4444">فشل تحميل المنتج</p>';
  }
});

function getImages(product) {
  if (product.images && product.images.length > 0) return product.images;
  if (product.imageUrl) return [product.imageUrl];
  return [];
}

function renderProduct(p) {
  const detail = document.getElementById('product-detail');
  const images = getImages(p);
  const salePrice = p.salePrice || p.basePrice;
  const hasDiscount = p.salePrice && p.salePrice < p.basePrice;
  const mainImg = images[0] || '';

  const isUnlimited = p.quantity === null || p.quantity === undefined;
  const isAvailable = isUnlimited || p.quantity > 0;

  // Options HTML
  const optionsHTML = (p.options || []).map((group, gi) => {
    const validValues = group.values.filter(v => {
      if (!p.variants || p.variants.length === 0) return true;
      return p.variants.some(varObj => 
        varObj.combination[group.name] === v.label && 
        (varObj.quantity === null || varObj.quantity === undefined || varObj.quantity > 0)
      );
    });

    if (validValues.length === 0) return '';

    const valuesHTML = validValues.map((v, vi) => {
      return `<div class="radio-option">
        <input type="radio" name="opt_${gi}" id="opt_${gi}_${vi}" value="${v.label}" ${vi === 0 ? 'checked' : ''} onchange="updateTotalPrice()">
        <label for="opt_${gi}_${vi}">${v.label}</label>
      </div>`;
    }).join('');

    return `<div class="option-group" style="margin-bottom:16px">
      <div class="option-group-title" style="margin-bottom:8px;font-weight:600">${group.name}</div>
      <div class="radio-options">${valuesHTML}</div>
    </div>`;
  }).join('');

  const thumbsHTML = images.length > 1 ? `
    <div class="product-gallery-thumbs">
      ${images.map((img, i) => `<img src="${img}" class="product-gallery-thumb ${i === 0 ? 'active' : ''}" onclick="switchMainImage(${i})" alt="thumb">`).join('')}
    </div>` : '';

  const descText = (p.description || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();

  detail.innerHTML = `
    <div class="product-detail-layout">
      <div>
        <div class="product-gallery-main">
          ${images.length > 1 ? `
            <button class="gallery-nav-btn prev" onclick="switchMainImageByOffset(-1)">‹</button>
            <button class="gallery-nav-btn next" onclick="switchMainImageByOffset(1)">›</button>
          ` : ''}
          <img id="main-product-img" src="${mainImg}" alt="${p.name}" data-index="0" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2Y1ZjVmNSIvPjwvc3ZnPg=='">
        </div>
        ${thumbsHTML}
      </div>
      <div class="product-detail-info">
        <h1>${p.name}</h1>
        <div class="product-detail-prices">
          <span class="detail-price-sale" id="display-sale-price">${formatPrice(salePrice)}</span>
          ${hasDiscount ? `<span class="detail-price-original" id="display-original-price">${formatPrice(p.basePrice)}</span>` : ''}
        </div>
        ${optionsHTML}
        
        <div class="product-purchase-row">
          <div class="qty-selector">
            <button onclick="changeQty(-1)">-</button>
            <input type="number" id="qty-input" value="1" min="1" onchange="selectedQty=Math.max(1,parseInt(this.value)||1)">
            <button onclick="changeQty(1)">+</button>
          </div>
          <button class="detail-add-btn" onclick="addProductToCart()" ${!isAvailable ? 'disabled style="opacity:0.5"' : ''}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:8px; vertical-align:middle;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            <span>${isAvailable ? 'أضف إلى السلة' : 'غير متوفر'}</span>
          </button>
        </div>
      </div>
      
      ${descText ? `
        <div class="product-extra-info">
          <div class="product-tabs">
            <div class="tab-item active">وصف المنتج</div>
          </div>
          <div class="tab-content">
            <div class="product-detail-desc">${p.description || ''}</div>
          </div>
        </div>
      ` : ''}
    </div>`;
    
    updateTotalPrice();
}

window.updateTotalPrice = function() {
  if (!currentProduct) return;
  
  const selectedOptionsMap = {};
  const selectedOptionsList = [];
  let optionsOriginalTotal = 0;
  let optionsSaleTotal = 0;
  let hasOverride = false;

  (currentProduct.options || []).forEach((group, gi) => {
    const selected = document.querySelector(`input[name="opt_${gi}"]:checked`);
    if (selected) {
      const label = selected.value;
      const optVal = group.values.find(v => v.label === label) || { label };
      
      selectedOptionsMap[group.name] = label;
      selectedOptionsList.push({ groupName: group.name, label });

      hasOverride = true;
      optionsOriginalTotal += (optVal.price || 0);
      optionsSaleTotal += (optVal.salePrice !== null ? optVal.salePrice : (optVal.price || 0));
    }
  });

  // Find matching variant
  let matchingVariant = null;
  if (currentProduct.variants && currentProduct.variants.length > 0) {
    matchingVariant = currentProduct.variants.find(v => {
      const combo = v.combination instanceof Map ? Object.fromEntries(v.combination) : v.combination;
      return Object.entries(selectedOptionsMap).every(([key, val]) => combo[key] === val);
    });
  }

  let finalBasePrice = currentProduct.basePrice;
  let finalSalePrice = currentProduct.salePrice || currentProduct.basePrice;
  let variantImg = null;
  let isAvailable = true;

  if (matchingVariant) {
    finalBasePrice = matchingVariant.price;
    finalSalePrice = matchingVariant.salePrice !== null ? matchingVariant.salePrice : matchingVariant.price;
    variantImg = matchingVariant.imageUrl;
    isAvailable = matchingVariant.active !== false && (matchingVariant.quantity === null || matchingVariant.quantity > 0);
  } else {
    // Fallback to sum of options logic or base price
    finalBasePrice = optionsOriginalTotal > 0 ? optionsOriginalTotal : currentProduct.basePrice;
    finalSalePrice = optionsSaleTotal > 0 ? optionsSaleTotal : (currentProduct.salePrice || currentProduct.basePrice);
    isAvailable = currentProduct.quantity === null || currentProduct.quantity > 0;
  }
  
  const hasDiscount = finalSalePrice < finalBasePrice;
  const salePriceEl = document.getElementById('display-sale-price');
  const originalPriceEl = document.getElementById('display-original-price');
  const addBtn = document.querySelector('.detail-add-btn');
  
  if (salePriceEl) salePriceEl.textContent = formatPrice(finalSalePrice);
  if (originalPriceEl) {
    if (hasDiscount) {
      originalPriceEl.textContent = formatPrice(finalBasePrice);
      originalPriceEl.style.display = 'inline';
    } else {
      originalPriceEl.style.display = 'none';
    }
  }

  // Update availability button
  if (addBtn) {
    const btnText = addBtn.querySelector('span');
    if (isAvailable) {
      addBtn.disabled = false;
      addBtn.style.opacity = '1';
      if (btnText) btnText.textContent = 'أضف إلى السلة';
    } else {
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      if (btnText) btnText.textContent = 'غير متوفر';
    }
  }

  // Update image if variant has one
  if (variantImg) {
    const mainImg = document.getElementById('main-product-img');
    if (mainImg) mainImg.src = variantImg;
  }

  updateDisabledOptions(selectedOptionsMap);
};

window.updateDisabledOptions = function(currentSelections) {
  if (!currentProduct || !currentProduct.variants || currentProduct.variants.length === 0) return;

  const activeVariants = currentProduct.variants.filter(v => v.active !== false);

  (currentProduct.options || []).forEach((group, gi) => {
    group.values.forEach((v, vi) => {
      const input = document.getElementById(`opt_${gi}_${vi}`);
      if (!input) return;

      // Check if this value is valid given CURRENT selections in OTHER groups
      const isPossible = activeVariants.some(variant => {
        const combo = variant.combination instanceof Map ? Object.fromEntries(variant.combination) : variant.combination;
        
        // 1. Must match this value
        if (combo[group.name] !== v.label) return false;

        // 2. Must match selections in ALL other groups
        return (currentProduct.options || []).every((otherGroup, ogi) => {
          if (ogi === gi) return true; // Skip current group
          const selectedInOther = currentSelections[otherGroup.name];
          if (!selectedInOther) return true; // If nothing selected in other group, it's fine
          return combo[otherGroup.name] === selectedInOther;
        });
      });

      input.disabled = !isPossible;
    });
  });
};



window.switchMainImage = function(index) {
  const images = getImages(currentProduct);
  const mainImg = document.getElementById('main-product-img');
  if (mainImg && images[index]) {
    mainImg.src = images[index];
    mainImg.setAttribute('data-index', index);
  }
  document.querySelectorAll('.product-gallery-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
};

window.switchMainImageByOffset = function(offset) {
  const images = getImages(currentProduct);
  const mainImg = document.getElementById('main-product-img');
  if (!mainImg) return;
  const currentIndex = parseInt(mainImg.getAttribute('data-index') || '0');
  let newIndex = currentIndex + offset;
  if (newIndex >= images.length) newIndex = 0;
  if (newIndex < 0) newIndex = images.length - 1;
  switchMainImage(newIndex);
};

window.changeQty = function(delta) {
  const input = document.getElementById('qty-input');
  selectedQty = Math.max(1, (parseInt(input.value) || 1) + delta);
  input.value = selectedQty;
};

window.addProductToCart = function() {
  if (!currentProduct) return;

  const selectedOptionsMap = {};
  const selectedOptionsList = [];
  
  (currentProduct.options || []).forEach((group, gi) => {
    const selected = document.querySelector(`input[name="opt_${gi}"]:checked`);
    if (selected) {
      const label = selected.value;
      selectedOptionsMap[group.name] = label;
      selectedOptionsList.push({ groupName: group.name, label });
    }
  });

  // Find matching variant for price/image
  let matchingVariant = null;
  if (currentProduct.variants && currentProduct.variants.length > 0) {
    matchingVariant = currentProduct.variants.find(v => {
      const combo = v.combination instanceof Map ? Object.fromEntries(v.combination) : v.combination;
      return Object.entries(selectedOptionsMap).every(([key, val]) => combo[key] === val);
    });
  }

  const itemToSave = { ...currentProduct };
  
  // Calculate prices using the same logic as updateTotalPrice
  let optionsOriginalTotal = 0;
  let optionsSaleTotal = 0;
  let hasOverride = false;

  (currentProduct.options || []).forEach((group, gi) => {
    const selected = document.querySelector(`input[name="opt_${gi}"]:checked`);
    if (selected) {
      const label = selected.value;
      const optVal = group.values.find(v => v.label === label) || { label };
      hasOverride = true;
      optionsOriginalTotal += (optVal.price || 0);
      optionsSaleTotal += (optVal.salePrice !== null ? optVal.salePrice : (optVal.price || 0));
    }
  });

  let finalBasePrice, finalSalePrice;

  if (matchingVariant) {
    finalBasePrice = matchingVariant.price;
    finalSalePrice = matchingVariant.salePrice !== null ? matchingVariant.salePrice : matchingVariant.price;
    if (matchingVariant.imageUrl) itemToSave.imageUrl = matchingVariant.imageUrl;
  } else {
    finalBasePrice = optionsOriginalTotal > 0 ? optionsOriginalTotal : currentProduct.basePrice;
    finalSalePrice = optionsSaleTotal > 0 ? optionsSaleTotal : (currentProduct.salePrice || currentProduct.basePrice);
  }

  itemToSave.basePrice = finalBasePrice;
  itemToSave.salePrice = finalSalePrice;

  const qtyInput = document.getElementById('qty-input');
  const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

  for (let i = 0; i < qty; i++) {
    Cart.addItem(itemToSave, selectedOptionsList);
  }
  Cart.openCart();
};


async function loadRelatedProducts(colId, currentId) {
  try {
    const products = await api.getProductsByCollection(colId);
    const related = products.filter(p => p._id !== currentId).slice(0, 5);
    if (related.length > 0) {
      const container = document.getElementById('related-products-container');
      const grid = document.getElementById('related-products-grid');
      container.classList.remove('hidden');
      grid.innerHTML = related.map(p => renderRelatedProductCard(p)).join('');
    }
  } catch (e) {
    console.error('Failed to load related products', e);
  }
}

function renderRelatedProductCard(p) {
  const images = p.images && p.images.length > 0 ? p.images : (p.imageUrl ? [p.imageUrl] : []);
  const img = images[0] || '';
  const salePrice = p.salePrice || p.basePrice;
  const hasDiscount = p.salePrice && p.salePrice < p.basePrice;
  const productLink = p.handle ? `product/${p.handle}` : `product?id=${p._id}`;
  const hasOptions = p.options && p.options.length > 0;
  
  const pJson = JSON.stringify({
    _id: p._id, name: p.name, basePrice: p.basePrice, salePrice: p.salePrice,
    images: p.images, imageUrl: p.imageUrl, options: p.options, quantity: p.quantity
  }).replace(/"/g, '&quot;');

  const btnHtml = hasOptions 
    ? `<a href="${productLink}" class="btn btn-secondary btn-block" style="margin-top:8px;text-align:center;padding:6px;font-size:0.9rem">حدد اختيارك</a>`
    : `<button class="btn btn-primary btn-block" style="margin-top:8px;padding:6px;font-size:0.9rem" data-product="${pJson}" onclick="quickAddToCart(event, this)">أضف للسلة</button>`;

  return `
    <div class="store-product-card" style="display:flex;flex-direction:column;">
      <a href="${productLink}" style="display:block; text-decoration:none; color:inherit; flex:1;">
        <div class="store-product-img" style="position:relative">
          ${img ? `<img src="${img}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : ''}
          ${hasDiscount ? '<span class="discount-badge">خصم</span>' : ''}
        </div>
        <div class="store-product-info">
          <div class="store-product-name">${p.name}</div>
          <div class="store-product-prices">
            <span class="store-price-sale">${formatPrice(salePrice)}</span>
            ${hasDiscount ? `<span class="store-price-original">${formatPrice(p.basePrice)}</span>` : ''}
          </div>
        </div>
      </a>
      <div style="padding: 0 12px 12px; margin-top:auto;">
        ${btnHtml}
      </div>
    </div>`;
}

window.quickAddToCart = function(event, btn) {
  event.preventDefault();
  event.stopPropagation();
  let p;
  try {
    p = JSON.parse(btn.dataset.product);
  } catch (e) {
    console.error('Failed to parse product data', e);
    return;
  }
  const isUnlimited = p.quantity === null || p.quantity === undefined;
  if (!isUnlimited && p.quantity <= 0) {
    if(window.showToast) window.showToast('عذراً، المنتج غير متوفر حالياً', 'error');
    else alert('عذراً، المنتج غير متوفر حالياً');
    return;
  }
  if(window.Cart) {
    window.Cart.addItem(p);
    window.Cart.openCart();
  }
}
