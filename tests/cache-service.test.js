// Tests for CacheService

// Load modules using CommonJS require
const { CONFIG } = require("../extension/scripts/utils/constants.js");

// Make CONFIG available globally for the cache service
global.CONFIG = CONFIG;

// Load the cache service
const { CacheService } = require("../extension/scripts/services/cache-service.js");

describe("CacheService", () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    global.resetChromeStorage();
    service = new CacheService();
  });

  describe("constructor", () => {
    it("should initialize with correct defaults", () => {
      expect(service.cacheKey).toBe(CONFIG.REVIEW_CACHE_KEY);
      expect(service.expiryMs).toBe(CONFIG.CACHE_EXPIRY_MS);
      expect(service.memoryCache).toBeInstanceOf(Map);
      expect(service.memoryCache.size).toBe(0);
    });
  });

  describe("get", () => {
    const prUrl = "https://github.com/owner/repo/pull/123";
    const reviewData = { summary: "Test review", comments: [] };

    it("should return null for non-existent cache", async () => {
      const result = await service.get(prUrl);
      expect(result).toBe(null);
    });

    it("should retrieve cached review from storage", async () => {
      const timestamp = Date.now();
      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: reviewData,
            timestamp: timestamp,
          },
        },
      });

      const result = await service.get(prUrl);
      expect(result).toEqual(reviewData);
    });

    it("should return null for expired cache", async () => {
      const expiredTimestamp = Date.now() - CONFIG.CACHE_EXPIRY_MS - 1000;
      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: reviewData,
            timestamp: expiredTimestamp,
          },
        },
      });

      const result = await service.get(prUrl);
      expect(result).toBe(null);
    });

    it("should delete expired cache automatically", async () => {
      const expiredTimestamp = Date.now() - CONFIG.CACHE_EXPIRY_MS - 1000;
      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: reviewData,
            timestamp: expiredTimestamp,
          },
        },
      });

      await service.get(prUrl);

      const storage = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      expect(storage[CONFIG.REVIEW_CACHE_KEY][prUrl]).toBeUndefined();
    });

    it("should retrieve from memory cache if available", async () => {
      const timestamp = Date.now();
      service.memoryCache.set(prUrl, {
        review: reviewData,
        expiry: timestamp + CONFIG.CACHE_EXPIRY_MS,
      });

      const result = await service.get(prUrl);
      expect(result).toEqual(reviewData);
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    it("should skip expired memory cache", async () => {
      const expiredTime = Date.now() - 1000;
      service.memoryCache.set(prUrl, {
        review: reviewData,
        expiry: expiredTime,
      });

      const result = await service.get(prUrl);
      expect(result).toBe(null);
    });

    it("should store in memory cache after retrieving from storage", async () => {
      const timestamp = Date.now();
      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: reviewData,
            timestamp: timestamp,
          },
        },
      });

      await service.get(prUrl);
      expect(service.memoryCache.has(prUrl)).toBe(true);
    });

    it("should handle storage errors gracefully", async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error("Storage error"));

      const result = await service.get(prUrl);
      expect(result).toBe(null);
    });

    it("should handle missing cache key in storage", async () => {
      await chrome.storage.local.set({ otherKey: "value" });

      const result = await service.get(prUrl);
      expect(result).toBe(null);
    });
  });

  describe("set", () => {
    const prUrl = "https://github.com/owner/repo/pull/123";
    const reviewData = { summary: "Test review", comments: [] };

    it("should store review in cache", async () => {
      await service.set(prUrl, reviewData);

      const storage = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      const cache = storage[CONFIG.REVIEW_CACHE_KEY];

      expect(cache[prUrl]).toBeDefined();
      expect(cache[prUrl].review).toEqual(reviewData);
      expect(cache[prUrl].timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it("should store in memory cache", async () => {
      await service.set(prUrl, reviewData);

      expect(service.memoryCache.has(prUrl)).toBe(true);
      const cached = service.memoryCache.get(prUrl);
      expect(cached.review).toEqual(reviewData);
    });

    it("should trigger cleanup if cache is large", async () => {
      const cleanupSpy = jest.spyOn(service, "cleanup");

      await service.set(prUrl, reviewData);

      expect(cleanupSpy).toHaveBeenCalledWith(50);
    });

    it("should overwrite existing cache entry", async () => {
      const oldReview = { summary: "Old review", comments: [] };
      const newReview = { summary: "New review", comments: [] };

      await service.set(prUrl, oldReview);
      await service.set(prUrl, newReview);

      const result = await service.get(prUrl);
      expect(result.summary).toBe("New review");
    });

    it("should handle storage errors gracefully", async () => {
      chrome.storage.local.set.mockRejectedValueOnce(new Error("Storage error"));

      await expect(service.set(prUrl, reviewData)).resolves.not.toThrow();
    });

    it("should preserve other cache entries when adding new one", async () => {
      const prUrl2 = "https://github.com/owner/repo/pull/124";
      const review2 = { summary: "Review 2", comments: [] };

      await service.set(prUrl, reviewData);
      await service.set(prUrl2, review2);

      const result1 = await service.get(prUrl);
      const result2 = await service.get(prUrl2);

      expect(result1).toEqual(reviewData);
      expect(result2).toEqual(review2);
    });
  });

  describe("delete", () => {
    const prUrl = "https://github.com/owner/repo/pull/123";
    const reviewData = { summary: "Test review", comments: [] };

    it("should delete cached review", async () => {
      await service.set(prUrl, reviewData);
      await service.delete(prUrl);

      const result = await service.get(prUrl);
      expect(result).toBe(null);
    });

    it("should remove from memory cache", async () => {
      await service.set(prUrl, reviewData);
      expect(service.memoryCache.has(prUrl)).toBe(true);

      await service.delete(prUrl);
      expect(service.memoryCache.has(prUrl)).toBe(false);
    });

    it("should handle deleting non-existent entry", async () => {
      await expect(service.delete(prUrl)).resolves.not.toThrow();
    });

    it("should handle storage errors gracefully", async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error("Storage error"));

      await expect(service.delete(prUrl)).resolves.not.toThrow();
    });

    it("should preserve other cache entries when deleting one", async () => {
      const prUrl2 = "https://github.com/owner/repo/pull/124";
      const review2 = { summary: "Review 2", comments: [] };

      await service.set(prUrl, reviewData);
      await service.set(prUrl2, review2);
      await service.delete(prUrl);

      const result1 = await service.get(prUrl);
      const result2 = await service.get(prUrl2);

      expect(result1).toBe(null);
      expect(result2).toEqual(review2);
    });
  });

  describe("clear", () => {
    it("should clear all cached reviews", async () => {
      const prUrl1 = "https://github.com/owner/repo/pull/123";
      const prUrl2 = "https://github.com/owner/repo/pull/124";

      await service.set(prUrl1, { summary: "Review 1", comments: [] });
      await service.set(prUrl2, { summary: "Review 2", comments: [] });

      await service.clear();

      const result1 = await service.get(prUrl1);
      const result2 = await service.get(prUrl2);

      expect(result1).toBe(null);
      expect(result2).toBe(null);
    });

    it("should clear memory cache", async () => {
      const prUrl = "https://github.com/owner/repo/pull/123";
      await service.set(prUrl, { summary: "Review", comments: [] });

      expect(service.memoryCache.size).toBeGreaterThan(0);

      await service.clear();
      expect(service.memoryCache.size).toBe(0);
    });

    it("should handle storage errors gracefully", async () => {
      chrome.storage.local.remove.mockRejectedValueOnce(new Error("Storage error"));

      await expect(service.clear()).resolves.not.toThrow();
    });
  });

  describe("list", () => {
    it("should return empty array when no cache exists", async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it("should list all cached reviews", async () => {
      const prUrl1 = "https://github.com/owner/repo/pull/123";
      const prUrl2 = "https://github.com/owner/repo/pull/124";

      await service.set(prUrl1, { summary: "Review 1", comments: [] });
      await service.set(prUrl2, { summary: "Review 2", comments: [] });

      const result = await service.list();

      expect(result.length).toBe(2);
      expect(result[0].url).toBeDefined();
      expect(result[0].timestamp).toBeDefined();
      expect(result[0].age).toBeDefined();
      expect(result[0].expired).toBeDefined();
    });

    it("should sort by timestamp descending", async () => {
      const prUrl1 = "https://github.com/owner/repo/pull/123";
      const prUrl2 = "https://github.com/owner/repo/pull/124";

      await service.set(prUrl1, { summary: "Review 1", comments: [] });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await service.set(prUrl2, { summary: "Review 2", comments: [] });

      const result = await service.list();

      expect(result[0].timestamp).toBeGreaterThanOrEqual(result[1].timestamp);
    });

    it("should mark expired entries", async () => {
      const prUrl = "https://github.com/owner/repo/pull/123";
      const expiredTimestamp = Date.now() - CONFIG.CACHE_EXPIRY_MS - 1000;

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: { summary: "Review", comments: [] },
            timestamp: expiredTimestamp,
          },
        },
      });

      const result = await service.list();

      expect(result[0].expired).toBe(true);
    });

    it("should calculate age in hours", async () => {
      const prUrl = "https://github.com/owner/repo/pull/123";
      const timestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: { summary: "Review", comments: [] },
            timestamp: timestamp,
          },
        },
      });

      const result = await service.list();

      expect(parseFloat(result[0].age)).toBeCloseTo(2, 1);
    });

    it("should handle storage errors gracefully", async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error("Storage error"));

      const result = await service.list();
      expect(result).toEqual([]);
    });
  });

  describe("cleanup", () => {
    it("should remove expired entries", async () => {
      const prUrl1 = "https://github.com/owner/repo/pull/123";
      const prUrl2 = "https://github.com/owner/repo/pull/124";
      const expiredTimestamp = Date.now() - CONFIG.CACHE_EXPIRY_MS - 1000;
      const validTimestamp = Date.now();

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl1]: {
            review: { summary: "Expired", comments: [] },
            timestamp: expiredTimestamp,
          },
          [prUrl2]: {
            review: { summary: "Valid", comments: [] },
            timestamp: validTimestamp,
          },
        },
      });

      await service.cleanup(50);

      const storage = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      const cache = storage[CONFIG.REVIEW_CACHE_KEY];

      expect(cache[prUrl1]).toBeUndefined();
      expect(cache[prUrl2]).toBeDefined();
    });

    it("should limit to maxEntries", async () => {
      const reviews = {};
      for (let i = 0; i < 10; i++) {
        const prUrl = `https://github.com/owner/repo/pull/${i}`;
        reviews[prUrl] = {
          review: { summary: `Review ${i}`, comments: [] },
          timestamp: Date.now() - i * 1000, // Different timestamps
        };
      }

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: reviews,
      });

      await service.cleanup(5);

      const storage = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      const cache = storage[CONFIG.REVIEW_CACHE_KEY];

      expect(Object.keys(cache).length).toBe(5);
    });

    it("should keep newest entries when limiting", async () => {
      const prUrl1 = "https://github.com/owner/repo/pull/123";
      const prUrl2 = "https://github.com/owner/repo/pull/124";

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl1]: {
            review: { summary: "Old", comments: [] },
            timestamp: Date.now() - 10000,
          },
          [prUrl2]: {
            review: { summary: "New", comments: [] },
            timestamp: Date.now(),
          },
        },
      });

      await service.cleanup(1);

      const storage = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      const cache = storage[CONFIG.REVIEW_CACHE_KEY];

      expect(cache[prUrl1]).toBeUndefined();
      expect(cache[prUrl2]).toBeDefined();
    });

    it("should not modify cache if under limit and no expired entries", async () => {
      const prUrl = "https://github.com/owner/repo/pull/123";
      await service.set(prUrl, { summary: "Review", comments: [] });

      const setSpy = jest.spyOn(chrome.storage.local, "set");
      setSpy.mockClear();

      await service.cleanup(50);

      // Should not call set again if no cleanup needed
      expect(setSpy).not.toHaveBeenCalled();
    });

    it("should handle storage errors gracefully", async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error("Storage error"));

      await expect(service.cleanup(50)).resolves.not.toThrow();
    });
  });

  describe("getStats", () => {
    it("should return stats for empty cache", async () => {
      const stats = await service.getStats();

      expect(stats.total).toBe(0);
      expect(stats.valid).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.memoryCache).toBe(0);
      expect(stats.oldestTimestamp).toBe(null);
      expect(stats.newestTimestamp).toBe(null);
    });

    it("should count total entries", async () => {
      await service.set("https://github.com/owner/repo/pull/123", {
        summary: "Review 1",
        comments: [],
      });
      await service.set("https://github.com/owner/repo/pull/124", {
        summary: "Review 2",
        comments: [],
      });

      const stats = await service.getStats();

      expect(stats.total).toBe(2);
      expect(stats.valid).toBe(2);
      expect(stats.expired).toBe(0);
    });

    it("should count expired entries", async () => {
      const prUrl = "https://github.com/owner/repo/pull/123";
      const expiredTimestamp = Date.now() - CONFIG.CACHE_EXPIRY_MS - 1000;

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: { summary: "Review", comments: [] },
            timestamp: expiredTimestamp,
          },
        },
      });

      const stats = await service.getStats();

      expect(stats.total).toBe(1);
      expect(stats.valid).toBe(0);
      expect(stats.expired).toBe(1);
    });

    it("should track memory cache size", async () => {
      await service.set("https://github.com/owner/repo/pull/123", {
        summary: "Review",
        comments: [],
      });

      const stats = await service.getStats();

      expect(stats.memoryCache).toBe(1);
    });

    it("should track oldest and newest timestamps", async () => {
      const timestamp1 = Date.now() - 10000;
      const timestamp2 = Date.now();

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          "https://github.com/owner/repo/pull/123": {
            review: { summary: "Old", comments: [] },
            timestamp: timestamp1,
          },
          "https://github.com/owner/repo/pull/124": {
            review: { summary: "New", comments: [] },
            timestamp: timestamp2,
          },
        },
      });

      const stats = await service.getStats();

      expect(stats.oldestTimestamp).toBe(timestamp1);
      expect(stats.newestTimestamp).toBe(timestamp2);
    });

    it("should handle storage errors gracefully", async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error("Storage error"));

      const stats = await service.getStats();
      expect(stats).toBe(null);
    });
  });

  describe("has", () => {
    const prUrl = "https://github.com/owner/repo/pull/123";

    it("should return true for cached review", async () => {
      await service.set(prUrl, { summary: "Review", comments: [] });

      const result = await service.has(prUrl);
      expect(result).toBe(true);
    });

    it("should return false for non-existent review", async () => {
      const result = await service.has(prUrl);
      expect(result).toBe(false);
    });

    it("should return false for expired review", async () => {
      const expiredTimestamp = Date.now() - CONFIG.CACHE_EXPIRY_MS - 1000;

      await chrome.storage.local.set({
        [CONFIG.REVIEW_CACHE_KEY]: {
          [prUrl]: {
            review: { summary: "Review", comments: [] },
            timestamp: expiredTimestamp,
          },
        },
      });

      const result = await service.has(prUrl);
      expect(result).toBe(false);
    });
  });

  describe("clearMemoryCache", () => {
    it("should clear only memory cache", async () => {
      const prUrl = "https://github.com/owner/repo/pull/123";
      await service.set(prUrl, { summary: "Review", comments: [] });

      expect(service.memoryCache.size).toBeGreaterThan(0);

      service.clearMemoryCache();

      expect(service.memoryCache.size).toBe(0);

      // Storage should still have the data
      const result = await service.get(prUrl);
      expect(result).not.toBe(null);
    });

    it("should handle empty memory cache", () => {
      expect(() => service.clearMemoryCache()).not.toThrow();
    });
  });
});
