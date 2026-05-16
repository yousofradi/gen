/**
 * Webhook utility — sends POST to WEBHOOK_URL.
 * Fire-and-forget: logs errors but never blocks the response.
 */
const Webhook = require('../models/Webhook');
const cityMap = require('./cityMap');

async function sendWebhook(event, data) {
  try {
    const webhooks = await Webhook.find({ active: true, events: event });
    console.log(`[Webhook] Found ${webhooks.length} active webhooks for event: ${event}`);

    if (webhooks.length > 0) {
      // Calculate subamount if needed
      const subamount = data.totalPrice - data.shippingFee;

      // Map product items
      const products = (data.items || []).map(item => ({
        "name": item.name,
        "count": item.quantity,
        "price": item.finalPrice / item.quantity,
        "value option": (item.selectedOptions || []).map(o => o.label).join(' / ') || ""
      }));

      const rawPayload = {
        "Order ID": data.orderId,
        "Name": data.customer.name,
        "Phone": data.customer.phone,
        "Second Phone": data.customer.secondPhone || "",
        "Address": data.customer.address,
        "Gov-ar": data.customer.government,
        "Gov-en": cityMap[data.customer.government] || data.customer.government,
        "notes": data.customer.notes || "",
        "subamount": subamount,
        "shipment-amount": data.shippingFee,
        "total amount": data.totalPrice,
        "paid amount": data.paidAmount || 0,
        "remaining amount": data.totalPrice - (data.paidAmount || 0),
        "products": products
      };

      const payload = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: rawPayload
      });

      const promises = webhooks.map(wh => {
        console.log(`[Webhook] Sending payload to ${wh.url}...`);
        return fetch(wh.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(5000)
        }).catch(err => {
          console.error(`Failed to send webhook to ${wh.url}:`, err.message);
        });
      });

      await Promise.all(promises);
    }

    // ── WhatsApp Notification ──
    try {
      const Setting = require('../models/Setting');
      const { generateInvoiceInnerHtml } = require('./invoice');

      const waConfigSetting = await Setting.findOne({ key: 'whatsapp_configs' });
      const globalSettings = await Setting.findOne({ key: 'sundura_global_settings' });
      const settings = globalSettings ? globalSettings.value : {};
      const brandName = settings.storeNameAr || settings.storeName;

      if (waConfigSetting && Array.isArray(waConfigSetting.value)) {
        const configs = waConfigSetting.value;

        for (const conf of configs) {
          const triggers = Array.isArray(conf.triggers) ? conf.triggers : (conf.trigger ? [conf.trigger] : []);
          const shouldSend = triggers.includes(event);

          if (shouldSend && conf.baseUrl && conf.instance && conf.apikey && conf.number) {

            const baseRemaining = data.totalPrice - (data.paidAmount || 0);
            const displayRemaining = baseRemaining > 0 ? (baseRemaining + 10) : 0;
            const remainingText = baseRemaining > 0 ? `المتبقي: ${displayRemaining} EGP` : `الحالة: مدفوع بالكامل`;

            // 1. Prepare Customer Message (for the wa.me link)
            let customerMessage = '';

            if (event === 'order.created') {
              const paymentMethodsText = (settings.paymentMethods || [])
                .map(m => `* ${m.label}`)
                .join('\n');

              customerMessage = `مرحباً ${data.customer.name}

رقم الطلب: ${data.orderId}
إجمالي المبلغ: ${data.totalPrice} EGP

طرق الدفع:
${paymentMethodsText}
التحويل على رقم: ${settings.socialWa || ''}

${settings.paymentNotes || ''}

شكراً لثقتك بنا ♡`;
            } else {
              customerMessage = `شكراً لشرائك من متجر (${brandName}) ♡

رقم الأوردر : ${data.orderId}
المبلغ الاجمالي : ${data.totalPrice} EGP
تم الدفع : ${data.paidAmount || 0} EGP
${remainingText}

شكراً لثقتك بنا ♡`;
            }

            // 2. Generate WhatsApp Link for the customer
            let cleanCustomerPhone = data.customer.phone.replace(/\D/g, '');
            // Strip leading zeros
            cleanCustomerPhone = cleanCustomerPhone.replace(/^0+/, '');
            // Prepend 20 if needed
            if (!cleanCustomerPhone.startsWith('20')) {
              cleanCustomerPhone = '20' + cleanCustomerPhone;
            }
            const whatsappLink = `https://wa.me/${cleanCustomerPhone}?text=${encodeURIComponent(customerMessage)}`;

            // 3. Shorten the Link
            const simpleWaLink = `https://wa.me/${cleanCustomerPhone}`;
            let shortLink = '';

            try {
              // Try is.gd first
              const isgdRes = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(whatsappLink)}`, {
                signal: AbortSignal.timeout(8000)
              }).catch(() => null);

              if (isgdRes && isgdRes.ok) {
                const text = await isgdRes.text();
                if (text && text.startsWith('http')) {
                  shortLink = text;
                }
              }

              if (!shortLink) {
                // Try TinyURL fallback
                const tinyRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(whatsappLink)}`, {
                  signal: AbortSignal.timeout(8000)
                }).catch(() => null);

                if (tinyRes && tinyRes.ok) {
                  const text = await tinyRes.text();
                  if (text && text.startsWith('http')) {
                    shortLink = text;
                  }
                }
              }
            } catch (e) {
              console.warn('[WhatsApp] Link shortening system error:', e.message);
            }

            // Final fallback: if shortening failed, use the SIMPLE wa.me link instead of the LONG ugly one
            if (!shortLink) {
              shortLink = simpleWaLink;
              console.log('[WhatsApp] All shorteners failed, using simple wa.me link');
            }

            // 4. Prepare Owner Message
            let ownerMessage = '';
            if (event === 'order.created') {
              ownerMessage = `🔔 طلب جديد
رقم الطلب: ${data.orderId}
اسم العميل: ${data.customer.name}
اجمالي الطلب: EGP ${data.totalPrice}`;

              if (data.customer.notes) ownerMessage += `\nملاحظات: ${data.customer.notes}`;
              ownerMessage += `\n\nرابط واتساب:\n${shortLink}`;
            } else if (event === 'order.paid') {
              ownerMessage = `✅ تم تأكيد الدفع 

رقم الطلب: ${data.orderId}
اسم العميل: ${data.customer.name}
اجمالي الطلب: EGP ${data.totalPrice}
${remainingText}

رابط واتساب للعميل:
${shortLink}`;
            } else {
              ownerMessage = `إشعار طلب: ${event}\nرقم الطلب: ${data.orderId}\nالعميل: ${data.customer.name}`;
            }

            // 5. Attempt Invoice Image Generation (Only for PAID orders)
            let mediaData = null;
            const snapKey = process.env.SNAPRENDER_API_KEY;
            if (snapKey && event === 'order.paid') {
              try {
                const innerHtml = await generateInvoiceInnerHtml(data, settings);
                const fullHtml = `
                  <!DOCTYPE html>
                  <html dir="rtl" lang="ar">
                  <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet">
                    <style>
                      * { box-sizing: border-box; }
                      html, body {
                        margin: 0;
                        padding: 0;
                        width: 500px;
                        height: fit-content;
                        background: #ffffff;
                        font-family: 'Tajawal', Arial, sans-serif;
                      }
                      .invoice {
                        width: 500px;
                        margin: 0;
                        direction: rtl;
                        padding: 10px 5px;
                        height: fit-content;
                      }
                      .customer-table {
                        width: 100%;
                        border-collapse: collapse;
                        border: 1px solid #000;
                        margin-bottom: 7px;
                      }
                      .customer-table td {
                        border: 1px solid #000;
                        font-size: 10px;
                        font-weight: 600;
                        text-align: center;
                        padding: 4px;
                      }
                      .label-column { width: 25%; }
                      .value-column { width: 75%; }
                      .order-section {
                        border: 1px solid #000;
                      }
                      .items-table {
                        width: 100%;
                        border-collapse: collapse;
                      }
                      .items-table thead {
                        background: #f5ede0;
                      }
                      .items-table th,
                      .items-table td {
                        padding: 6px 6px;
                        font-weight: 600; 
                        font-size: 12px;
                        text-align: center;
                        border-bottom: 1px solid #a6a5a5;
                      }
                      .items-table td:first-child,
                      .items-table th:first-child {
                        text-align: right;
                      }
                      .summary {
                        background: #f5ede0;
                        padding: 1px 6px;
                      }
                      .row {
                        display: flex;
                        justify-content: space-between;
                        font-size: 13px;
                        margin: 2px;
                      }
                      .grand {
                        border-top: 2px solid #4a2c0a;
                        font-weight: 700;
                        margin-top: 4px;
                        padding-top: 4px;
                      }
                      .paid-box {
                        background: #e8f5ed;
                        padding: 1px 6px;
                      }
                      .green {
                        color: #1a7a45;
                        font-weight: 700;
                      }
                      .red {
                        color: #b84a20;
                        font-weight: 700;
                      }
                      .notes-section {
                        padding: 4px 6px;
                        font-size: 11px;
                        background: #f5ede0;
                      }
                      .notes-title {
                        font-weight: 700;
                        color: #b84a20;
                        text-decoration: underline;
                        padding-bottom: 2px;
                      }
                      .footer {
                        background: #4a2c0a;
                        color: #fff;
                        text-align: center;
                        padding: 7px;
                        font-weight: 700;
                        font-size: 13px;
                      }
                    </style>
                  </head>
                  <body>${innerHtml}</body>
                  </html>
                `;

                const snapRes = await fetch('https://app.snap-render.com/v1/screenshot', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': snapKey
                  },
                  body: JSON.stringify({
                    html: fullHtml,
                    type: 'png',
                    width: 500,
                    selector: '.invoice',
                    wait: 1000,
                    deviceScaleFactor: 2
                  }),
                  signal: AbortSignal.timeout(10000)
                });

                if (snapRes.ok) {
                  const buffer = await snapRes.arrayBuffer();
                  mediaData = Buffer.from(buffer).toString('base64');
                } else {
                  const errTxt = await snapRes.text();
                  console.warn('[WhatsApp] SnapRender failed:', errTxt);
                }
              } catch (err) {
                console.error('[WhatsApp] Image generation error:', err.message);
              }
            }

            // 6. Send to WhatsApp API
            let cleanBaseUrl = conf.baseUrl.trim().replace(/\/+$/, '');
            if (!cleanBaseUrl.startsWith('http')) cleanBaseUrl = `https://${cleanBaseUrl}`;

            let cleanNumber = conf.number.trim().replace(/\D/g, '');
            // Strip leading zeros or 00 prefix
            cleanNumber = cleanNumber.replace(/^0+/, '');

            // If it doesn't start with 20, and it's a 10-11 digit number (Egypt), prepend 20
            if (!cleanNumber.startsWith('20')) {
              cleanNumber = '20' + cleanNumber;
            }

            const waPayload = {
              number: cleanNumber,
              delay: 1,
              linkPreview: false,
              mentionsEveryOne: false
            };

            let finalWaUrl = '';
            if (mediaData) {
              finalWaUrl = `${cleanBaseUrl}/message/sendMedia/${conf.instance}`;
              waPayload.mediatype = 'image';
              waPayload.mediaType = 'image'; // Fallback for some versions
              waPayload.mimetype = 'image/png';
              waPayload.caption = ownerMessage;
              waPayload.media = mediaData.replace(/\s/g, ''); // User snippet uses 'media' field
              waPayload.fileName = `invoice-${data.orderId}.png`;
            } else {
              finalWaUrl = `${cleanBaseUrl}/message/sendText/${conf.instance}`;
              waPayload.text = ownerMessage;
            }

            console.log(`[WhatsApp] Sending to ${finalWaUrl}`);
            console.log(`[WhatsApp] Payload:`, JSON.stringify({ ...waPayload, media: waPayload.media ? (waPayload.media.substring(0, 50) + '...') : null }, null, 2));

            try {
              const res = await fetch(finalWaUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': conf.apikey
                },
                body: JSON.stringify(waPayload)
              });

              const json = await res.json();
              if (!res.ok) {
                console.error(`[WhatsApp] API Error (${res.status}):`, JSON.stringify(json, null, 2));
              } else {
                console.log(`[WhatsApp] Success from ${conf.instance}:`, json.message || 'Sent');
              }
            } catch (err) {
              console.error(`[WhatsApp] Network failed for ${conf.instance}:`, err.message);
            }
          }
        }
      }
    } catch (waErr) {
      console.error('[WhatsApp] System error:', waErr.message);
    }

  } catch (err) {
    console.error('Webhook system error:', err.message);
  }
}

module.exports = sendWebhook;
