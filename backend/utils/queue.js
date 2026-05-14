const { Queue, Worker } = require('bullmq');
const redis = require('./redis');

const orderQueue = new Queue('orderQueue', { 
    connection: redis 
});

const worker = new Worker('orderQueue', async (job) => {
    console.log(`[BullMQ] Processing job ${job.id}`);
    const Order = require('../models/Order');
    const sendWebhook = require('./webhook');
    
    try {
        // 1. Trigger Webhooks (WhatsApp, etc.)
        if (job.data.order) {
            await sendWebhook('order.created', job.data.order);
        }

        // 2. Mark as completed in MongoDB (Durability Fallback)
        if (job.data.order && job.data.order._id) {
            await Order.findByIdAndUpdate(job.data.order._id, { 
                $set: { processingStatus: 'completed' } 
            });
        }
        return { status: 'success', jobId: job.id };
    } catch (err) {
        console.error(`[BullMQ] Job ${job.id} failed:`, err.message);
        throw err;
    }

}, { 
    connection: redis,
    // CRITICAL: 25MB RAM LIMITS
    removeOnComplete: {
        count: 50,        // Drastically reduced for 25MB RAM
        age: 3600         // Delete after 1 hour
    },
    removeOnFail: {
        count: 100,       // Reduced for 25MB RAM
        age: 86400        // Delete after 24 hours
    }
});

module.exports = {
    orderQueue
};
