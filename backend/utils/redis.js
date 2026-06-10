const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

if (!process.env.REDIS_URL) {
    console.warn('⚠️ REDIS_URL is not set in environment variables. Defaulting to local redis.');
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

// Track connection status
redis.isConnected = false;

redis.on('connect', async () => {
    redis.isConnected = true;
    console.log('✅ Connected to Redis successfully');
    try {
        await redis.config('SET', 'maxmemory-policy', 'noeviction');
        console.log('✅ Redis eviction policy set to "noeviction" successfully');
    } catch (err) {
        console.log('[Redis] Note: Could not set maxmemory-policy dynamically (CONFIG command might be restricted):', err.message);
    }
});

redis.on('close', () => {
    redis.isConnected = false;
    console.warn('⚠️ Redis connection closed');
});

redis.on('error', (err) => {
    redis.isConnected = false;
    console.error('❌ Redis Error:', err.message);
});

module.exports = redis;
