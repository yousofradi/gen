const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('❌ REDIS_URL is not set. Please add it to your environment variables.');
}

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 15000, 
  commandTimeout: 5000,  // If Redis doesn't respond in 5s, fail and move on
  tls: (redisUrl && redisUrl.startsWith('rediss://')) ? {
    rejectUnauthorized: false
  } : undefined
});

redis.on('connect', () => console.log('✅ Connected to Redis (Upstash)'));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

module.exports = redis;
