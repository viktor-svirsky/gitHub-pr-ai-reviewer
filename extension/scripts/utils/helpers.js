// Utility helper functions for GitHub PR AI Reviewer

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to limit execution rate
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Wait for element to appear in DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Element>} The element
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      return resolve(element);
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise<any>} Result of function
 */
async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const backoffDelay = delay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${backoffDelay}ms...`);
        await sleep(backoffDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if we're on a PR page
 * @returns {boolean}
 */
function isPRPage() {
  return window.location.pathname.match(/\/pull\/\d+/);
}

/**
 * Format timestamp to relative time
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Relative time string
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  if (hours > 24) {
    return `${Math.floor(hours / 24)} days ago`;
  } else if (hours > 0) {
    return `${hours} hours ago`;
  } else if (minutes > 0) {
    return `${minutes} minutes ago`;
  } else {
    return "just now";
  }
}

/**
 * Simple in-memory cache with TTL
 */
class SimpleCache {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, ttl = 5000) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }

  delete(key) {
    this.cache.delete(key);
  }
}

/**
 * Safe JSON parse with fallback
 * @param {string} text - JSON string
 * @param {any} fallback - Fallback value
 * @returns {any} Parsed object or fallback
 */
function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("JSON parse error:", error);
    return fallback;
  }
}

/**
 * Truncate text to max length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength, suffix = "...") {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + suffix;
}

// Helper object for global/export use
const helpers = {
  debounce,
  throttle,
  escapeHtml,
  waitForElement,
  retryWithBackoff,
  sleep,
  isPRPage,
  formatRelativeTime,
  SimpleCache,
  safeJsonParse,
  truncateText,
};

// Make utilities available globally
if (typeof window !== "undefined") {
  window.helpers = helpers;
}

// CommonJS export for Node.js/Jest testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { helpers, SimpleCache };
}
