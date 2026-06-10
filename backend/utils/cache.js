const redis = require('./redis');

const DEFAULT_TTL = 2592000; // 30 days ("Never violate")

const cache = {
  async get(key) {
    try {
      const data = await redis.get(key);
      if (data) {
        console.log(`[Redis] 🟢 CACHE HIT for key: ${key}`);
        return JSON.parse(data);
      } else {
        console.log(`[Redis] 🔴 CACHE MISS for key: ${key}`);
        return null;
      }
    } catch (err) {
      console.error(`[Redis] Get failed for ${key}:`, err.message);
      return null;
    }
  },

  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      if (ttl === null || ttl === 0) {
        await redis.set(key, JSON.stringify(value));
      } else {
        await redis.set(key, JSON.stringify(value), 'EX', ttl);
      }
      console.log(`[Redis] 💾 CACHE SET for key: ${key} (TTL: ${ttl}s)`);
    } catch (err) {
      console.error(`[Redis] Set failed for ${key}:`, err.message);
    }
  },

  async del(key) {
    try {
      await redis.del(key);
      console.log(`[Redis] 🗑️ CACHE DELETE for key: ${key}`);
    } catch (err) {
      console.error(`[Redis] Delete failed for ${key}:`, err.message);
    }
  },

  async clearPrefix(prefix) {
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[Redis] 🧹 Cleared ${keys.length} keys with prefix ${prefix}`);
      }
    } catch (err) {
      console.error(`[Redis] Clear prefix ${prefix} failed:`, err.message);
    }
  }
};

module.exports = cache;
