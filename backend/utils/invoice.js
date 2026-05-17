/**
 * Shared utility for generating invoice HTML.
 */

function safe(val) {
  return (val === undefined || val === null) ? '' : String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function num(val) {
  return Number(val) || 0;
}

async function generateInvoiceInnerHtml(order, settings) {
  const brandName = settings.storeNameAr || settings.storeName || 'سندورة';
  const Product = require('../models/Product');

  function getVariantImageUrl(product, selectedOptions) {
    if (!product || !product.variants || !selectedOptions || selectedOptions.length === 0) {
      return null;
    }
    const matchingVariant = product.variants.find((v) => {
      if (!v.combination) return false;
      return selectedOptions.every((opt) => {
        let val;
        if (typeof v.combination.get === 'function') {
          val = v.combination.get(opt.groupName);
        } else {
          val = v.combination[opt.groupName];
        }
        return val === opt.label;
      });
    });
    return (matchingVariant && matchingVariant.imageUrl) ? matchingVariant.imageUrl : null;
  }

  // Fetch all products in parallel
  const itemsWithProducts = await Promise.all(
    order.items.map(async (p) => {
      try {
        const product = await Product.findById(p.productId);
        return { item: p, product };
      } catch (err) {
        console.error('Failed to fetch product for invoice:', err);
        return { item: p, product: null };
      }
    })
  );

  // ================== PRODUCTS ==================
  const productsHtml = itemsWithProducts.map(({ item: p, product }) => {
    const unitPrice = Number(p.unitPrice) || Number(p.price) || Number(p.basePrice) || 0;
    const optionsText = (p.selectedOptions || []).map(o => o.label).join(' / ');
    const lineTotal = p.finalPrice;

    // 1. Try selected option's image url
    let finalImageUrl = getVariantImageUrl(product, p.selectedOptions);
    
    // 2. If not found, use base product image url
    if (!finalImageUrl && product) {
      finalImageUrl = product.imageUrl;
    }

    // 3. Fallback to order item's original imageUrl
    if (!finalImageUrl) {
      finalImageUrl = p.imageUrl;
    }
    
    const imgHtml = finalImageUrl ? `<img src="${finalImageUrl}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" />` : `
      <div style="width: 32px; height: 32px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>`;

    return `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 8px; text-align: right;">
          ${imgHtml}
          <span>${safe(p.name)} ${optionsText ? `<span style="font-size: 10px; color: #64748b;">(${safe(optionsText)})</span>` : ''}</span>
        </div>
      </td>
      <td>${safe(p.quantity)}</td>
      <td>${num(unitPrice)}</td>
      <td>${num(lineTotal)} ج</td>
    </tr>
    `;
  }).join('');

  // ================== NOTES ==================
  const notesArray = order.customer.notes
    ? order.customer.notes.split('-').filter(n => n.trim() !== '')
    : [];

  const notesHtml = notesArray.length
    ? notesArray.map(n => `
      <div style="margin-bottom:4px;">• ${safe(n.replace(/^-/, '').trim())}</div>
    `).join('')
    : `<div>لا توجد ملاحظات</div>`;

  // ================== CALCULATIONS ==================
  const sub = order.items.reduce((s, i) => s + i.finalPrice, 0);
  const shipping = num(order.shippingFee);
  const total = num(order.totalPrice);
  const paid = num(order.paidAmount);
  const remaining = total - paid;
  // Add 10 EGP extra fee if not fully paid (COD fee logic)
  const displayRemaining = remaining > 0 ? (remaining + 10) : 0;

  // ================== PHONE ==================
  let phone = safe(order.customer.phone);
  if (order.customer.secondPhone) {
    phone += ` - ${order.customer.secondPhone}`;
  }

  // ================== REMAINING TEXT ==================
  let remtext = 'المتبقي عند الاستلام (+10 ج رسوم)';
  if (remaining === 0) {
    remtext = 'مدفوع بالكامل';
  }

  return `
<div class="invoice">

<table class="customer-table">
<tbody>

<tr>
<td class="label-column">الاسم</td>
<td class="value-column">${safe(order.customer.name)}</td>
</tr>

<tr>
<td class="label-column">الهاتف</td>
<td class="value-column">${phone}</td>
</tr>

<tr>
<td class="label-column">المحافظة</td>
<td class="value-column">${safe(order.customer.government)}</td>
</tr>

<tr>
<td class="label-column">العنوان</td>
<td class="value-column">${safe(order.customer.address)}</td>
</tr>

</tbody>
</table>

<div class="order-section">

<table class="items-table">
<thead>
<tr>
<th>المنتج</th>
<th>عدد</th>
<th>سعر</th>
<th>إجمالي</th>
</tr>
</thead>

<tbody>
${productsHtml}
</tbody>
</table>

<div class="summary">
<div class="row">
<span>المبلغ الفرعي</span>
<span>${sub} ج</span>
</div>

<div class="row">
<span>مصاريف الشحن (${safe(order.customer.government)})</span>
<span>${shipping} ج</span>
</div>

<div class="row grand">
<span>الإجمالي</span>
<span>${total} ج</span>
</div>
</div>

<div class="paid-box">

<div class="row green">
<span>المدفوع</span>
<span>${paid} ج</span>
</div>

<div class="row red">
<span>${remtext}</span>
<span>${displayRemaining} ج</span>
</div>

</div>

<div class="notes-section">
<div class="notes-title">ملاحظات :</div>

<div style="line-height:1.6; font-weight:700;">
${notesHtml}
</div>
</div>

<div class="footer">
♡ شكراً لشرائك من متجر ${brandName} ♡
</div>

</div>
</div>
`;
}

module.exports = { generateInvoiceInnerHtml };
