const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    console.error('❌ REDIS_URL is not set in environment variables.');
}

const isTls = redisUrl.startsWith('rediss://');

const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null, 
    enableReadyCheck: false,
    connectTimeout: 10000,
    keepAlive: 10000,
    ...(isTls && {
        tls: {
            rejectUnauthorized: false
        }
    })
});

redis.on('connect', async () => {
    console.log('✅ Connected to Redis successfully');
    try {
        await redis.config('SET', 'maxmemory-policy', 'noeviction');
        console.log('✅ Redis eviction policy set to "noeviction" successfully');
    } catch (err) {
        console.log('[Redis] Note: Could not set maxmemory-policy dynamically (CONFIG command might be restricted):', err.message);
    }
});
redis.on('error', (err) => console.error('❌ Redis Error:', err));

module.exports = redis;
