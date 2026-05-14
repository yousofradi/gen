const { Queue, Worker } = require('bullmq');
const redis = require('./redis');

const orderQueue = new Queue('orderQueue', { connection: redis });

const sendWebhook = require('./webhook');
const { sendPushToAdmins } = require('./push');
const Setting = require('../models/Setting');

const worker = new Worker('orderQueue', async (job) => {
  console.log(`[BullMQ] Processing job ${job.id}: ${job.name}`);
  const { order } = job.data;

  if (job.name === 'process_new_order') {
    // 1. Fetch store logo for notification
    let storeLogo = '/admin/logo.png';
    try {
      const globalSettings = await Setting.findOne({ key: 'sundura_global_settings' }).lean();
      if (globalSettings && globalSettings.value && globalSettings.value.storeLogo) {
        storeLogo = globalSettings.value.storeLogo;
      }
    } catch (e) {
      console.error('[BullMQ] Failed to fetch settings for notification:', e.message);
    }

    // 2. Send push notification to admins
    try {
      await sendPushToAdmins({
        title: 'طلب جديد! 📦',
        body: `طلب بقيمة ${order.totalPrice} ج.م من ${order.customer.name}`,
        icon: storeLogo,
        sound: 'https://cdn.pixabay.com/audio/2022/11/04/audio_7650b73fdb.mp3',
        data: {
          url: `/admin/order-details.html?id=${order.orderId}`,
          sound: 'https://cdn.pixabay.com/audio/2022/11/04/audio_7650b73fdb.mp3'
        }
      });
    } catch (e) {
      console.error('[BullMQ] Push notification failed:', e.message);
    }

    // 3. Send webhook
    try {
      await sendWebhook('order.created', order);
    } catch (e) {
      console.error('[BullMQ] Webhook failed:', e.message);
    }
  }

  return { status: 'success', orderId: order._id };
}, { 
  connection: redis,
  removeOnComplete: {
    count: 20,    // Keep last 20 successful jobs
    age: 3600     // Or 1 hour
  },
  removeOnFail: {
    count: 50,    // Keep last 50 failed jobs
    age: 86400    // Or 24 hours
  }
});

worker.on('completed', job => console.log(`✅ Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`❌ Job ${job.id} failed:`, err));

module.exports = { orderQueue };
