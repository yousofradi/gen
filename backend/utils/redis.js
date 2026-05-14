const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    console.error('❌ REDIS_URL is not set in environment variables.');
}

const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    tls: {
        rejectUnauthorized: false // Avoid SSL handshake issues
    }
});

redis.on('connect', () => console.log('✅ Connected to Redis successfully'));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

module.exports = redis;
