const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    console.error('❌ REDIS_URL is not set in environment variables.');
}

const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null, 
    enableReadyCheck: false,
    connectTimeout: 10000, // 10 seconds
    keepAlive: 10000,
    tls: {
        rejectUnauthorized: false
    }
});

redis.on('connect', () => console.log('✅ Connected to Redis successfully'));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

module.exports = redis;
