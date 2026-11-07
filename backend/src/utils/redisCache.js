const redis = require('redis');

class RedisCache {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', err => {
      console.error('Redis Cache Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Cache connected');
    });
  }

  async connect() {
    await this.client.connect();
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async delPattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error('Cache delete pattern error:', error);
    }
  }

  generateKey(prefix, ...parts) {
    return `${prefix}:${parts.join(':')}`;
  }
}

// Cache middleware
function cacheMiddleware(ttl = 300) {
  return async (req, res, next) => {
    if (req.method !== 'GET' || req.path === '/health' || !redisCache.client.isReady) {
      return next();
    }

    const cacheKey = `api:${req.originalUrl}:${req.user?.userId || 'anonymous'}`;

    try {
      const cached = await redisCache.get(cacheKey);
      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }

      res.set('X-Cache', 'MISS');

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function (data) {
        if (res.statusCode < 400) {
          redisCache.set(cacheKey, data, ttl);
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

const redisCache = new RedisCache();

module.exports = { RedisCache, redisCache, cacheMiddleware };
