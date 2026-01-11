// Configuration constants for GitHub PR AI Reviewer
// eslint-disable-next-line no-redeclare
const CONFIG = {
  // API Configuration
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",

  // DOM Element IDs
  BUTTON_ID: "ai-review-button",
  REVIEW_CONTAINER_ID: "ai-review-container",

  // Cache Configuration
  REVIEW_CACHE_KEY: "pr_review_cache",
  CACHE_EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
  SETTINGS_CACHE_TTL: 5 * 60 * 1000, // 5 minutes

  // API Configuration
  MAX_DIFF_LENGTH: 20000,
  API_TIMEOUT_MS: 60000, // 60 seconds
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,

  // Performance
  MUTATION_OBSERVER_DEBOUNCE_MS: 500,
  DOM_QUERY_CACHE_TTL: 2000,

  // AI Model Defaults
  DEFAULT_MODEL: "anthropic/claude-3.5-sonnet",
  DEFAULT_TEMPERATURE: 0.3,
  DEFAULT_MAX_TOKENS: 4000,

  // GitHub API
  GITHUB_API_BASE: "https://api.github.com",

  // UI Messages
  MESSAGES: {
    LOADING: "Analyzing pull request...",
    ERROR_NO_API_KEY: "OpenRouter API key not configured. Please add it in the extension settings.",
    ERROR_ENCRYPTION_ENABLED:
      "Encryption is enabled. Please disable encryption or implement master password caching.",
    ERROR_API_FAILED: "OpenRouter API request failed",
    ERROR_NO_CONTENT: "No review content in API response",
    ERROR_FETCH_DIFF: "Failed to fetch PR diff",
    ERROR_FETCH_FILES: "Failed to fetch PR files",
    SUCCESS_CACHED: "Review loaded from cache",
  },

  // DOM Selectors
  SELECTORS: {
    PR_TITLE: ".js-issue-title",
    PR_DESCRIPTION: ".comment-body",
    FILES_TAB: '[data-tab-item="files"], [data-hotkey="f"]',
    FILES_CONTAINER: '[data-target="diff-layout.filesContainer"]',
    FILE_HEADERS: ".file-header",
    DIFF_TABLE: "table.diff-table",
    INSERTION_POINTS: [
      '[data-target="discussions-timeline.timelineContainer"]',
      ".js-discussion",
      "#discussion_bucket",
      ".discussion-timeline",
      ".js-quote-selection-container",
      "#partial-discussion-timeline",
      ".timeline-comment-wrapper",
    ],
  },

  // Severity Levels
  SEVERITY: {
    CRITICAL: "critical",
    MAJOR: "major",
    MINOR: "minor",
  },

  // Review Depth
  REVIEW_DEPTH: {
    QUICK: "quick",
    MEDIUM: "medium",
    DEEP: "deep",
  },
};

// Make CONFIG available globally
if (typeof window !== "undefined") {
  window.CONFIG = CONFIG;
}
if (typeof self !== "undefined") {
  self.CONFIG = CONFIG;
}

// CommonJS export for Node.js/Jest testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG };
}
