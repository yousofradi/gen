/** Homepage Builder — manages storefront sections */
const STORAGE_KEY = 'sundura_homepage_sections';
let sections = [];
let allCollections = [];
let allProducts = [];
let sortableInstance = null;
let originalSections = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAdmin()) return;

  // Load data
  try {
    [allCollections, allProducts] = await Promise.all([
      api.getCollections().catch(() => []),
      api.getProducts(null, null, true).then(r => r.products || r).catch(() => [])
    ]);

    await loadSections();
    renderSections();
  } catch (err) {
    console.error('Failed to init homepage builder:', err);
  } finally {
    document.body.classList.remove('is-loading');
  }
});

async function loadSections() {
  try {
    const saved = await api.getSetting(STORAGE_KEY);
    if (saved) sections = saved;
    else throw new Error('No saved settings');
  } catch (e) {
    try {
      const savedLocal = localStorage.getItem(STORAGE_KEY);
      if (savedLocal) sections = JSON.parse(savedLocal);
    } catch (err) { sections = []; }
  }

  // Default sections removed as per user request
  originalSections = JSON.parse(JSON.stringify(sections));

  window.handleGlobalSave = async () => {
    await saveSections();
    return true;
  };

  window.handleGlobalDiscard = () => {
    if (originalSections) {
      sections = JSON.parse(JSON.stringify(originalSections));
      renderSections();
      if (window.hideBar) window.hideBar();
    }
  };
}

async function saveSections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  try {
    await api.updateSetting(STORAGE_KEY, sections);
    originalSections = JSON.parse(JSON.stringify(sections));
  } catch (err) {
    console.error('Failed to save to API', err);
  }
}

function genId() { return '_' + Math.random().toString(36).substr(2, 9); }

