// Cache Service for PR Reviews
// Handles caching of AI reviews to reduce API calls and improve performance

class CacheService {
  constructor() {
    this.cacheKey = CONFIG.REVIEW_CACHE_KEY;
    this.expiryMs = CONFIG.CACHE_EXPIRY_MS;
    this.memoryCache = new Map();
  }

  /**
   * Get cached review for a PR
   * @param {string} prUrl - Normalized PR URL
   * @returns {Promise<Object|null>} Cached review or null
   */
  async get(prUrl) {
    try {
      console.log("🔍 Checking cache for:", prUrl);

      // Check memory cache first
      const memCached = this.memoryCache.get(prUrl);
      if (memCached && Date.now() < memCached.expiry) {
        console.log("✅ Found in memory cache");
        return memCached.review;
      }

      // Check storage cache
      const result = await chrome.storage.local.get([this.cacheKey]);
      const cache = result[this.cacheKey] || {};

      console.log("📦 Cache contents:", Object.keys(cache));

      const cached = cache[prUrl];
      if (!cached) {
        console.log("❌ No cache found for this PR");
        return null;
      }

      // Check if cache is expired
      const now = Date.now();
      const age = now - cached.timestamp;
      const ageHours = (age / (1000 * 60 * 60)).toFixed(1);
      console.log(`📅 Cache age: ${ageHours} hours`);

      if (age > this.expiryMs) {
        console.log("🗑️ Cached review expired, removing");
        await this.delete(prUrl);
        return null;
      }

      // Store in memory cache for faster access
      this.memoryCache.set(prUrl, {
        review: cached.review,
        expiry: cached.timestamp + this.expiryMs,
      });

      console.log("✅ Found valid cached review");
      return cached.review;
    } catch (error) {
      console.error("❌ Error reading cache:", error);
      return null;
    }
  }

  /**
   * Set cached review for a PR
   * @param {string} prUrl - Normalized PR URL
   * @param {Object} review - Review object to cache
   * @returns {Promise<void>}
   */
  async set(prUrl, review) {
    try {
      console.log("💾 Caching review for:", prUrl);

      const result = await chrome.storage.local.get([this.cacheKey]);
      const cache = result[this.cacheKey] || {};

      const timestamp = Date.now();
      cache[prUrl] = {
        review: review,
        timestamp: timestamp,
      };

      // Store in memory cache
      this.memoryCache.set(prUrl, {
        review: review,
        expiry: timestamp + this.expiryMs,
      });

      await chrome.storage.local.set({ [this.cacheKey]: cache });
      console.log("✅ Review cached successfully");
      console.log("📦 Total cached reviews:", Object.keys(cache).length);

      // Clean up old entries if cache is too large
      await this.cleanup(50); // Keep max 50 entries
    } catch (error) {
      console.error("❌ Error saving to cache:", error);
    }
  }

  /**
   * Delete cached review for a PR
   * @param {string} prUrl - Normalized PR URL
   * @returns {Promise<void>}
   */
  async delete(prUrl) {
    try {
      const result = await chrome.storage.local.get([this.cacheKey]);
      const cache = result[this.cacheKey] || {};

      if (cache[prUrl]) {
        delete cache[prUrl];
        this.memoryCache.delete(prUrl);
        await chrome.storage.local.set({ [this.cacheKey]: cache });
        console.log("🗑️ Cached review cleared for:", prUrl);
      }
    } catch (error) {
      console.error("❌ Error clearing cache:", error);
    }
  }

  /**
   * Clear all cached reviews
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await chrome.storage.local.remove([this.cacheKey]);
      this.memoryCache.clear();
      console.log("🗑️ All cached reviews cleared");
    } catch (error) {
      console.error("❌ Error clearing all cache:", error);
    }
  }

  /**
   * Get all cached reviews
   * @returns {Promise<Array>} Array of cached review entries
   */
  async list() {
    try {
      const result = await chrome.storage.local.get([this.cacheKey]);
      const cache = result[this.cacheKey] || {};

      const entries = Object.entries(cache).map(([url, data]) => {
        const age = Date.now() - data.timestamp;
        const ageHours = (age / (1000 * 60 * 60)).toFixed(1);
        return {
          url,
          timestamp: data.timestamp,
          age: ageHours,
          expired: age > this.expiryMs,
        };
      });

      return entries.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error("❌ Error listing cache:", error);
      return [];
    }
  }

  /**
   * Clean up expired or excess cache entries
   * @param {number} maxEntries - Maximum number of entries to keep
   * @returns {Promise<void>}
   */
  async cleanup(maxEntries = 50) {
    try {
      const result = await chrome.storage.local.get([this.cacheKey]);
      const cache = result[this.cacheKey] || {};

      const entries = Object.entries(cache);
      const now = Date.now();

      // Remove expired entries
      const validEntries = entries.filter(([_url, data]) => now - data.timestamp <= this.expiryMs);

      // Sort by timestamp (newest first) and keep only maxEntries
      const sortedEntries = validEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const limitedEntries = sortedEntries.slice(0, maxEntries);

      // Rebuild cache object
      const newCache = {};
      limitedEntries.forEach(([_url, data]) => {
        newCache[_url] = data;
      });

      const removed = entries.length - limitedEntries.length;
      if (removed > 0) {
        await chrome.storage.local.set({ [this.cacheKey]: newCache });
        console.log(`🧹 Cleaned up ${removed} cache entries`);
      }
    } catch (error) {
      console.error("❌ Error cleaning up cache:", error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    try {
      const result = await chrome.storage.local.get([this.cacheKey]);
      const cache = result[this.cacheKey] || {};

      const entries = Object.entries(cache);
      const now = Date.now();

      const stats = {
        total: entries.length,
        valid: 0,
        expired: 0,
        memoryCache: this.memoryCache.size,
        oldestTimestamp: null,
        newestTimestamp: null,
      };

      entries.forEach(([_url, data]) => {
        const age = now - data.timestamp;
        if (age <= this.expiryMs) {
          stats.valid++;
        } else {
          stats.expired++;
        }

        if (!stats.oldestTimestamp || data.timestamp < stats.oldestTimestamp) {
          stats.oldestTimestamp = data.timestamp;
        }
        if (!stats.newestTimestamp || data.timestamp > stats.newestTimestamp) {
          stats.newestTimestamp = data.timestamp;
        }
      });

      return stats;
    } catch (error) {
      console.error("❌ Error getting cache stats:", error);
      return null;
    }
  }

  /**
   * Check if a PR has a valid cached review
   * @param {string} prUrl - Normalized PR URL
   * @returns {Promise<boolean>}
   */
  async has(prUrl) {
    const cached = await this.get(prUrl);
    return cached !== null;
  }

  /**
   * Clear memory cache only
   */
  clearMemoryCache() {
    this.memoryCache.clear();
    console.log("🗑️ Memory cache cleared");
  }
}

// Create singleton instance
// eslint-disable-next-line no-redeclare
const cacheService = new CacheService();

// Make available globally
if (typeof window !== "undefined") {
  window.cacheService = cacheService;
  window.CacheService = CacheService;
}

// CommonJS export for Node.js/Jest testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CacheService, cacheService };
}
