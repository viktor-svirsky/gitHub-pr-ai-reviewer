// Jest setup file - Mock Chrome APIs and Web Crypto API

const nodeCrypto = require("crypto");
const { TextEncoder, TextDecoder } = require("util");

// Ensure TextEncoder/TextDecoder are available
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Create crypto.subtle mock functions as Jest mocks with default implementations
const createSubtleMock = () => ({
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
});

// Create the crypto mock
const createCryptoMock = () => ({
  getRandomValues: (array) => nodeCrypto.randomFillSync(array),
  subtle: createSubtleMock(),
});

// Store the mock so we can reset it
let cryptoMock = createCryptoMock();

// Override crypto - jsdom provides crypto but without subtle in non-secure contexts
Object.defineProperty(global, "crypto", {
  get: () => cryptoMock,
  set: (val) => {
    cryptoMock = val;
  },
  configurable: true,
});

// Also set on globalThis
Object.defineProperty(globalThis, "crypto", {
  get: () => cryptoMock,
  set: (val) => {
    cryptoMock = val;
  },
  configurable: true,
});

// Mock chrome.storage.local API
global.chrome = {
  storage: {
    local: {
      data: {},
      get: jest.fn((keys) => {
        const data = global.chrome.storage.local.data;
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach((key) => {
            if (data[key] !== undefined) {
              result[key] = data[key];
            }
          });
        } else if (keys === null) {
          Object.assign(result, data);
        } else if (typeof keys === "object") {
          Object.keys(keys).forEach((key) => {
            result[key] = data[key] !== undefined ? data[key] : keys[key];
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

// Mock document
global.document = {
  createElement: jest.fn((tag) => {
    const element = {
      tagName: tag.toUpperCase(),
      textContent: "",
      innerHTML: "",
      style: {},
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      appendChild: jest.fn(),
      querySelectorAll: jest.fn(() => []),
    };
    Object.defineProperty(element, "textContent", {
      set(value) {
        this._textContent = value;
        this._innerHTML = String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      },
      get() {
        return this._textContent || "";
      },
    });
    Object.defineProperty(element, "innerHTML", {
      set(value) {
        this._innerHTML = value;
      },
      get() {
        return this._innerHTML || "";
      },
    });
    return element;
  }),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
  },
  head: {
    appendChild: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
  },
};

// Mock window with modifiable location
const windowLocation = {
  pathname: "/owner/repo/pull/123",
  origin: "https://github.com",
  href: "https://github.com/owner/repo/pull/123",
};

Object.defineProperty(global, "window", {
  value: {
    get location() {
      return windowLocation;
    },
    set location(val) {
      Object.assign(windowLocation, val);
    },
  },
  writable: true,
  configurable: true,
});

// Mock console methods to reduce test noise
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

// Helper to reset window location
global.resetWindowLocation = () => {
  windowLocation.pathname = "/owner/repo/pull/123";
  windowLocation.origin = "https://github.com";
  windowLocation.href = "https://github.com/owner/repo/pull/123";
};

// Helper to reset crypto mocks - restore default implementations without losing reference
global.resetCryptoMocks = () => {
  // Reset each subtle method to its default implementation
  cryptoMock.subtle.importKey.mockImplementation(
    (format, keyData, algorithm, extractable, keyUsages) => {
      return Promise.resolve({
        type: "secret",
        extractable,
        algorithm,
        usages: keyUsages,
        _keyData: keyData,
      });
    }
  );
  cryptoMock.subtle.deriveKey.mockImplementation(
    (algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages) => {
      return Promise.resolve({
        type: "secret",
        extractable,
        algorithm: derivedKeyAlgorithm,
        usages: keyUsages,
        _derived: true,
      });
    }
  );
  cryptoMock.subtle.deriveBits.mockImplementation(() => {
    return Promise.resolve(new ArrayBuffer(32));
  });
  cryptoMock.subtle.encrypt.mockImplementation((algorithm, key, data) => {
    const result = new Uint8Array(data.byteLength + 16);
    result.set(new Uint8Array(data), 0);
    result.set(new Uint8Array(16).fill(0xab), data.byteLength);
    return Promise.resolve(result.buffer);
  });
  cryptoMock.subtle.decrypt.mockImplementation((algorithm, key, data) => {
    const dataArray = new Uint8Array(data);
    const result = dataArray.slice(0, dataArray.length - 16);
    return Promise.resolve(result.buffer);
  });
};

// Reset mocks before each test
beforeEach(() => {
  // Clear mocks first
  jest.clearAllMocks();

  // Then reset crypto mocks to restore default implementations (after clearAllMocks)
  global.resetCryptoMocks();

  global.resetChromeStorage();
  global.resetWindowLocation();
});
