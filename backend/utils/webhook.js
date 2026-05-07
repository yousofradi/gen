/**
 * Webhook utility — sends POST to WEBHOOK_URL.
 * Fire-and-forget: logs errors but never blocks the response.
 */
const Webhook = require('../models/Webhook');
const cityMap = require('./cityMap');

async function sendWebhook(event, data) {
  try {
    const webhooks = await Webhook.find({ active: true, events: event });
    if (webhooks.length === 0) return;

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

    const promises = webhooks.map(wh => 
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(5000)
      }).catch(err => {
        console.error(`Failed to send webhook to ${wh.url}:`, err.message);
      })
    );

    await Promise.all(promises);

    // ── WhatsApp Notification ──
    try {
      const Setting = require('../models/Setting');
      const waConfig = await Setting.findOne({ key: 'whatsapp_config' });
      
      if (waConfig && waConfig.value) {
        const conf = waConfig.value;
        const shouldSend = (event === 'order.created' && conf.triggerNew) || 
                           (event === 'order.paid' && conf.triggerPaid);
        
        if (shouldSend && conf.baseUrl && conf.instance && conf.apikey && conf.number) {
          let msg = `رقم الاوردر: ${data.orderId}\n` +
                    `اسم العميل: ${data.customer.name}\n` +
                    `رقم الهاتف: ${data.customer.phone}\n` +
                    `اجمالي المطلوب: ${data.totalPrice}`;
          
          if (event === 'order.paid') {
            msg += `\nالمدفوع: ${data.paidAmount || 0}\n` +
                   `المتبقي: ${data.totalPrice - (data.paidAmount || 0)}`;
          }

          // Evolution API Send Text
          const waUrl = `${conf.baseUrl}/message/sendText/${conf.instance}`;
          await fetch(waUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': conf.apikey
            },
            body: JSON.stringify({
              number: conf.number,
              text: msg,
              delay: 1000,
              linkPreview: false
            })
          }).catch(err => console.error('WhatsApp sending failed:', err.message));
        }
      }
    } catch (waErr) {
      console.error('WhatsApp system error:', waErr.message);
    }

  } catch (err) {
    console.error('Webhook system error:', err.message);
  }
}

module.exports = sendWebhook;
