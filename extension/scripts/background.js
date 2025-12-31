// Background service worker for GitHub PR AI Reviewer

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
  console.log("Message received:", request);

  if (request.action === "getSettings") {
    chrome.storage.local.get(
      ["openrouterApiKey", "aiModel", "githubToken", "autoReview", "reviewDepth"],
      (settings) => {
        sendResponse({ success: true, settings });
      }
    );
    return true; // Keep channel open for async response
  }

  if (request.action === "saveSettings") {
    chrome.storage.local.set(request.settings, () => {
      sendResponse({ success: true });
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

  if (request.action === "triggerReview") {
    // Handle trigger review action from browser action
    sendResponse({ success: true });
    return false;
  }

  // Unknown action - send response to prevent channel error
  console.warn("Unknown action:", request.action);
  sendResponse({ success: false, error: "Unknown action" });
  return false;
});

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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanup") {
    console.log("Running periodic cleanup");
    // Could clean up old cached reviews, etc.
  }
});
