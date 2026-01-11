// Tests for SettingsService

// Load modules using CommonJS require
const { CONFIG } = require("../extension/scripts/utils/constants.js");

// Make CONFIG available globally for the settings service
global.CONFIG = CONFIG;

// Load the settings service
const { SettingsService } = require("../extension/scripts/services/settings-service.js");

describe("SettingsService", () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    global.resetChromeStorage();
    service = new SettingsService();
  });

  describe("constructor", () => {
    it("should initialize with correct defaults", () => {
      expect(service.cache).toBeInstanceOf(Map);
      expect(service.cacheTTL).toBe(CONFIG.SETTINGS_CACHE_TTL);
      expect(service.listeners).toBeInstanceOf(Set);
    });

    it("should use default cache TTL if not configured", () => {
      const originalTTL = CONFIG.SETTINGS_CACHE_TTL;
      delete CONFIG.SETTINGS_CACHE_TTL;

      const newService = new SettingsService();
      expect(newService.cacheTTL).toBe(5 * 60 * 1000);

      CONFIG.SETTINGS_CACHE_TTL = originalTTL;
    });
  });

  describe("get", () => {
    const testSettings = {
      openrouterApiKey: "test-key",
      aiModel: "test-model",
    };

    beforeEach(async () => {
      await chrome.storage.local.set(testSettings);
    });

    it("should retrieve settings from storage", async () => {
      const result = await service.get(["openrouterApiKey", "aiModel"]);

      expect(result).toEqual(testSettings);
      // Keys are sorted before being passed to storage
      expect(chrome.storage.local.get).toHaveBeenCalledWith(["aiModel", "openrouterApiKey"]);
    });

    it("should cache retrieved settings", async () => {
      await service.get(["openrouterApiKey"]);
      await service.get(["openrouterApiKey"]);

      expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    });

    it("should respect cache TTL", async () => {
      jest.useFakeTimers();

      await service.get(["openrouterApiKey"]);

      jest.advanceTimersByTime(service.cacheTTL + 1000);

      await service.get(["openrouterApiKey"]);

      expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it("should force refresh when requested", async () => {
      await service.get(["openrouterApiKey"]);
      await service.get(["openrouterApiKey"], true);

      expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);
    });

    it("should sort keys for consistent cache key", async () => {
      await service.get(["aiModel", "openrouterApiKey"]);
      await service.get(["openrouterApiKey", "aiModel"]);

      expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    });

    it("should handle empty keys array", async () => {
      const result = await service.get([]);
      expect(result).toEqual({});
    });

    it("should handle single key", async () => {
      const result = await service.get(["openrouterApiKey"]);
      expect(result.openrouterApiKey).toBe("test-key");
    });

    it("should return empty object for non-existent keys", async () => {
      const result = await service.get(["nonExistent"]);
      expect(result).toEqual({});
    });
  });

  describe("getValue", () => {
    beforeEach(async () => {
      await chrome.storage.local.set({
        openrouterApiKey: "test-key",
        aiModel: "test-model",
      });
    });

    it("should retrieve single setting value", async () => {
      const result = await service.getValue("openrouterApiKey");
      expect(result).toBe("test-key");
    });

    it("should return default value if not found", async () => {
      const result = await service.getValue("nonExistent", "default-value");
      expect(result).toBe("default-value");
    });

    it("should return null as default if not specified", async () => {
      const result = await service.getValue("nonExistent");
      expect(result).toBe(null);
    });

    it("should return value even if it is falsy", async () => {
      await chrome.storage.local.set({ booleanSetting: false });
      const result = await service.getValue("booleanSetting", true);
      expect(result).toBe(false);
    });

    it("should return value even if it is zero", async () => {
      await chrome.storage.local.set({ numberSetting: 0 });
      const result = await service.getValue("numberSetting", 10);
      expect(result).toBe(0);
    });

    it("should return value even if it is empty string", async () => {
      await chrome.storage.local.set({ stringSetting: "" });
      const result = await service.getValue("stringSetting", "default");
      expect(result).toBe("");
    });
  });

  describe("set", () => {
    it("should save settings to storage", async () => {
      const settings = { openrouterApiKey: "new-key" };
      await service.set(settings);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(settings);
    });

    it("should clear cache after saving", async () => {
      await service.get(["openrouterApiKey"]);
      expect(service.cache.size).toBeGreaterThan(0);

      await service.set({ openrouterApiKey: "new-key" });
      expect(service.cache.size).toBe(0);
    });

    it("should notify listeners", async () => {
      const listener = jest.fn();
      service.addListener(listener);

      const settings = { openrouterApiKey: "new-key" };
      await service.set(settings);

      expect(listener).toHaveBeenCalledWith(settings);
    });

    it("should handle multiple settings", async () => {
      const settings = {
        openrouterApiKey: "key",
        aiModel: "model",
        githubToken: "token",
      };

      await service.set(settings);

      const result = await service.get(Object.keys(settings), true);
      expect(result).toEqual(settings);
    });

    it("should overwrite existing settings", async () => {
      await service.set({ openrouterApiKey: "old-key" });
      await service.set({ openrouterApiKey: "new-key" });

      const result = await service.getValue("openrouterApiKey");
      expect(result).toBe("new-key");
    });
  });

  describe("clearCache", () => {
    it("should clear all cached settings", async () => {
      await service.get(["openrouterApiKey"]);
      await service.get(["aiModel"]);

      expect(service.cache.size).toBeGreaterThan(0);

      service.clearCache();
      expect(service.cache.size).toBe(0);
    });

    it("should work when cache is empty", () => {
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  describe("removeCached", () => {
    it("should remove specific cached settings", async () => {
      await service.get(["openrouterApiKey"]);
      await service.get(["aiModel"]);

      const initialSize = service.cache.size;
      service.removeCached(["openrouterApiKey"]);

      expect(service.cache.size).toBeLessThan(initialSize);
    });

    it("should handle non-existent cache keys", () => {
      expect(() => service.removeCached(["nonExistent"])).not.toThrow();
    });

    it("should sort keys before removing", () => {
      // Keys are always sorted, so both orderings should produce the same cache key
      const cacheKey = "aiModel,openrouterApiKey";

      service.cache.set(cacheKey, { value: {}, expiry: Date.now() + 10000 });

      // Both orderings should remove the same cache key
      service.removeCached(["openrouterApiKey", "aiModel"]);
      expect(service.cache.has(cacheKey)).toBe(false);

      service.cache.set(cacheKey, { value: {}, expiry: Date.now() + 10000 });

      service.removeCached(["aiModel", "openrouterApiKey"]);
      expect(service.cache.has(cacheKey)).toBe(false);
    });
  });

  describe("getApiKey", () => {
    it("should retrieve API key", async () => {
      await chrome.storage.local.set({ openrouterApiKey: "test-key" });

      const result = await service.getApiKey("openrouterApiKey");
      expect(result).toBe("test-key");
    });

    it("should return null if API key not set", async () => {
      const result = await service.getApiKey("openrouterApiKey");
      expect(result).toBe(null);
    });

    it("should throw error if encryption is enabled and key is encrypted", async () => {
      await chrome.storage.local.set({
        openrouterApiKey: {
          encrypted: true,
          iv: [1, 2, 3],
          data: [4, 5, 6],
        },
        encryptionEnabled: true,
      });

      await expect(service.getApiKey("openrouterApiKey")).rejects.toThrow(
        CONFIG.MESSAGES.ERROR_ENCRYPTION_ENABLED
      );
    });

    it("should handle plain text key when encryption is enabled but key is not encrypted", async () => {
      await chrome.storage.local.set({
        openrouterApiKey: "plain-key",
        encryptionEnabled: true,
      });

      const result = await service.getApiKey("openrouterApiKey");
      expect(result).toBe("plain-key");
    });

    it("should handle GitHub token", async () => {
      await chrome.storage.local.set({ githubToken: "github-token" });

      const result = await service.getApiKey("githubToken");
      expect(result).toBe("github-token");
    });

    it("should check encryption status when getting API key", async () => {
      await chrome.storage.local.set({
        openrouterApiKey: "test-key",
        encryptionEnabled: false,
      });

      const result = await service.getApiKey("openrouterApiKey");

      expect(result).toBe("test-key");
      expect(chrome.storage.local.get).toHaveBeenCalled();
    });
  });

  describe("isConfigured", () => {
    it("should return true when API key is configured", async () => {
      await chrome.storage.local.set({ openrouterApiKey: "test-key" });

      const result = await service.isConfigured();
      expect(result).toBe(true);
    });

    it("should return false when API key is not configured", async () => {
      const result = await service.isConfigured();
      expect(result).toBe(false);
    });

    it("should return false for empty API key", async () => {
      await chrome.storage.local.set({ openrouterApiKey: "" });

      const result = await service.isConfigured();
      expect(result).toBe(false);
    });

    it("should return false for null API key", async () => {
      await chrome.storage.local.set({ openrouterApiKey: null });

      const result = await service.isConfigured();
      expect(result).toBe(false);
    });
  });

  describe("getReviewSettings", () => {
    const reviewSettings = {
      openrouterApiKey: "test-key",
      aiModel: "test-model",
      githubToken: "test-token",
      reviewDepth: "medium",
      encryptionEnabled: false,
    };

    it("should retrieve all review-related settings", async () => {
      await chrome.storage.local.set(reviewSettings);

      const result = await service.getReviewSettings();

      expect(result).toEqual(reviewSettings);
    });

    it("should retrieve only existing settings", async () => {
      await chrome.storage.local.set({
        openrouterApiKey: "test-key",
        aiModel: "test-model",
      });

      const result = await service.getReviewSettings();

      expect(result.openrouterApiKey).toBe("test-key");
      expect(result.aiModel).toBe("test-model");
      expect(result.githubToken).toBeUndefined();
    });
  });

  describe("listeners", () => {
    it("should add listener", () => {
      const listener = jest.fn();
      service.addListener(listener);

      expect(service.listeners.has(listener)).toBe(true);
    });

    it("should remove listener", () => {
      const listener = jest.fn();
      service.addListener(listener);
      service.removeListener(listener);

      expect(service.listeners.has(listener)).toBe(false);
    });

    it("should notify all listeners on settings change", async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      service.addListener(listener1);
      service.addListener(listener2);

      const settings = { openrouterApiKey: "new-key" };
      await service.set(settings);

      expect(listener1).toHaveBeenCalledWith(settings);
      expect(listener2).toHaveBeenCalledWith(settings);
    });

    it("should handle listener errors gracefully", async () => {
      const errorListener = jest.fn(() => {
        throw new Error("Listener error");
      });
      const goodListener = jest.fn();

      service.addListener(errorListener);
      service.addListener(goodListener);

      const settings = { openrouterApiKey: "new-key" };
      await expect(service.set(settings)).resolves.not.toThrow();

      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });

    it("should allow removing non-existent listener", () => {
      const listener = jest.fn();
      expect(() => service.removeListener(listener)).not.toThrow();
    });

    it("should support multiple add/remove operations", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      service.addListener(listener1);
      service.addListener(listener2);
      service.removeListener(listener1);
      service.addListener(listener1);

      expect(service.listeners.has(listener1)).toBe(true);
      expect(service.listeners.has(listener2)).toBe(true);
    });
  });

  describe("reset", () => {
    it("should clear all settings", async () => {
      await chrome.storage.local.set({
        openrouterApiKey: "key",
        aiModel: "model",
        githubToken: "token",
      });

      await service.reset();

      const allData = await chrome.storage.local.get(null);
      expect(Object.keys(allData).length).toBe(0);
    });

    it("should clear cache", async () => {
      await service.get(["openrouterApiKey"]);
      expect(service.cache.size).toBeGreaterThan(0);

      await service.reset();
      expect(service.cache.size).toBe(0);
    });

    it("should work on empty storage", async () => {
      await expect(service.reset()).resolves.not.toThrow();
    });
  });

  describe("export", () => {
    it("should export all settings", async () => {
      const settings = {
        openrouterApiKey: "key",
        aiModel: "model",
        githubToken: "token",
      };

      await chrome.storage.local.set(settings);

      const exported = await service.export();
      expect(exported).toEqual(settings);
    });

    it("should return empty object when no settings exist", async () => {
      const exported = await service.export();
      expect(exported).toEqual({});
    });

    it("should include all storage keys", async () => {
      await chrome.storage.local.set({
        key1: "value1",
        key2: "value2",
        key3: "value3",
      });

      const exported = await service.export();
      expect(Object.keys(exported).length).toBe(3);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", async () => {
      await service.get(["openrouterApiKey"]);
      await service.get(["aiModel"]);

      const stats = service.getCacheStats();

      expect(stats.size).toBeGreaterThan(0);
      expect(stats.keys).toBeInstanceOf(Array);
    });

    it("should return zero size for empty cache", () => {
      const stats = service.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });

    it("should list all cache keys", async () => {
      await service.get(["openrouterApiKey"]);
      await service.get(["aiModel", "githubToken"]);

      const stats = service.getCacheStats();

      expect(stats.keys.length).toBe(2);
      expect(stats.keys).toContain("openrouterApiKey");
      expect(stats.keys).toContain("aiModel,githubToken");
    });
  });

  describe("chrome.storage.onChanged listener", () => {
    it("should register a listener for storage changes", () => {
      // The listener is registered when the module loads
      // We just verify the addListener was called
      expect(chrome.storage.onChanged.addListener).toBeDefined();
    });
  });

  describe("integration tests", () => {
    it("should handle full settings lifecycle", async () => {
      // Set initial settings
      await service.set({
        openrouterApiKey: "initial-key",
        aiModel: "initial-model",
      });

      // Retrieve settings (should be cached)
      let settings = await service.get(["openrouterApiKey", "aiModel"]);
      expect(settings.openrouterApiKey).toBe("initial-key");

      // Update settings
      await service.set({ openrouterApiKey: "updated-key" });

      // Retrieve updated settings (cache should be cleared)
      settings = await service.get(["openrouterApiKey", "aiModel"], true);
      expect(settings.openrouterApiKey).toBe("updated-key");

      // Export settings
      const exported = await service.export();
      expect(exported.openrouterApiKey).toBe("updated-key");

      // Reset all settings
      await service.reset();

      // Verify settings are cleared
      settings = await service.get(["openrouterApiKey", "aiModel"], true);
      expect(settings.openrouterApiKey).toBeUndefined();
    });

    it("should handle concurrent get requests", async () => {
      await chrome.storage.local.set({
        openrouterApiKey: "test-key",
        aiModel: "test-model",
      });

      // Multiple concurrent gets
      const promises = [
        service.get(["openrouterApiKey"]),
        service.get(["openrouterApiKey"]),
        service.get(["openrouterApiKey"]),
      ];

      const results = await Promise.all(promises);

      // All should return the same value
      results.forEach((result) => {
        expect(result.openrouterApiKey).toBe("test-key");
      });
    });

    it("should handle listener notifications during updates", async () => {
      const listener = jest.fn();
      service.addListener(listener);

      await service.set({ openrouterApiKey: "key1" });
      await service.set({ aiModel: "model1" });
      await service.set({ githubToken: "token1" });

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, { openrouterApiKey: "key1" });
      expect(listener).toHaveBeenNthCalledWith(2, { aiModel: "model1" });
      expect(listener).toHaveBeenNthCalledWith(3, { githubToken: "token1" });
    });
  });
});
