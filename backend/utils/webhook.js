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
      const brandName = settings.invoicePrefix || settings.storeNameAr || settings.storeName || 'Store';

      if (waConfigSetting && Array.isArray(waConfigSetting.value)) {
        const configs = waConfigSetting.value;

        for (const conf of configs) {
          const triggers = Array.isArray(conf.triggers) ? conf.triggers : (conf.trigger ? [conf.trigger] : []);
          const shouldSend = triggers.includes(event);

          if (shouldSend && conf.baseUrl && conf.instance && conf.apikey && conf.number) {

            // 1. Prepare Customer Message (for the wa.me link)
            let customerMessage = '';

            if (event === 'order.created') {
              const paymentMethodsText = (settings.paymentMethods || [])
                .map(m => `* ${m.label}`)
                .join('\n');

              customerMessage = `مرحباً ${data.customer.name}
شكراً لشرائك من متجر ${brandName}  ♡

رقم الأوردر  : ${data.orderId}
اجمالي الطلب : ${data.totalPrice} EGP

طرق الدفع :

${paymentMethodsText}
التحويل على رقم : ${settings.socialWa || ''}

${settings.paymentNotes || ''}

شكراً لثقتك بنا  ♡`;
            } else {
              // Default/Paid message
              const remainingAmount = data.totalPrice - (data.paidAmount || 0);
              const remainingText = remainingAmount > 0
                ? `الدفع عند الاستلام : ${remainingAmount} EGP`
                : `مدفوع بالكامل`;

              customerMessage = `شكرا لشرائك من متجر (${brandName})

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

            // 3. Shorten the Link using is.gd
            let shortLink = whatsappLink;
            try {
              const isgdRes = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(whatsappLink)}`, {
                signal: AbortSignal.timeout(5000)
              });
              if (isgdRes.ok) {
                const text = await isgdRes.text();
                if (text && text.startsWith('http')) shortLink = text;
              }
            } catch (e) {
              console.warn('[WhatsApp] Link shortening failed:', e.message);
            }

            // 4. Prepare Owner Message
            let ownerMessage = '';
            if (event === 'order.created') {
              ownerMessage = `🔔 طلب جديد
رقم الطلب: ${data.orderId}
اسم العميل: ${data.customer.name}
اجمالي الطلب: ${data.totalPrice} EGP`;

              if (data.customer.notes) ownerMessage += `\nملاحظات: ${data.customer.notes}`;
              ownerMessage += `\n\nرابط واتساب:\n${shortLink}`;
            } else if (event === 'order.paid') {
              const remainingAmount = data.totalPrice - (data.paidAmount || 0);
              ownerMessage = `تم تأكيد الدفع 

رقم الطلب: ${data.orderId}
اسم العميل: ${data.customer.name}

المدفوع : ${data.paidAmount || 0} EGP
المتبقي : ${remainingAmount} EGP

لينك للعميل :
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
                  <html>
                    <head>
                      <link rel="preconnect" href="https://fonts.googleapis.com">
                      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
                      <style>
                        body { font-family: 'Cairo', sans-serif; direction: rtl; margin: 0; padding: 20px; background: #fff; width: 460px; }
                        .invoice { background: #fff; }
                        .customer-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        .customer-table td { padding: 8px; border: 1px solid #eee; }
                        .label-column { font-weight: 700; width: 30%; background: #f8fafc; }
                        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        .items-table th { background: #f1f5f9; padding: 10px; text-align: right; border: 1px solid #e2e8f0; }
                        .items-table td { padding: 10px; border: 1px solid #e2e8f0; text-align: right; }
                        .summary { margin-top: 20px; border-top: 2px solid #334155; padding-top: 10px; }
                        .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
                        .grand { font-size: 18px; font-weight: 700; color: #1e293b; border-top: 1px solid #e2e8f0; margin-top: 5px; padding-top: 10px; }
                        .paid-box { margin-top: 15px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
                        .green { color: #166534; font-weight: 700; }
                        .red { color: #991b1b; font-weight: 700; }
                        .notes-section { margin-top: 20px; padding: 15px; border-right: 4px solid #64748b; background: #f1f5f9; }
                        .footer { margin-top: 30px; text-align: center; color: #64748b; font-size: 12px; }
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
                    fullPage: true,
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
