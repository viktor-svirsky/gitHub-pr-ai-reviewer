// Background service worker for GitHub PR AI Reviewer

// Import dependencies
import "./utils/constants.js";
import "./utils/helpers.js";
import "./services/settings-service.js";
import "./services/api-service.js";

console.log("GitHub PR AI Reviewer background service worker loaded");

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed:", details.reason);

  if (details.reason === "install") {
    // Set default values on first install
    chrome.storage.local.set({
      openrouterApiKey: "",
      aiModel: "anthropic/claude-3.5-sonnet",
      githubToken: "",
      autoReview: false,
      reviewDepth: "medium",
    });

    // Open welcome page or settings
    chrome.tabs.create({
      url: chrome.runtime.getURL("popup/popup.html"),
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received:", request.action);

  if (request.action === "getSettings") {
    chrome.storage.local.get(
      ["openrouterApiKey", "aiModel", "githubToken", "autoReview", "reviewDepth"],
      (settings) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, settings });
        }
      }
    );
    return true; // Keep channel open for async response
  }

  if (request.action === "saveSettings") {
    chrome.storage.local.set(request.settings, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (request.action === "makeRequest") {
    // Proxy API requests through background worker to avoid CORS issues
    handleAPIRequest(request.url, request.options)
      .then((response) => sendResponse({ success: true, data: response }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "generateReview") {
    console.log("🚀 Generating review via background worker...");
    const { prInfo } = request.data;

    (async () => {
      try {
        // 1. Fetch GitHub Data
        const [diff, files] = await Promise.all([fetchPRDiff(prInfo), fetchPRFiles(prInfo)]);

        // 2. Get AI Review
        const review = await apiService.getReview(prInfo, diff, files);

        console.log("✅ Review generated successfully");
        sendResponse({ success: true, review });
      } catch (error) {
        console.error("❌ Review generation failed:", error);
        // Check for encryption lock error
        if (error.message === "ENCRYPTION_LOCKED" || error.message.includes("ENCRYPTION_LOCKED")) {
          sendResponse({ success: false, error: "ENCRYPTION_LOCKED", code: "auth_required" });
        } else {
          sendResponse({ success: false, error: error.message });
        }
      }
    })();
    return true;
  }

  if (request.action === "triggerReview") {
    // Handle trigger review action from browser action
    sendResponse({ success: true });
    return false;
  }

  // Unknown action
  console.warn("Unknown action:", request.action);
  sendResponse({ success: false, error: "Unknown action" });
  return false;
});

// GitHub API Helpers
async function fetchPRDiff(prInfo) {
  const { owner, repo, prNumber } = prInfo;
  console.log(`📥 Fetching PR diff for ${owner}/${repo}#${prNumber}...`);

  const githubToken = await settingsService.getApiKey("githubToken");

  const headers = {
    Accept: "application/vnd.github.v3.diff",
  };

  if (githubToken) {
    headers["Authorization"] = `Bearer ${githubToken}`;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch PR diff: ${response.statusText}`);
  }

  return await response.text();
}

async function fetchPRFiles(prInfo) {
  const { owner, repo, prNumber } = prInfo;
  console.log(`📁 Fetching PR files for ${owner}/${repo}#${prNumber}...`);

  const githubToken = await settingsService.getApiKey("githubToken");

  const headers = {
    Accept: "application/vnd.github.v3+json",
  };

  if (githubToken) {
    headers["Authorization"] = `Bearer ${githubToken}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// Handle API requests
async function handleAPIRequest(url, options) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}

// Listen for tab updates to detect PR pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("github.com")) {
    const prMatch = tab.url.match(/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/);
    if (prMatch) {
      console.log("PR page detected:", tab.url);

      // Could trigger auto-review here if enabled
      chrome.storage.local.get(["autoReview"], (settings) => {
        if (settings.autoReview) {
          console.log("Auto-review enabled, but not implemented yet");
          // Could send message to content script to trigger review
        }
      });
    }
  }
});

// Handle browser action clicks (icon in toolbar)
chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked on tab:", tab.id);

  // Could trigger review on current PR page if applicable
  if (tab.url && tab.url.includes("github.com/") && tab.url.includes("/pull/")) {
    chrome.tabs.sendMessage(tab.id, { action: "triggerReview" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Could not send message to tab:", chrome.runtime.lastError.message);
      } else {
        console.log("Message sent successfully:", response);
      }
    });
  }
});

// Periodic cleanup or maintenance tasks
chrome.alarms.create("cleanup", { periodInMinutes: 60 });
// Security: Check for session timeout every 5 minutes
chrome.alarms.create("sessionCheck", { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanup") {
    console.log("Running periodic cleanup");
    // Could clean up old cached reviews, etc.
  }
  
  if (alarm.name === "sessionCheck") {
    checkSessionTimeout();
  }
});

async function checkSessionTimeout() {
  try {
    if (chrome.storage.session) {
      const data = await chrome.storage.session.get(["lastActivity", "decrypted_openrouterApiKey"]);
      if (data.decrypted_openrouterApiKey) {
        const lastActivity = data.lastActivity || 0;
        const now = Date.now();
        const timeout = 30 * 60 * 1000; // 30 minutes
        
        if (now - lastActivity > timeout) {
          // Clears decrypted keys from session
          await chrome.storage.session.remove([
            "decrypted_openrouterApiKey", 
            "decrypted_githubToken",
            "lastActivity"
          ]);
        }
      }
    }
  } catch (err) {
    console.error("Session check failed", err);
  }
}
