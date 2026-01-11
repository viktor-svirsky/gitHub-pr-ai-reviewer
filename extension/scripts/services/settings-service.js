// Settings Service with in-memory caching
// Reduces chrome.storage.local calls and improves performance

class SettingsService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = CONFIG.SETTINGS_CACHE_TTL || 5 * 60 * 1000; // 5 minutes
    this.listeners = new Set();
  }

  /**
   * Get settings with caching
   * @param {string[]} keys - Settings keys to retrieve
   * @param {boolean} forceRefresh - Force cache refresh
   * @returns {Promise<Object>} Settings object
   */
  async get(keys, forceRefresh = false) {
    const cacheKey = keys.sort().join(",");
    const cached = this.cache.get(cacheKey);

    if (!forceRefresh && cached && Date.now() < cached.expiry) {
      console.log("📦 Settings retrieved from cache:", keys);
      return cached.value;
    }

    console.log("🔄 Fetching settings from storage:", keys);
    const settings = await chrome.storage.local.get(keys);

    this.cache.set(cacheKey, {
      value: settings,
      expiry: Date.now() + this.cacheTTL,
    });

    return settings;
  }

  /**
   * Get single setting value
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value if not found
   * @returns {Promise<any>} Setting value
   */
  async getValue(key, defaultValue = null) {
    const settings = await this.get([key]);
    return settings[key] !== undefined ? settings[key] : defaultValue;
  }

  /**
   * Set settings and invalidate cache
   * @param {Object} settings - Settings to save
   * @returns {Promise<void>}
   */
  async set(settings) {
    console.log("💾 Saving settings:", Object.keys(settings));
    await chrome.storage.local.set(settings);
    this.clearCache();
    this.notifyListeners(settings);
  }

  /**
   * Clear all cached settings
   */
  clearCache() {
    console.log("🗑️ Clearing settings cache");
    this.cache.clear();
  }

  /**
   * Remove specific cached setting
   * @param {string[]} keys - Keys to remove from cache
   */
  removeCached(keys) {
    const cacheKey = keys.sort().join(",");
    this.cache.delete(cacheKey);
  }

  /**
   * Get API key (handles encryption)
   * @param {string} keyName - API key name (openrouterApiKey, githubToken)
   * @returns {Promise<string|null>} API key or null
   */
  async getApiKey(keyName) {
    // 1. Try to get from session storage (decrypted) first
    // Only available in background/popup context
    if (chrome.storage.session) {
      try {
        const sessionKey = `decrypted_${keyName}`;
        const sessionData = await chrome.storage.session.get([sessionKey]);
        if (sessionData[sessionKey]) {
          console.log(`🔑 Retrieved ${keyName} from session storage`);
          // Refresh session activity
          chrome.storage.session.set({ lastActivity: Date.now() });
          return sessionData[sessionKey];
        }
      } catch (error) {
        console.warn("Failed to access session storage:", error);
      }
    }

    // 2. Fallback to local storage
    const settings = await this.get([keyName, "encryptionEnabled"], false);
    const apiKey = settings[keyName];

    // Check if encryption is enabled
    if (settings.encryptionEnabled) {
      // If key is encrypted (object with iv and data), we can't decrypt here without password
      if (apiKey && typeof apiKey === "object" && apiKey.encrypted) {
        console.warn(`⚠️ ${keyName} is encrypted - waiting for unlock via popup`);
        // We throw a specific error that the UI can catch to prompt for unlock
        throw new Error("ENCRYPTION_LOCKED");
      }
    }

    return apiKey || null;
  }

  /**
   * Check if settings are configured
   * @returns {Promise<boolean>}
   */
  async isConfigured() {
    const settings = await this.get(["openrouterApiKey"]);
    return !!settings.openrouterApiKey;
  }

  /**
   * Get all relevant settings for AI review
   * @returns {Promise<Object>}
   */
  async getReviewSettings() {
    return await this.get([
      "openrouterApiKey",
      "aiModel",
      "githubToken",
      "reviewDepth",
      "encryptionEnabled",
    ]);
  }

  /**
   * Add listener for settings changes
   * @param {Function} callback - Callback function
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove listener
   * @param {Function} callback - Callback function
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of settings change
   * @param {Object} settings - Changed settings
   */
  notifyListeners(settings) {
    this.listeners.forEach((callback) => {
      try {
        callback(settings);
      } catch (error) {
        console.error("Error in settings listener:", error);
      }
    });
  }

  /**
   * Reset all settings to defaults
   * @returns {Promise<void>}
   */
  async reset() {
    console.log("🔄 Resetting all settings");
    await chrome.storage.local.clear();
    this.clearCache();
  }

  /**
   * Export settings (for backup)
   * @returns {Promise<Object>}
   */
  async export() {
    const allSettings = await chrome.storage.local.get(null);
    return allSettings;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Create singleton instance
// eslint-disable-next-line no-redeclare
const settingsService = new SettingsService();

// Listen for storage changes from popup
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    console.log("🔔 Storage changed, clearing settings cache");
    settingsService.clearCache();
  }
});

// Make available globally
if (typeof window !== "undefined") {
  window.settingsService = settingsService;
  window.SettingsService = SettingsService;
}
if (typeof self !== "undefined") {
  self.settingsService = settingsService;
  self.SettingsService = SettingsService;
}

// CommonJS export for Node.js/Jest testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SettingsService, settingsService };
}
