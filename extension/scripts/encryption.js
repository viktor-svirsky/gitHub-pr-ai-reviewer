/**
 * Secure Storage with Encryption
 * Uses Web Crypto API to encrypt sensitive data before storing in chrome.storage.local
 */

class SecureStorage {
  constructor() {
    this.SALT = "github-pr-ai-reviewer-v1-salt-2024";
    this.ITERATIONS = 100000;
    this.masterKeyCache = null;
  }

  /**
   * Derive encryption key from master password
   */
  async deriveKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode(this.SALT),
        iterations: this.ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypt text with given key
   */
  async encrypt(text, key) {
    if (!text) return null;

    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));

    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    };
  }

  /**
   * Decrypt encrypted object with given key
   */
  async decrypt(encrypted, key) {
    if (!encrypted || !encrypted.iv || !encrypted.data) {
      return null;
    }

    const dec = new TextDecoder();

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(encrypted.iv) },
        key,
        new Uint8Array(encrypted.data)
      );

      return dec.decode(decrypted);
    } catch (error) {
      console.error("Decryption failed:", error);
      throw new Error("Invalid master password or corrupted data");
    }
  }

  /**
   * Save encrypted value to chrome.storage.local
   */
  async saveSecure(keyName, value, masterPassword) {
    if (!value) {
      // If empty, just remove the key
      await chrome.storage.local.remove([keyName]);
      return;
    }

    const key = await this.deriveKey(masterPassword);
    const encrypted = await this.encrypt(value, key);

    await chrome.storage.local.set({
      [keyName]: {
        encrypted: true,
        ...encrypted,
      },
    });
  }

  /**
   * Get and decrypt value from chrome.storage.local
   */
  async getSecure(keyName, masterPassword) {
    const result = await chrome.storage.local.get([keyName]);
    const stored = result[keyName];

    if (!stored) return null;

    // Check if it's encrypted
    if (stored.encrypted) {
      const key = await this.deriveKey(masterPassword);
      return await this.decrypt(stored, key);
    }

    // Fallback for non-encrypted values (backward compatibility)
    return stored;
  }

  /**
   * Check if encryption is enabled (master password is set)
   */
  async isEncryptionEnabled() {
    const result = await chrome.storage.local.get(["encryptionEnabled"]);
    return result.encryptionEnabled === true;
  }

  /**
   * Enable encryption with master password
   */
  async enableEncryption(masterPassword) {
    if (!masterPassword || masterPassword.length < 8) {
      throw new Error("Master password must be at least 8 characters");
    }

    // Test that we can derive a key
    await this.deriveKey(masterPassword);

    await chrome.storage.local.set({
      encryptionEnabled: true,
      encryptionTimestamp: Date.now(),
    });
  }

  /**
   * Disable encryption (decrypt and store as plain text)
   */
  async disableEncryption() {
    await chrome.storage.local.set({
      encryptionEnabled: false,
    });
    this.masterKeyCache = null;
  }

  /**
   * Verify master password is correct
   */
  async verifyMasterPassword(masterPassword) {
    try {
      // Try to get and decrypt any encrypted value
      const result = await chrome.storage.local.get(["openrouterApiKey", "githubToken", "apiKey"]);

      // Find first encrypted value
      for (const value of Object.values(result)) {
        if (value && value.encrypted) {
          const key = await this.deriveKey(masterPassword);
          await this.decrypt(value, key);
          return true;
        }
      }

      // No encrypted values to verify against, just validate format
      if (masterPassword.length >= 8) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Migrate existing plaintext values to encrypted storage
   */
  async migrateToEncryption(masterPassword, values = {}) {
    const key = await this.deriveKey(masterPassword);

    const encrypted = {};
    for (const [keyName, value] of Object.entries(values)) {
      if (value) {
        const encryptedValue = await this.encrypt(value, key);
        encrypted[keyName] = {
          encrypted: true,
          ...encryptedValue,
        };
      }
    }

    await chrome.storage.local.set(encrypted);
  }

  /**
   * Clear all stored data (for reset)
   */
  async clearAll() {
    await chrome.storage.local.clear();
    this.masterKeyCache = null;
  }
}

// Export singleton instance
const secureStorage = new SecureStorage();

// Make available globally for content scripts
if (typeof window !== "undefined") {
  window.secureStorage = secureStorage;
  window.SecureStorage = SecureStorage;
}

// CommonJS export for Node.js/Jest testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SecureStorage, secureStorage };
}
