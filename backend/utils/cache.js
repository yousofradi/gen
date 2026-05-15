const redis = require('./redis');

const DEFAULT_TTL = 2592000; // 30 days ("Never violate")

const cache = {
  async get(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error(`[Redis] Get failed for ${key}:`, err.message);
      return null;
    }
  },

  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (err) {
      console.error(`[Redis] Set failed for ${key}:`, err.message);
    }
  },

  async del(key) {
    try {
      await redis.del(key);
    } catch (err) {
      console.error(`[Redis] Delete failed for ${key}:`, err.message);
    }
  },

  async clearPrefix(prefix) {
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[Redis] Cleared ${keys.length} keys with prefix ${prefix}`);
      }
    } catch (err) {
      console.error(`[Redis] Clear prefix ${prefix} failed:`, err.message);
    }
  }
};

module.exports = cache;
