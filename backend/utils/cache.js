const redis = require('./redis');

const DEFAULT_TTL = 2592000; // 30 days ("Never violate")

const cache = {
  /**
   * Check if Redis is currently connected and healthy
   */
  isHealthy() {
    return redis && redis.isConnected && !redis.status?.includes('disconnecting') && redis.status !== 'end';
  },

  /**
   * Get data from Redis cache. Returns null if Redis is down or key not found.
   */
  async get(key) {
    try {
      // Check Redis health first
      if (!this.isHealthy()) {
        console.warn(`[Cache] ⚠️ Redis unhealthy (status: ${redis.status}), skipping cache get for key: ${key}`);
        return null;
      }

      const data = await redis.get(key);
      if (data) {
        console.log(`[Redis] 🟢 CACHE HIT for key: ${key}`);
        return JSON.parse(data);
      } else {
        console.log(`[Redis] 🔴 CACHE MISS for key: ${key}`);
        return null;
      }
    } catch (err) {
      console.error(`[Cache] ❌ Get failed for ${key}: ${err.message}. Will fallback to DB.`);
      return null;
    }
  },

  /**
   * Set data to Redis cache. Silent fail if Redis is down.
   */
  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      // Check Redis health first
      if (!this.isHealthy()) {
        console.warn(`[Cache] ⚠️ Redis unhealthy (status: ${redis.status}), skipping cache set for key: ${key}`);
        return;
      }

      if (ttl === null || ttl === 0) {
        await redis.set(key, JSON.stringify(value));
      } else {
        await redis.set(key, JSON.stringify(value), 'EX', ttl);
      }
      console.log(`[Redis] 💾 CACHE SET for key: ${key} (TTL: ${ttl}s)`);
    } catch (err) {
      console.warn(`[Cache] ⚠️ Set failed for ${key}: ${err.message}. Cache will not be stored.`);
    }
  },

  /**
   * Delete data from Redis cache. Silent fail if Redis is down.
   */
  async del(key) {
    try {
      if (!this.isHealthy()) {
        console.warn(`[Cache] ⚠️ Redis unhealthy, skipping cache delete for key: ${key}`);
        return;
      }

      await redis.del(key);
      console.log(`[Redis] 🗑️ CACHE DELETE for key: ${key}`);
    } catch (err) {
      console.warn(`[Cache] ⚠️ Delete failed for ${key}: ${err.message}`);
    }
  },

  /**
   * Clear all keys matching a prefix. Silent fail if Redis is down.
   */
  async clearPrefix(prefix) {
    try {
      if (!this.isHealthy()) {
        console.warn(`[Cache] ⚠️ Redis unhealthy, skipping cache clear for prefix: ${prefix}`);
        return;
      }

      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[Redis] 🧹 Cleared ${keys.length} keys with prefix ${prefix}`);
      }
    } catch (err) {
      console.warn(`[Cache] ⚠️ Clear prefix ${prefix} failed: ${err.message}`);
    }
  }
};

module.exports = cache;
