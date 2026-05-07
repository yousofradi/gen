/** Collection page — loads products for a specific collection with pagination */
let currentPage = 1;
let totalPages = 1;
const LIMIT = 30;
let currentCollectionId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const slug = params.get('u');
  
  if (!id && !slug) {
    document.getElementById('collection-products').innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1;padding:40px">لم يتم تحديد تصنيف</p>';
    return;
  }

  try {
    const col = await api.getCollection(id || slug);
    currentCollectionId = col._id;
    document.title = `${col.name} | `;
    document.getElementById('collection-title').textContent = col.name;
    document.getElementById('breadcrumb-name').textContent = col.name;
    loadCollectionProducts(1);
  } catch (err) {
    document.getElementById('collection-products').innerHTML = '<p style="text-align:center;color:#ef4444;grid-column:1/-1;padding:40px">التصنيف غير موجود</p>';
  }
});

async function loadCollectionProducts(page) {
  const grid = document.getElementById('collection-products');
  
  try {
    // Fetching handled by DOMContentLoaded for slug support

    const res = await api._request(`/products?collectionId=${currentCollectionId}&page=${page}&limit=${LIMIT}`);
    
    const products = Array.isArray(res) ? res : (res.products || []);
    const total = res.total !== undefined ? res.total : products.length;
    totalPages = res.totalPages || Math.ceil(total / LIMIT) || 1;
    currentPage = page;

    if (!products || products.length === 0) {
      if (page === 1) {
        grid.innerHTML = `
          <div style="text-align:center; padding:60px 20px; color:var(--text-muted); grid-column:1/-1">
            <div style="margin-bottom:16px; opacity:0.4;">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
            </div>
            <p style="font-weight:600; font-size:1.1rem; color:var(--text-main);">لا توجد منتجات في هذا التصنيف حالياً</p>
          </div>`;
      }
      return;
    }

    grid.innerHTML = products.map(p => renderProductCard(p)).join('');
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    grid.innerHTML = '<p style="text-align:center;color:#ef4444;grid-column:1/-1;padding:40px">فشل تحميل المنتجات. يرجى المحاولة لاحقاً.</p>';
  }
}

function renderPagination() {
  let nav = document.getElementById('pagination-nav');
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'pagination-nav';
    document.getElementById('collection-products').after(nav);
  }

  if (totalPages <= 1) {
    nav.innerHTML = '';
    return;
  }

  nav.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; gap:12px; margin:40px 0;">
      <button class="btn btn-secondary" onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} style="padding:8px 16px; border-radius:8px;">السابق</button>
      <div style="font-weight:600; color:#475569;">صفحة ${currentPage} من ${totalPages}</div>
      <button class="btn btn-secondary" onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:8px 16px; border-radius:8px;">التالي</button>
    </div>
  `;
}

window.changePage = function(page) {
  if (page < 1 || page > totalPages) return;
  loadCollectionProducts(page);
};

function getImg(product) {
  if (product.images && product.images.length > 0) return product.images[0];
  if (product.imageUrl) return product.imageUrl;
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
}

function renderProductCard(p) {
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
    window.Cart.addItem(p, []);
    window.Cart.openCart();
  }
}
