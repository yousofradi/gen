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
    } catch(e) {
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
        ${sectionProducts.map(p => renderStoreCard(p)).join('')}
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
        ${displayCols.map(c => {
          const img = c.imageUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2Y1ZWZlOSIvPjwvc3ZnPg==';
          const link = c.urlName ? `collection/${c.urlName}` : `collection?id=${c._id}`;
          return `
            <a href="${link}" class="cat-item">
              <img src="${img}" alt="${c.name}" loading="lazy" onerror="this.style.background='#f5efe9'">
              ${s.showNames !== false ? `<div class="cat-label">${c.name}</div>` : ''}
            </a>`;
        }).join('')}
      </div>
    </section>`;
}

function renderBannerSection(s) {
  if (!s.imageUrl) return '';
  const wrapper = s.linkUrl ? `<a href="${s.linkUrl}" style="display:block">` : '<div>';
  const wrapperEnd = s.linkUrl ? '</a>' : '</div>';
  
  return `
    <section class="home-section">
      ${s.showTitle !== false && s.title ? `<h2 class="home-section-title">${s.title}</h2>` : ''}
      ${wrapper}
        <img src="${s.imageUrl}" alt="${s.title || 'Banner'}" style="width:100%;border-radius:12px;max-height:400px;object-fit:contain;background:#f5efe9" loading="lazy">
      ${wrapperEnd}
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

function renderStoreCard(p) {
  const img = getImg(p);
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
        <div class="store-product-img" style="position:relative; background:#f8fafc;">
          ${img ? `
            <img src="${img}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none'">
          ` : `<svg width="200" height="150" viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="150" fill="#f5f5f5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#999" font-size="14">No Image</text></svg>`}
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
    window.Cart.addItem(p, []);
    window.Cart.openCart();
  }
}
