// Jest setup file - Mock Chrome APIs and Web Crypto API

// Mock chrome.storage.local API
global.chrome = {
  storage: {
    local: {
      data: {},
      get: jest.fn((keys) => {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach((key) => {
            if (global.chrome.storage.local.data[key] !== undefined) {
              result[key] = global.chrome.storage.local.data[key];
            }
          });
        } else if (keys === null) {
          // Get all data
          Object.assign(result, global.chrome.storage.local.data);
        } else if (typeof keys === "object") {
          // Object with default values
          Object.keys(keys).forEach((key) => {
            result[key] =
              global.chrome.storage.local.data[key] !== undefined
                ? global.chrome.storage.local.data[key]
                : keys[key];
          });
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items) => {
        Object.assign(global.chrome.storage.local.data, items);
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach((key) => {
          delete global.chrome.storage.local.data[key];
        });
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        global.chrome.storage.local.data = {};
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

// Mock Web Crypto API
const crypto = require("crypto");

// Mock TextEncoder/TextDecoder
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock crypto.subtle for encryption tests
global.crypto = {
  getRandomValues: (array) => {
    return crypto.randomFillSync(array);
  },
  subtle: {
    importKey: jest.fn((format, keyData, algorithm, extractable, keyUsages) => {
      return Promise.resolve({
        type: "secret",
        extractable,
        algorithm,
        usages: keyUsages,
        _keyData: keyData,
      });
    }),
    deriveKey: jest.fn((algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages) => {
      return Promise.resolve({
        type: "secret",
        extractable,
        algorithm: derivedKeyAlgorithm,
        usages: keyUsages,
        _derived: true,
      });
    }),
    deriveBits: jest.fn(() => {
      return Promise.resolve(new ArrayBuffer(32));
    }),
    encrypt: jest.fn((algorithm, key, data) => {
      // Simple mock encryption - just return the data with a marker
      const result = new Uint8Array(data.byteLength + 16);
      result.set(new Uint8Array(data), 0);
      result.set(new Uint8Array(16).fill(0xab), data.byteLength);
      return Promise.resolve(result.buffer);
    }),
    decrypt: jest.fn((algorithm, key, data) => {
      // Simple mock decryption - remove the marker
      const dataArray = new Uint8Array(data);
      const result = dataArray.slice(0, dataArray.length - 16);
      return Promise.resolve(result.buffer);
    }),
  },
};

// Mock fetch API
global.fetch = jest.fn();

// Mock DOM APIs
global.MutationObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// Mock document if not available
if (typeof document === "undefined") {
  global.document = {
    createElement: jest.fn((tag) => ({
      tagName: tag.toUpperCase(),
      textContent: "",
      innerHTML: "",
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
    head: {
      appendChild: jest.fn(),
    },
  };
}

// Mock window.location
if (typeof window !== "undefined") {
  delete window.location;
  window.location = {
    pathname: "/owner/repo/pull/123",
    origin: "https://github.com",
    href: "https://github.com/owner/repo/pull/123",
  };
}

// Mock console methods to reduce test noise (optional)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Helper to reset chrome.storage.local data between tests
global.resetChromeStorage = () => {
  global.chrome.storage.local.data = {};
  global.chrome.storage.local.get.mockClear();
  global.chrome.storage.local.set.mockClear();
  global.chrome.storage.local.remove.mockClear();
  global.chrome.storage.local.clear.mockClear();
};

// Helper to reset all mocks
beforeEach(() => {
  jest.clearAllMocks();
  global.resetChromeStorage();
});