function getTypeIcon(type) {
  const icons = {
    products: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
    collections: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    banner: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    text: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>`
  };
  return icons[type] || `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
}

function getTypeLabel(type) {
  const labels = { products: 'قسم للمنتجات', collections: 'قسم للمجموعات', banner: 'قسم للافتات', text: 'قسم للنص' };
  return labels[type] || 'قسم';
}

function getSectionDescription(s) {
  if (s.type === 'products') {
    const col = allCollections.find(c => c._id === s.collectionId);
    const colName = col ? col.name : 'الكل';
    return `${s.maxItems || '?'} منتجات من ${colName} ● يظهر كشبكة`;
  }
  if (s.type === 'collections') {
    return `${(s.selectedCollections || []).length || 'كل'} مجموعات`;
  }
  if (s.type === 'banner') return s.imageUrl ? 'صورة مخصصة' : 'بدون صورة';
  if (s.type === 'text') return s.content ? s.content.substring(0, 40) + '...' : 'نص فارغ';
  return '';
}

function renderSections() {
  const list = document.getElementById('sections-list');

  if (!sections.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8">لا توجد أقسام بعد. أضف قسم جديد من الأسفل.</div>';
    return;
  }

  list.innerHTML = sections.map((s, i) => `
    <div class="hp-section" data-id="${s.id}">
      <div class="hp-drag" title="اسحب لإعادة الترتيب">⠿</div>
      <div class="hp-icon">${getTypeIcon(s.type)}</div>
      <div class="hp-info">
        <h4>${s.title || getTypeLabel(s.type)}</h4>
        <p>${getSectionDescription(s)}</p>
      </div>
      <div class="hp-actions">
        <button onclick="editSection('${s.id}')">تعديل</button>
        <button class="btn-del" onclick="deleteSection('${s.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Init drag
  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = new Sortable(list, {
    handle: '.hp-drag',
    animation: 150,
    onEnd: async () => {
      const newOrder = Array.from(list.children).map(el => el.getAttribute('data-id'));
      sections = newOrder.map(id => sections.find(s => s.id === id)).filter(Boolean);
      if (window.markAsModified) window.markAsModified();
    }
  });
}

function showTypePicker() {
  document.getElementById('type-picker-area').classList.toggle('hidden');
}

async function addSection(type) {
  const s = { id: genId(), type, title: '', showTitle: true };

  if (type === 'products') {
    s.title = 'منتجات مميزة';
    s.collectionId = '';
    s.itemsPerRow = 4;
    s.maxItems = 4;
    s.style = 'grid';
  } else if (type === 'collections') {
    s.title = 'التصنيفات';
    s.selectedCollections = [];
    s.itemsPerRow = 2;
    s.showNames = true;
  } else if (type === 'banner') {
    s.imageUrl = '';
    s.linkType = 'none';
    s.linkValue = '';
    s.btnText = 'تسوق الآن';
    s.showBtn = false;
    // Second button
    s.link2Type = 'none';
    s.link2Value = '';
    s.btn2Text = 'المزيد';
    s.showBtn2 = false;
  } else if (type === 'text') {
    s.content = '';
  }

  sections.push(s);
  if (window.markAsModified) window.markAsModified();
  renderSections();
  document.getElementById('type-picker-area').classList.add('hidden');
  showToast('تم إضافة القسم بنجاح');

  // Open edit immediately
  editSection(s.id);
}

window.deleteSection = async function (id) {
  const ok = await window.showConfirmModal('حذف القسم', 'هل تريد حذف هذا القسم؟');
  if (!ok) return;
  sections = sections.filter(s => s.id !== id);
  if (window.markAsModified) window.markAsModified();
  renderSections();
};

window.editSection = function (id) {
  const s = sections.find(s => s.id === id);
  if (!s) return;

  const modal = document.getElementById('section-modal');

  if (s.type === 'products') {
    renderProductsEditor(s);
  } else if (s.type === 'collections') {
    renderCollectionsEditor(s);
    initColSortable(s.id);
  } else if (s.type === 'banner') {
    renderBannerEditor(s);
  } else if (s.type === 'text') {
    renderTextEditor(s);
  }
};

function renderProductsEditor(s) {
  const modal = document.getElementById('section-modal');
  const colOptions = allCollections.map(c =>
    `<option value="${c._id}" ${s.collectionId === c._id ? 'selected' : ''}>${c.name}</option>`
  ).join('');

  modal.innerHTML = `
    <div class="hp-modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="hp-modal">
        <div class="hp-modal-header">
          <h3>◈ تعديل قسم المنتجات</h3>
          <button class="hp-modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="hp-modal-body">
          <div class="form-row">
            <label>العنوان الرئيسي</label>
            <input type="text" id="ed-title" value="${s.title || ''}" placeholder="عروض لفترة محدودة" maxlength="160">
            <small style="color:#94a3b8;font-size:0.75rem">بحد أقصى 160 حرف</small>
          </div>
          
          <div class="toggle-row">
            <span style="font-weight:600;font-size:0.9rem">أظهر العنوان الرئيسي</span>
            <label class="toggle-switch">
              <input type="checkbox" id="ed-showTitle" ${s.showTitle ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="form-row" style="margin-top:16px">
            <label>عدد المنتجات في الصف</label>
            <input type="number" id="ed-itemsPerRow" value="${s.itemsPerRow || 4}" min="1" max="6">
          </div>
          
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:16px 0">
          
          <div class="form-row">
            <label>عرض المنتجات من</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label style="font-weight:400;font-size:0.85rem">اختر مجموعة</label>
                <select id="ed-collectionId" class="form-control" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;">
                  <option value="">كل المنتجات</option>
                  ${colOptions}
                </select>
              </div>
              <div>
                <label style="font-weight:400;font-size:0.85rem">عدد المنتجات المعروضة</label>
                <input type="number" id="ed-maxItems" value="${s.maxItems || 4}" min="1" max="50">
              </div>
            </div>
          </div>
        </div>
        <div class="hp-modal-footer">
          <button class="btn btn-primary" style="background:#0f766e;border:none;padding:10px 24px;border-radius:8px;color:#fff;font-weight:600;cursor:pointer" onclick="saveProductsSection('${s.id}')">احفظ</button>
          <button class="btn btn-secondary" style="padding:10px 24px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer" onclick="closeModal()">إلغاء</button>
        </div>
      </div>
    </div>`;
}

function renderCollectionsEditor(s) {
  const modal = document.getElementById('section-modal');
  const selectedIds = s.selectedCollections || [];

  modal.innerHTML = `
    <div class="hp-modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="hp-modal">
        <div class="hp-modal-header">
          <h3>🗂 أضف قسم للمجموعات</h3>
          <button class="hp-modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="hp-modal-body">
          <div class="form-row">
            <label>العنوان الرئيسي</label>
            <input type="text" id="ed-title" value="${s.title || ''}" placeholder="التصنيفات" maxlength="160">
          </div>
          
          <div class="toggle-row">
            <span style="font-weight:600;font-size:0.9rem">أظهر العنوان الرئيسي</span>
            <label class="toggle-switch">
              <input type="checkbox" id="ed-showTitle" ${s.showTitle ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="form-row" style="margin-top:16px">
            <label>عدد المجموعات في كل صف</label>
            <input type="number" id="ed-itemsPerRow" value="${s.itemsPerRow || 2}" min="1" max="6">
          </div>
          
          <div class="toggle-row">
            <span style="font-weight:600;font-size:0.9rem">أظهر أسماء المجموعات</span>
            <label class="toggle-switch">
              <input type="checkbox" id="ed-showNames" ${s.showNames !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:16px 0">
          
          <div class="form-row">
            <label>المجموعات التي سيتم عرضها</label>
            <p style="font-size:0.8rem;color:#94a3b8;margin-bottom:8px">اختر المجموعات أو اتركها فارغة لعرض الكل</p>
            <button class="btn btn-secondary" style="margin-bottom:12px;border-radius:8px;border:1px solid #0f766e;color:#0f766e;padding:8px 16px;cursor:pointer;background:#fff;" onclick="openCollectionPicker('${s.id}')">+ أضف مجموعة</button>
            <div id="selected-cols-list">
              ${selectedIds.length ? selectedIds.map(cid => {
    const c = allCollections.find(x => x._id === cid);
    return c ? `<div class="col-picker-item selected" style="justify-content:space-between" data-cid="${cid}">
                  <div style="display:flex;align-items:center;gap:10px">
                    <div class="col-drag-handle" style="cursor:grab;color:#94a3b8;padding:0 8px">⠿</div>
                    ${c.imageUrl ? `<img src="${api.optimizeImageUrl(c.imageUrl, 60)}" alt="" style="width:30px;height:30px;border-radius:4px">` : ''}
                    <span>${c.name}</span>
                  </div>
                  <button onclick="removeSelectedCol('${s.id}','${cid}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1.2rem;padding:4px 10px">×</button>
                </div>` : '';
  }).join('') : '<div style="text-align:center;padding:16px;color:#94a3b8;background:#f9fafb;border-radius:8px">لم يتم اختيار أي مجموعة بعد</div>'}
            </div>
          </div>
        </div>
        <div class="hp-modal-footer">
          <button class="btn btn-primary" style="background:#0f766e;border:none;padding:10px 24px;border-radius:8px;color:#fff;font-weight:600;cursor:pointer" onclick="saveCollectionsSection('${s.id}')">احفظ</button>
          <button class="btn btn-secondary" style="padding:10px 24px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer" onclick="closeModal()">إلغاء</button>
        </div>
      </div>
    </div>`;
}

function renderBannerEditor(s) {
  const modal = document.getElementById('section-modal');
  const colOptions = allCollections.map(c =>
    `<option value="${c._id}">${c.name}</option>`
  ).join('');

  modal.innerHTML = `
    <div class="hp-modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="hp-modal">
        <div class="hp-modal-header">
          <h3>🖼 تعديل قسم اللافتات</h3>
          <button class="hp-modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="hp-modal-body">
          <div class="form-row">
            <label>عنوان القسم (اختياري)</label>
            <input type="text" id="ed-title" value="${s.title || ''}" placeholder="عنوان اللافتة">
          </div>
          
          <div class="form-row" style="margin-top:16px">
            <label>صورة اللافتة</label>
            <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px">
              <input type="text" id="ed-imageUrl" value="${s.imageUrl || ''}" placeholder="رابط الصورة https://..." dir="ltr" style="flex:1">
              <button class="btn btn-secondary" onclick="document.getElementById('banner-upload').click()" style="padding:8px 12px; font-size:0.85rem">رفع صورة</button>
              <input type="file" id="banner-upload" hidden accept="image/*" onchange="handleBannerUpload(this)">
            </div>
            <div id="banner-preview" style="text-align:center">
              ${s.imageUrl ? `<img src="${api.optimizeImageUrl(s.imageUrl, 300)}" style="max-width:100%;border-radius:12px;max-height:150px;box-shadow:0 4px 12px rgba(0,0,0,0.1)" onerror="this.style.display='none'">` : '<div style="height:100px; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:0.85rem">لا توجد صورة بعد</div>'}
            </div>
          </div>

          <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0">

          <!-- Button 1 -->
          <div style="background:#f8fafc; padding:16px; border-radius:12px; margin-bottom:16px">
            <div class="toggle-row" style="margin-bottom:12px">
              <span style="font-weight:600;font-size:0.9rem">الزر الأول</span>
              <label class="toggle-switch">
                <input type="checkbox" id="ed-showBtn" ${s.showBtn ? 'checked' : ''} onchange="document.getElementById('btn1-config').style.display=this.checked?'block':'none'">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div id="btn1-config" style="display:${s.showBtn ? 'block' : 'none'}">
              <div class="form-row">
                <label>نص الزر</label>
                <input type="text" id="ed-btnText" value="${s.btnText || ''}" placeholder="مثال: تسوق الآن">
              </div>
              <div class="form-row">
                <label>وجهة الرابط</label>
                <select id="ed-linkType" onchange="toggleBannerLinkFields('1')">
                  <option value="none" ${s.linkType === 'none' ? 'selected' : ''}>بدون رابط</option>
                  <option value="collection" ${s.linkType === 'collection' ? 'selected' : ''}>مجموعة محددة</option>
                  <option value="collections_page" ${s.linkType === 'collections_page' ? 'selected' : ''}>صفحة كل المجموعات</option>
                  <option value="products_page" ${s.linkType === 'products_page' ? 'selected' : ''}>صفحة كل المنتجات</option>
                  <option value="custom" ${s.linkType === 'custom' ? 'selected' : ''}>رابط مخصص</option>
                </select>
                <div id="link1-val-col" class="link-field-1 mt-8" style="display:${s.linkType === 'collection' ? 'block' : 'none'}">
                  <select id="ed-linkValue-col-1">${colOptions}</select>
                </div>
                <div id="link1-val-custom" class="link-field-1 mt-8" style="display:${s.linkType === 'custom' ? 'block' : 'none'}">
                  <input type="url" id="ed-linkValue-url-1" value="${s.linkType === 'custom' ? s.linkValue : ''}" placeholder="https://..." dir="ltr">
                </div>
              </div>
            </div>
          </div>

          <!-- Button 2 -->
          <div style="background:#f8fafc; padding:16px; border-radius:12px;">
            <div class="toggle-row" style="margin-bottom:12px">
              <span style="font-weight:600;font-size:0.9rem">الزر الثاني</span>
              <label class="toggle-switch">
                <input type="checkbox" id="ed-showBtn2" ${s.showBtn2 ? 'checked' : ''} onchange="document.getElementById('btn2-config').style.display=this.checked?'block':'none'">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div id="btn2-config" style="display:${s.showBtn2 ? 'block' : 'none'}">
              <div class="form-row">
                <label>نص الزر</label>
                <input type="text" id="ed-btn2Text" value="${s.btn2Text || ''}" placeholder="مثال: تواصل معنا">
              </div>
              <div class="form-row">
                <label>وجهة الرابط</label>
                <select id="ed-link2Type" onchange="toggleBannerLinkFields('2')">
                  <option value="none" ${s.link2Type === 'none' ? 'selected' : ''}>بدون رابط</option>
                  <option value="collection" ${s.link2Type === 'collection' ? 'selected' : ''}>مجموعة محددة</option>
                  <option value="collections_page" ${s.link2Type === 'collections_page' ? 'selected' : ''}>صفحة كل المجموعات</option>
                  <option value="products_page" ${s.link2Type === 'products_page' ? 'selected' : ''}>صفحة كل المنتجات</option>
                  <option value="custom" ${s.link2Type === 'custom' ? 'selected' : ''}>رابط مخصص</option>
                </select>
                <div id="link2-val-col" class="link-field-2 mt-8" style="display:${s.link2Type === 'collection' ? 'block' : 'none'}">
                  <select id="ed-linkValue-col-2">${colOptions}</select>
                </div>
                <div id="link2-val-custom" class="link-field-2 mt-8" style="display:${s.link2Type === 'custom' ? 'block' : 'none'}">
                  <input type="url" id="ed-linkValue-url-2" value="${s.link2Type === 'custom' ? s.link2Value : ''}" placeholder="https://..." dir="ltr">
                </div>
              </div>
            </div>
          </div>

        </div>
        <div class="hp-modal-footer">
          <button class="btn btn-primary" style="background:#0f766e;border:none;padding:10px 24px;border-radius:8px;color:#fff;font-weight:600;cursor:pointer" onclick="saveBannerSection('${s.id}')">احفظ</button>
          <button class="btn btn-secondary" style="padding:10px 24px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer" onclick="closeModal()">إلغاء</button>
        </div>
      </div>
    </div>`;

  // Set initial collection values if needed
  if (s.linkType === 'collection' && s.linkValue) document.getElementById('ed-linkValue-col-1').value = s.linkValue;
  if (s.link2Type === 'collection' && s.link2Value) document.getElementById('ed-linkValue-col-2').value = s.link2Value;
}

window.toggleBannerLinkFields = function(num) {
  const type = document.getElementById(`ed-link${num === '1' ? '' : '2'}Type`).value;
  document.querySelectorAll(`.link-field-${num}`).forEach(el => el.style.display = 'none');
  if (type === 'collection') document.getElementById(`link${num}-val-col`).style.display = 'block';
  if (type === 'custom') document.getElementById(`link${num}-val-custom`).style.display = 'block';
};

function renderTextEditor(s) {
  const modal = document.getElementById('section-modal');
  modal.innerHTML = `
    <div class="hp-modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="hp-modal">
        <div class="hp-modal-header">
          <h3>T تعديل قسم النص</h3>
          <button class="hp-modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="hp-modal-body">
          <div class="form-row">
            <label>العنوان</label>
            <input type="text" id="ed-title" value="${s.title || ''}" placeholder="عنوان القسم">
          </div>
          <div class="toggle-row">
            <span style="font-weight:600;font-size:0.9rem">أظهر العنوان</span>
            <label class="toggle-switch">
              <input type="checkbox" id="ed-showTitle" ${s.showTitle ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-row" style="margin-top:16px">
            <label>المحتوى</label>
            <textarea id="ed-content" rows="5" style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-family:inherit;font-size:0.9rem;resize:vertical">${s.content || ''}</textarea>
          </div>
        </div>
        <div class="hp-modal-footer">
          <button class="btn btn-primary" style="background:#0f766e;border:none;padding:10px 24px;border-radius:8px;color:#fff;font-weight:600;cursor:pointer" onclick="saveTextSection('${s.id}')">احفظ</button>
          <button class="btn btn-secondary" style="padding:10px 24px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer" onclick="closeModal()">إلغاء</button>
        </div>
      </div>
    </div>`;
}

// Save handlers
window.saveProductsSection = function (id) {
  const s = sections.find(s => s.id === id);
  if (!s) return;
  s.title = document.getElementById('ed-title').value.trim();
  s.showTitle = document.getElementById('ed-showTitle').checked;
  s.itemsPerRow = parseInt(document.getElementById('ed-itemsPerRow').value) || 4;
  s.collectionId = document.getElementById('ed-collectionId').value;
  s.maxItems = parseInt(document.getElementById('ed-maxItems').value) || 4;
   if (window.markAsModified) window.markAsModified();
  renderSections();
  closeModal();
  showToast('تم الحفظ');
};

window.saveCollectionsSection = function (id) {
  const s = sections.find(s => s.id === id);
  if (!s) return;
  s.title = document.getElementById('ed-title').value.trim();
  s.showTitle = document.getElementById('ed-showTitle').checked;
  s.itemsPerRow = parseInt(document.getElementById('ed-itemsPerRow').value) || 2;
  s.showNames = document.getElementById('ed-showNames').checked;
   if (window.markAsModified) window.markAsModified();
  renderSections();
  closeModal();
  showToast('تم الحفظ');
};

window.saveBannerSection = function (id) {
  const s = sections.find(s => s.id === id);
  if (!s) return;
  s.title = document.getElementById('ed-title').value.trim();
  s.imageUrl = document.getElementById('ed-imageUrl').value.trim();
  
  // Btn 1
  s.showBtn = document.getElementById('ed-showBtn').checked;
  s.btnText = document.getElementById('ed-btnText').value.trim();
  s.linkType = document.getElementById('ed-linkType').value;
  if (s.linkType === 'collection') s.linkValue = document.getElementById('ed-linkValue-col-1').value;
  else if (s.linkType === 'custom') s.linkValue = document.getElementById('ed-linkValue-url-1').value.trim();
  else s.linkValue = '';

  // Btn 2
  s.showBtn2 = document.getElementById('ed-showBtn2').checked;
  s.btn2Text = document.getElementById('ed-btn2Text').value.trim();
  s.link2Type = document.getElementById('ed-link2Type').value;
  if (s.link2Type === 'collection') s.link2Value = document.getElementById('ed-linkValue-col-2').value;
  else if (s.link2Type === 'custom') s.link2Value = document.getElementById('ed-linkValue-url-2').value.trim();
  else s.link2Value = '';

   if (window.markAsModified) window.markAsModified();
  renderSections();
  closeModal();
  showToast('تم الحفظ');
};

window.saveTextSection = function (id) {
  const s = sections.find(s => s.id === id);
  if (!s) return;
  s.title = document.getElementById('ed-title').value.trim();
  s.showTitle = document.getElementById('ed-showTitle').checked;
  s.content = document.getElementById('ed-content').value.trim();
   if (window.markAsModified) window.markAsModified();
  renderSections();
  closeModal();
  showToast('تم الحفظ');
};

window.closeModal = function () {
  document.getElementById('section-modal').innerHTML = '';
};

// Collection picker modal
window.openCollectionPicker = function (sectionId) {
  const s = sections.find(s => s.id === sectionId);
  if (!s) return;
  const selectedIds = s.selectedCollections || [];

  const pickerHTML = `
    <div class="hp-modal-overlay" id="col-picker-overlay" onclick="if(event.target===this) closeColPicker()">
      <div class="hp-modal" style="max-width:500px">
        <div class="hp-modal-header">
          <h3>اختر مجموعة</h3>
          <button class="hp-modal-close" onclick="closeColPicker()">×</button>
        </div>
        <div class="hp-modal-body">
          <div class="form-row" style="margin-bottom:12px; position:relative;">
            <input type="text" id="col-picker-search" placeholder="بحث في المجموعات" oninput="filterColPicker()" style="padding-left:36px; width:100%; padding-top:10px; padding-bottom:10px; border:1px solid #e2e8f0; border-radius:8px;">
            <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; pointer-events:none;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          </div>
          <div id="col-picker-list">
            ${allCollections.map(c => `
              <div class="col-picker-item ${selectedIds.includes(c._id) ? 'selected' : ''}" onclick="toggleColSelection('${sectionId}','${c._id}', this)">
                <input type="checkbox" ${selectedIds.includes(c._id) ? 'checked' : ''} style="pointer-events:none">
                <span>${c.name}</span>
                ${c.imageUrl ? `<img src="${api.optimizeImageUrl(c.imageUrl, 100)}" alt="" style="margin-right:auto">` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="hp-modal-footer">
          <button class="btn btn-primary" style="background:#0f766e;border:none;padding:10px 24px;border-radius:8px;color:#fff;font-weight:600;cursor:pointer" onclick="closeColPicker()">احفظ</button>
          <button class="btn btn-secondary" style="padding:10px 24px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer" onclick="closeColPicker()">إلغاء</button>
        </div>
      </div>
    </div>`;

  // Insert picker as sibling
  const div = document.createElement('div');
  div.id = 'col-picker-container';
  div.innerHTML = pickerHTML;
  document.body.appendChild(div);
};

window.toggleColSelection = function (sectionId, colId, el) {
  const s = sections.find(s => s.id === sectionId);
  if (!s) return;
  if (!s.selectedCollections) s.selectedCollections = [];

  const idx = s.selectedCollections.indexOf(colId);
  if (idx >= 0) {
    s.selectedCollections.splice(idx, 1);
    el.classList.remove('selected');
    el.querySelector('input').checked = false;
  } else {
    s.selectedCollections.push(colId);
    el.classList.add('selected');
    el.querySelector('input').checked = true;
  }
  if (window.markAsModified) window.markAsModified();
};

window.closeColPicker = function () {
  const el = document.getElementById('col-picker-container');
  if (el) el.remove();
  // Re-render the collections editor to update selected list
  const openModal = document.querySelector('.hp-modal');
  if (openModal) {
    // Find the section being edited
    const sId = sections.find(s => s.type === 'collections' && document.getElementById('section-modal').innerHTML.includes(s.id));
    if (sId) editSection(sId.id);
  }
};

window.filterColPicker = function () {
  const q = document.getElementById('col-picker-search').value.toLowerCase();
  document.querySelectorAll('#col-picker-list .col-picker-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

window.removeSelectedCol = function (sectionId, colId) {
  const s = sections.find(s => s.id === sectionId);
  if (!s || !s.selectedCollections) return;
  s.selectedCollections = s.selectedCollections.filter(id => id !== colId);
  if (window.markAsModified) window.markAsModified();
  editSection(sectionId); // Re-render modal
};

function initColSortable(sectionId) {
  const list = document.getElementById('selected-cols-list');
  if (!list) return;
  
  new Sortable(list, {
    handle: '.col-drag-handle',
    animation: 150,
    onEnd: () => {
      const s = sections.find(x => x.id === sectionId);
      if (!s) return;
      const newOrder = Array.from(list.children).map(el => el.getAttribute('data-cid')).filter(Boolean);
      s.selectedCollections = newOrder;
      if (window.markAsModified) window.markAsModified();
    }
  });
}
