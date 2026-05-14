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
                .map(m => `* ${m.label} : ${m.number}`)
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
            const customerPhone = data.customer.phone.replace(/\D/g, '');
            const whatsappLink = `https://wa.me/${customerPhone}?text=${encodeURIComponent(customerMessage)}`;

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
                const invoiceHtml = await generateInvoiceInnerHtml(data, settings);
                const snapRes = await fetch('https://app.snap-render.com/v1/screenshot', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': snapKey
                  },
                  body: JSON.stringify({
                    html: invoiceHtml,
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
            if (!cleanNumber.startsWith('2')) cleanNumber = '2' + cleanNumber;
            
            const waPayload = {
              number: cleanNumber,
              delay: 1,
              linkPreview: false,
              mentionsEveryOne: false
            };

            let finalWaUrl = '';
            if (mediaData) {
              finalWaUrl = `${cleanBaseUrl}/message/sendMedia/${conf.instance}`;
              waPayload.mediatype = 'Image';
              waPayload.mimetype = 'image/png';
              waPayload.caption = ownerMessage;
              waPayload.media = mediaData.replace(/\s/g, ''); // User snippet uses 'media' field
              waPayload.fileName = `invoice-${data.orderId}.png`;
            } else {
              finalWaUrl = `${cleanBaseUrl}/message/sendText/${conf.instance}`;
              waPayload.text = ownerMessage;
            }

            console.log(`[WhatsApp] Sending to ${finalWaUrl}`);

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
