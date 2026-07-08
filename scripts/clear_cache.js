require('dotenv').config();
const redis = require('./backend/utils/cache');
const { connectRedis } = require('./backend/utils/queue');

async function clearAll() {
  console.log('Connecting to Redis...');
  // We need to connect first if the utility doesn't do it automatically
  // Actually, queue.js handles the connection.
  
  try {
    const keys = await redis.clearPrefix('');
    console.log(`Successfully cleared all cache keys.`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to clear cache:', err);
    process.exit(1);
  }
}

clearAll();
