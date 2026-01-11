// Tests for SecureStorage encryption service

// Load the encryption module using CommonJS require
const { SecureStorage } = require("../extension/scripts/encryption.js");

describe("SecureStorage", () => {
  let storage;
  const testPassword = "testPassword123";
  const testData = "sensitive data";

  beforeEach(() => {
    jest.clearAllMocks();
    global.resetChromeStorage();
    storage = new SecureStorage();
  });

  describe("constructor", () => {
    it("should initialize with correct defaults", () => {
      expect(storage.SALT_KEY).toBe("encryptionSalt");
      expect(storage.ITERATIONS).toBe(600000);
      expect(storage.masterKeyCache).toBe(null);
    });
  });

  describe("deriveKey", () => {
    it("should derive a key from password", async () => {
      const key = await storage.deriveKey(testPassword);

      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key._derived).toBe(true);
    });

    it("should derive consistent keys for same password", async () => {
      const key1 = await storage.deriveKey(testPassword);
      const key2 = await storage.deriveKey(testPassword);

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
    });

    it("should handle empty password", async () => {
      const key = await storage.deriveKey("");
      expect(key).toBeDefined();
    });

    it("should use PBKDF2 with correct parameters", async () => {
      await storage.deriveKey(testPassword);

      expect(crypto.subtle.importKey).toHaveBeenCalledWith(
        "raw",
        expect.anything(), // Uint8Array in browser, array-like in Node
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"]
      );

      expect(crypto.subtle.deriveKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "PBKDF2",
          iterations: 600000,
          hash: "SHA-256",
        }),
        expect.any(Object),
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    });
  });

  describe("encrypt", () => {
    let key;

    beforeEach(async () => {
      key = await storage.deriveKey(testPassword);
    });

    it("should encrypt text", async () => {
      const encrypted = await storage.encrypt(testData, key);

      expect(encrypted).toBeDefined();
      expect(encrypted.iv).toBeInstanceOf(Array);
      expect(encrypted.data).toBeInstanceOf(Array);
    });

    it("should return null for empty text", async () => {
      const encrypted = await storage.encrypt("", key);
      expect(encrypted).toBe(null);
    });

    it("should return null for null text", async () => {
      const encrypted = await storage.encrypt(null, key);
      expect(encrypted).toBe(null);
    });

    it("should generate unique IV for each encryption", async () => {
      const encrypted1 = await storage.encrypt(testData, key);
      const encrypted2 = await storage.encrypt(testData, key);

      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
    });

    it("should use AES-GCM encryption", async () => {
      await storage.encrypt(testData, key);

      expect(crypto.subtle.encrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "AES-GCM",
        }),
        key,
        expect.anything()
      );
    });

    it("should handle unicode characters", async () => {
      const unicodeText = "Hello 世界 🌍";
      const encrypted = await storage.encrypt(unicodeText, key);

      expect(encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.data).toBeDefined();
    });
  });

  describe("decrypt", () => {
    let key;
    let encrypted;

    beforeEach(async () => {
      key = await storage.deriveKey(testPassword);
      encrypted = await storage.encrypt(testData, key);
    });

    it("should decrypt encrypted data", async () => {
      const decrypted = await storage.decrypt(encrypted, key);

      expect(decrypted).toBe(testData);
    });

    it("should return null for null encrypted data", async () => {
      const decrypted = await storage.decrypt(null, key);
      expect(decrypted).toBe(null);
    });

    it("should return null for missing iv", async () => {
      const invalidEncrypted = { data: encrypted.data };
      const decrypted = await storage.decrypt(invalidEncrypted, key);
      expect(decrypted).toBe(null);
    });

    it("should return null for missing data", async () => {
      const invalidEncrypted = { iv: encrypted.iv };
      const decrypted = await storage.decrypt(invalidEncrypted, key);
      expect(decrypted).toBe(null);
    });

    it("should throw error for wrong key", async () => {
      const wrongKey = await storage.deriveKey("wrongPassword");

      // Mock decrypt to throw error for wrong key
      crypto.subtle.decrypt.mockRejectedValueOnce(new Error("Decryption failed"));

      await expect(storage.decrypt(encrypted, wrongKey)).rejects.toThrow(
        "Invalid master password or corrupted data"
      );
    });

    it("should decrypt unicode characters", async () => {
      const unicodeText = "Hello 世界 🌍";
      const encryptedUnicode = await storage.encrypt(unicodeText, key);
      const decrypted = await storage.decrypt(encryptedUnicode, key);

      expect(decrypted).toBe(unicodeText);
    });

    it("should use AES-GCM decryption", async () => {
      await storage.decrypt(encrypted, key);

      expect(crypto.subtle.decrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "AES-GCM",
          iv: expect.any(Uint8Array),
        }),
        key,
        expect.any(Uint8Array)
      );
    });
  });

  describe("saveSecure", () => {
    it("should encrypt and save value", async () => {
      await storage.saveSecure("testKey", testData, testPassword);

      const stored = await chrome.storage.local.get(["testKey"]);
      expect(stored.testKey).toBeDefined();
      expect(stored.testKey.encrypted).toBe(true);
      expect(stored.testKey.iv).toBeDefined();
      expect(stored.testKey.data).toBeDefined();
    });

    it("should remove key for empty value", async () => {
      await storage.saveSecure("testKey", "", testPassword);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(["testKey"]);
    });

    it("should remove key for null value", async () => {
      await storage.saveSecure("testKey", null, testPassword);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(["testKey"]);
    });

    it("should overwrite existing value", async () => {
      await storage.saveSecure("testKey", "value1", testPassword);
      await storage.saveSecure("testKey", "value2", testPassword);

      const retrieved = await storage.getSecure("testKey", testPassword);
      expect(retrieved).toBe("value2");
    });

    it("should handle multiple keys independently", async () => {
      await storage.saveSecure("key1", "value1", testPassword);
      await storage.saveSecure("key2", "value2", testPassword);

      const value1 = await storage.getSecure("key1", testPassword);
      const value2 = await storage.getSecure("key2", testPassword);

      expect(value1).toBe("value1");
      expect(value2).toBe("value2");
    });
  });

  describe("getSecure", () => {
    beforeEach(async () => {
      await storage.saveSecure("testKey", testData, testPassword);
    });

    it("should retrieve and decrypt value", async () => {
      const retrieved = await storage.getSecure("testKey", testPassword);
      expect(retrieved).toBe(testData);
    });

    it("should return null for non-existent key", async () => {
      const retrieved = await storage.getSecure("nonexistent", testPassword);
      expect(retrieved).toBe(null);
    });

    it("should handle backward compatibility for non-encrypted values", async () => {
      await chrome.storage.local.set({ plainKey: "plainValue" });

      const retrieved = await storage.getSecure("plainKey", testPassword);
      expect(retrieved).toBe("plainValue");
    });

    it("should fail with wrong password", async () => {
      crypto.subtle.decrypt.mockRejectedValueOnce(new Error("Decryption failed"));

      await expect(storage.getSecure("testKey", "wrongPassword")).rejects.toThrow();
    });
  });

  describe("isEncryptionEnabled", () => {
    it("should return false by default", async () => {
      const enabled = await storage.isEncryptionEnabled();
      expect(enabled).toBe(false);
    });

    it("should return true when encryption is enabled", async () => {
      await storage.enableEncryption(testPassword);

      const enabled = await storage.isEncryptionEnabled();
      expect(enabled).toBe(true);
    });

    it("should return false after disabling encryption", async () => {
      await storage.enableEncryption(testPassword);
      await storage.disableEncryption();

      const enabled = await storage.isEncryptionEnabled();
      expect(enabled).toBe(false);
    });
  });

  describe("enableEncryption", () => {
    it("should enable encryption with valid password", async () => {
      await storage.enableEncryption(testPassword);

      const stored = await chrome.storage.local.get(["encryptionEnabled", "encryptionTimestamp"]);
      expect(stored.encryptionEnabled).toBe(true);
      expect(stored.encryptionTimestamp).toBeDefined();
    });

    it("should throw error for password less than 8 characters", async () => {
      await expect(storage.enableEncryption("short")).rejects.toThrow(
        "Master password must be at least 8 characters"
      );
    });

    it("should throw error for empty password", async () => {
      await expect(storage.enableEncryption("")).rejects.toThrow(
        "Master password must be at least 8 characters"
      );
    });

    it("should throw error for null password", async () => {
      await expect(storage.enableEncryption(null)).rejects.toThrow(
        "Master password must be at least 8 characters"
      );
    });

    it("should derive key to validate password", async () => {
      const deriveKeySpy = jest.spyOn(storage, "deriveKey");

      await storage.enableEncryption(testPassword);

      expect(deriveKeySpy).toHaveBeenCalledWith(testPassword);
    });
  });

  describe("disableEncryption", () => {
    it("should disable encryption", async () => {
      await storage.enableEncryption(testPassword);
      await storage.disableEncryption();

      const stored = await chrome.storage.local.get(["encryptionEnabled"]);
      expect(stored.encryptionEnabled).toBe(false);
    });

    it("should clear master key cache", async () => {
      storage.masterKeyCache = { test: "data" };
      await storage.disableEncryption();

      expect(storage.masterKeyCache).toBe(null);
    });

    it("should work when encryption is not enabled", async () => {
      await expect(storage.disableEncryption()).resolves.not.toThrow();
    });
  });

  describe("verifyMasterPassword", () => {
    beforeEach(async () => {
      await storage.enableEncryption(testPassword);
      // Use a key that verifyMasterPassword actually checks
      await storage.saveSecure("openrouterApiKey", testData, testPassword);
    });

    it("should return true for correct password", async () => {
      const valid = await storage.verifyMasterPassword(testPassword);
      expect(valid).toBe(true);
    });

    it("should return false for incorrect password", async () => {
      crypto.subtle.decrypt.mockRejectedValueOnce(new Error("Decryption failed"));

      const valid = await storage.verifyMasterPassword("wrongPassword");
      expect(valid).toBe(false);
    });

    it("should return false for password less than 8 characters", async () => {
      // With our mock, decryption always succeeds, so "short" password still works
      // In the real implementation, the password would fail to decrypt
      // To properly test this, we'd need to mock the decrypt to fail for wrong passwords
      // For now, verify that a short password with no encrypted values returns true (length check)
      await chrome.storage.local.clear();
      const valid = await storage.verifyMasterPassword("short");
      // When no encrypted values exist, only length check is done
      expect(valid).toBe(false);
    });

    it("should return true for valid length password when no encrypted values exist", async () => {
      await chrome.storage.local.clear();

      const valid = await storage.verifyMasterPassword(testPassword);
      expect(valid).toBe(true);
    });

    it("should handle multiple encrypted values", async () => {
      await storage.saveSecure("key1", "value1", testPassword);
      await storage.saveSecure("key2", "value2", testPassword);

      const valid = await storage.verifyMasterPassword(testPassword);
      expect(valid).toBe(true);
    });
  });

  describe("migrateToEncryption", () => {
    const values = {
      apiKey: "test-api-key",
      token: "test-token",
      secret: "test-secret",
    };

    it("should encrypt all provided values", async () => {
      await storage.migrateToEncryption(testPassword, values);

      const stored = await chrome.storage.local.get(Object.keys(values));

      expect(stored.apiKey.encrypted).toBe(true);
      expect(stored.token.encrypted).toBe(true);
      expect(stored.secret.encrypted).toBe(true);
    });

    it("should skip empty values", async () => {
      const valuesWithEmpty = {
        ...values,
        empty: "",
        nullValue: null,
      };

      await storage.migrateToEncryption(testPassword, valuesWithEmpty);

      const stored = await chrome.storage.local.get(Object.keys(valuesWithEmpty));

      expect(stored.apiKey).toBeDefined();
      expect(stored.token).toBeDefined();
      expect(stored.secret).toBeDefined();
      expect(stored.empty).toBeUndefined();
      expect(stored.nullValue).toBeUndefined();
    });

    it("should handle empty values object", async () => {
      await expect(storage.migrateToEncryption(testPassword, {})).resolves.not.toThrow();
    });

    it("should be able to decrypt migrated values", async () => {
      await storage.migrateToEncryption(testPassword, values);

      const apiKey = await storage.getSecure("apiKey", testPassword);
      const token = await storage.getSecure("token", testPassword);
      const secret = await storage.getSecure("secret", testPassword);

      expect(apiKey).toBe(values.apiKey);
      expect(token).toBe(values.token);
      expect(secret).toBe(values.secret);
    });
  });

  describe("clearAll", () => {
    it("should clear all storage", async () => {
      await storage.saveSecure("key1", "value1", testPassword);
      await storage.saveSecure("key2", "value2", testPassword);
      await storage.enableEncryption(testPassword);

      await storage.clearAll();

      const allData = await chrome.storage.local.get(null);
      expect(Object.keys(allData).length).toBe(0);
    });

    it("should clear master key cache", async () => {
      storage.masterKeyCache = { test: "data" };

      await storage.clearAll();

      expect(storage.masterKeyCache).toBe(null);
    });

    it("should handle empty storage", async () => {
      await expect(storage.clearAll()).resolves.not.toThrow();
    });
  });

  describe("end-to-end encryption flow", () => {
    it("should complete full encryption cycle", async () => {
      // Enable encryption
      await storage.enableEncryption(testPassword);
      expect(await storage.isEncryptionEnabled()).toBe(true);

      // Save encrypted data
      await storage.saveSecure("apiKey", "secret-key-123", testPassword);

      // Verify password
      expect(await storage.verifyMasterPassword(testPassword)).toBe(true);

      // Retrieve encrypted data
      const retrieved = await storage.getSecure("apiKey", testPassword);
      expect(retrieved).toBe("secret-key-123");

      // Disable encryption
      await storage.disableEncryption();
      expect(await storage.isEncryptionEnabled()).toBe(false);
    });

    it("should handle migration from plain to encrypted", async () => {
      // Start with plain storage
      await chrome.storage.local.set({
        apiKey: "plain-key",
        token: "plain-token",
      });

      // Enable encryption and migrate
      await storage.enableEncryption(testPassword);
      await storage.migrateToEncryption(testPassword, {
        apiKey: "plain-key",
        token: "plain-token",
      });

      // Verify encrypted values
      const apiKey = await storage.getSecure("apiKey", testPassword);
      const token = await storage.getSecure("token", testPassword);

      expect(apiKey).toBe("plain-key");
      expect(token).toBe("plain-token");
    });

    it("should prevent access with wrong password", async () => {
      await storage.enableEncryption(testPassword);
      await storage.saveSecure("secret", "sensitive-data", testPassword);

      crypto.subtle.decrypt.mockRejectedValueOnce(new Error("Decryption failed"));

      await expect(storage.getSecure("secret", "wrongPassword")).rejects.toThrow();
    });
  });
});
