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
  const brandName = settings.storeNameAr || settings.storeName || 'admin Store';

  // ================== PRODUCTS ==================
  const productsHtml = order.items.map((p) => {
    const unitPrice = Number(p.unitPrice) || Number(p.price) || Number(p.basePrice) || 0;
    const optionsText = (p.selectedOptions || []).map(o => o.label).join(' / ');
    const lineTotal = p.finalPrice;
    
    return `
    <tr>
      <td style="text-align: right; display:flex; align-items:center; gap:8px;">
        ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:6px; margin-left:8px;">` : ''}
        <div>
          <div style="font-weight:700;">${safe(p.name)}</div>
          ${optionsText ? `<div style="font-size:10px; color:#666;">(${safe(optionsText)})</div>` : ''}
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

  // Add 10 EGP extra fee if not fully paid (COD fee logic from user's sample)
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
<td class="value-column" dir="ltr">${phone}</td>
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
