/** Homepage — renders sections from homepage builder config */
const STORAGE_KEY = 'sundura_homepage_sections';

document.addEventListener('DOMContentLoaded', async () => {
  const content = document.getElementById('home-content');

  try {
    const [products, collections] = await Promise.all([
      api.getProducts(null, null, false),
      api.getCollections()
    ]);

    // Try to load homepage config
    let sections = [];
    try {
      const saved = await api.getSetting(STORAGE_KEY);
      if (saved) sections = saved;
    } catch (e) {
      console.error('Failed to load homepage sections from API', e);
      // Fallback to localStorage for smooth transition
      const savedLocal = localStorage.getItem(STORAGE_KEY);
      if (savedLocal) sections = JSON.parse(savedLocal);
    }

    if (sections && sections.length > 0) {
      renderFromConfig(sections, products, collections);
    } else {
      content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#94a3b8">لا توجد أقسام معروضة في المتجر حالياً.</div>';
    }

  } catch (err) {
    if (content) content.innerHTML = '<p style="text-align:center;color:#ef4444;padding:40px">فشل تحميل المتجر. يرجى المحاولة لاحقاً.</p>';
  }
});

async function renderFromConfig(sections, products, collections) {
  const container = document.getElementById('home-content');
  let html = '';

  for (const s of sections) {
    if (s.type === 'products') {
      html += await renderProductSection(s, products, collections);
    } else if (s.type === 'collections') {
      html += renderCollectionSection(s, collections);
    } else if (s.type === 'banner') {
      html += renderBannerSection(s);
    } else if (s.type === 'text') {
      html += renderTextSection(s);
    }
  }

  container.innerHTML = html;
}

