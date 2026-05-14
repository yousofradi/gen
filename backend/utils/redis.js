const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  tls: redisUrl.startsWith('rediss://') ? {
    rejectUnauthorized: false
  } : undefined
});

redis.on('connect', () => console.log('✅ Connected to Redis (Upstash)'));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

module.exports = redis;
