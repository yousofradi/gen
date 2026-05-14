const { Queue, Worker } = require('bullmq');
const redis = require('./redis');

const orderQueue = new Queue('orderQueue', { 
    connection: redis 
});

const worker = new Worker('orderQueue', async (job) => {
    console.log(`[BullMQ] Processing job ${job.id}`);
    
    // Success status return
    return { status: 'success', jobId: job.id };

}, { 
    connection: redis,
    // Expanded memory limits for 256MB instance
    removeOnComplete: {
        count: 500,        // Keep last 500 successful jobs
        age: 86400 * 7     // Delete after 7 days
    },
    removeOnFail: {
        count: 1000,       // Keep last 1000 failed jobs
        age: 86400 * 30    // Delete after 30 days
    }
});

module.exports = {
    orderQueue
};