async function renderProductSection(s, products, collections) {
  let sectionProducts = [];

  if (s.productIds && s.productIds.length > 0) {
    // Manually selected products
    sectionProducts = s.productIds
      .map(id => products.find(p => p._id === id))
      .filter(Boolean);
  } else if (s.collectionId) {
    // Fetch products for this specific collection dynamically to avoid limit issues
    try {
      const res = await api.getProducts(1, s.maxItems || 8, false, s.collectionId);
      sectionProducts = res.products || res || [];

      // Sort by collection productOrder if available
      const col = collections.find(c => c._id === s.collectionId);
      if (col && col.productOrder) {
        sectionProducts.sort((a, b) => {
          const idxA = col.productOrder.indexOf(a._id);
          const idxB = col.productOrder.indexOf(b._id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }
    } catch (e) {
      console.error('Failed to fetch section products', e);
      // Fallback to filtering the global list
      sectionProducts = products.filter(p => {
        const ids = (p.collectionIds || []).map(id => id.toString());
        return ids.includes(s.collectionId) || (p.collectionId && p.collectionId.toString() === s.collectionId);
      });
    }
  } else {
    // Fallback: all products
    sectionProducts = products;
  }

  sectionProducts = sectionProducts.filter(p => p.quantity === null || p.quantity === undefined || p.quantity > 0);
  sectionProducts = sectionProducts.slice(0, s.maxItems || 8);
  if (sectionProducts.length === 0) return '';

  const cols = s.itemsPerRow || 4;
  return `
    <section class="home-section">
      ${s.showTitle !== false && s.title ? `<h2 class="home-section-title">${s.title}</h2>` : ''}
      <div class="products-grid" style="margin-bottom:32px; --cols:${cols}">
        ${sectionProducts.map((p, idx) => renderStoreCard(p, idx < 4 ? false : true)).join('')}
      </div>
    </section>`;
}

function renderCollectionSection(s, collections) {
  let displayCols = collections;

  if (s.selectedCollections && s.selectedCollections.length > 0) {
    displayCols = s.selectedCollections
      .map(id => collections.find(c => c._id === id))
      .filter(Boolean);
  }

  if (displayCols.length === 0) return '';

  return `
    <section class="home-section" id="collections-section">
      ${s.showTitle !== false && s.title ? `<h2 class="home-section-title">${s.title}</h2>` : ''}
      <div class="cat-grid" id="collections-grid">
        ${displayCols.map((c, idx) => {
    const img = api.optimizeImageUrl(c.imageUrl, 250);
    const link = c.urlName ? `collection.html?handle=${c.urlName}` : `collection.html?id=${c._id}`;
    const lazyAttr = idx < 4 ? '' : 'loading="lazy"';
    return `
            <a href="${link}" class="cat-item">
              <img src="${img}" alt="${c.name}" ${lazyAttr} onerror="this.style.background='#f5efe9'">
              ${s.showNames !== false ? `<div class="cat-label">${c.name}</div>` : ''}
            </a>`;
  }).join('')}
      </div>
    </section>`;
}

function renderBannerSection(s) {
  if (!s.imageUrl) return '';

  const getLink = (type, val) => {
    if (type === 'collection' && val) return `collection.html?id=${val}`;
    if (type === 'collections_page') return 'products.html#collections';
    if (type === 'products_page') return 'products.html';
    if (type === 'custom' && val) return val;
    return '';
  };

  const link1 = getLink(s.linkType, s.linkValue);
  const link2 = getLink(s.link2Type, s.link2Value);

  const btn1 = s.showBtn ? `
    <a href="${link1 || '#'}" class="btn btn-primary" style="padding:10px 24px; border-radius:30px; box-shadow:0 4px 12px rgba(0,0,0,0.15); text-decoration:none; display:inline-block; margin-bottom:8px; width:fit-content;">${s.btnText || 'تسوق الآن'}</a>` : '';

  const btn2 = s.showBtn2 ? `
    <a href="${link2 || '#'}" class="btn btn-secondary" style="padding:10px 24px; border-radius:30px; box-shadow:0 4px 12px rgba(0,0,0,0.15); text-decoration:none; display:inline-block; width:fit-content; border:none; background:#fff; color:var(--primary); font-weight:600;">${s.btn2Text || 'المزيد'}</a>` : '';

  const btnsContainer = (s.showBtn || s.showBtn2) ? `
    <div style="position:absolute; bottom:20px; right:20px; z-index:2; display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
      ${btn1}
      ${btn2}
    </div>` : '';

  return `
    <section class="home-section" style="margin-bottom:24px; position:relative;">
      ${s.showTitle !== false && s.title ? `<h2 class="home-section-title" style="margin-bottom:12px">${s.title}</h2>` : ''}
      <div style="position:relative; border-radius:12px; overflow:hidden; box-shadow:0 2px 15px rgba(0,0,0,0.05);">
        <img src="${api.optimizeImageUrl(s.imageUrl, 1200)}" alt="${s.title || 'Banner'}" style="width:100%; display:block; max-height:500px; object-fit:contain; background:#f8fafc">
        ${btnsContainer}
      </div>
    </section>`;
}

function renderTextSection(s) {
  if (!s.content) return '';
  return `
    <section class="home-section">
      ${s.showTitle !== false && s.title ? `<h2 class="home-section-title">${s.title}</h2>` : ''}
      <div style="color:#475569;line-height:1.8;font-size:1rem">${s.content}</div>
    </section>`;
}

// Render store card for product sections
function getImg(product) {
  if (product.images && product.images.length > 0) return product.images[0];
  if (product.imageUrl) return product.imageUrl;
  return '';
}

function renderStoreCard(p, lazy = true) {
  const img = api.optimizeImageUrl(getImg(p), 400);
  const hasVariants = p.variants && p.variants.length > 0;
  const hasOptions = p.options && p.options.length > 0;

  const displayPrice = p.salePrice || p.basePrice;
  const originalPrice = p.basePrice;
  const isRange = false;

  const hasDiscount = displayPrice < originalPrice;
  const productLink = p.handle ? `product.html?handle=${p.handle}` : `product.html?id=${p._id}`;

  const pJson = JSON.stringify({
    _id: p._id, name: p.name, basePrice: p.basePrice, salePrice: p.salePrice,
    images: p.images, imageUrl: p.imageUrl, options: p.options, quantity: p.quantity
  }).replace(/"/g, '&quot;');

  const btnHtml = (hasVariants || hasOptions)
    ? `<a href="${productLink}" class="btn btn-secondary btn-block" style="margin-top:8px;text-align:center;padding:8px;font-size:0.9rem;border-radius:8px;">حدد اختيارك</a>`
    : `<button class="btn btn-primary btn-block" style="margin-top:8px;padding:8px;font-size:0.9rem;border-radius:8px;" data-product="${pJson}" onclick="quickAddToCart(event, this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><span>أضف للسلة</span></button>`;

  const lazyAttr = lazy ? 'loading="lazy"' : '';
  return `
    <div class="store-product-card" style="display:flex;flex-direction:column;">
      <a href="${productLink}" style="display:block; text-decoration:none; color:inherit; flex:1;">
        <div class="store-product-img" style="position:relative; background:#f8fafc; overflow:hidden; border-radius:12px;">
          ${img ? `
            <img src="${img}" alt="${p.name}" style="width:100%;height:100%;object-fit:contain;transition:transform 0.3s;" ${lazyAttr} class="product-hover-img">
          ` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
          ${hasDiscount ? '<span class="discount-badge">خصم</span>' : ''}
        </div>
        <div class="store-product-info" style="padding:12px 4px;">
          <div class="store-product-name" style="font-weight:500; margin-bottom:6px; color:var(--text-main); font-size:0.95rem;">${p.name}</div>
          <div class="store-product-prices" style="display:flex; align-items:center; gap:8px;">
            <span class="store-price-sale" style="font-weight:700; color:var(--primary); font-size:1.1rem;">
              ${isRange ? '<span style="font-size:0.8rem; font-weight:500; color:#64748b; margin-left:2px;">يبدأ من</span>' : ''}
              ${formatPrice(displayPrice)}
            </span>
            ${hasDiscount && !isRange ? `<span class="store-price-original" style="text-decoration:line-through; color:#94a3b8; font-size:0.85rem;">${formatPrice(originalPrice)}</span>` : ''}
          </div>
        </div>
      </a>
      <div style="padding: 0 4px 12px; margin-top:auto;">
        ${btnHtml}
      </div>
    </div>`;
}

window.quickAddToCart = function (event, btn) {
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
    if (window.showToast) window.showToast('عذراً، المنتج غير متوفر حالياً', 'error');
    else alert('عذراً، المنتج غير متوفر حالياً');
    return;
  }
  if (window.Cart) {
    window.Cart.addItem(p, []);
    window.Cart.openCart();
  }
}
