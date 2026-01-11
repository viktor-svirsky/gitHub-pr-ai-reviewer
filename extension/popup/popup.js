// Popup script for GitHub PR AI Reviewer settings

console.log("Popup script loaded");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup loaded, initializing...");

  // Elements
  const form = document.getElementById("settings-form");
  const openrouterApiKeyInput = document.getElementById("openrouter-api-key");
  const aiModelSelect = document.getElementById("ai-model");
  const githubTokenInput = document.getElementById("github-token");
  const reviewDepthSelect = document.getElementById("review-depth");
  const autoReviewCheckbox = document.getElementById("auto-review");
  const saveBtn = document.getElementById("save-btn");
  const resetBtn = document.getElementById("reset-btn");
  const statusMessage = document.getElementById("status-message");

  // Security Elements
  const enableEncryptionCheckbox = document.getElementById("enable-encryption");
  const encryptionControls = document.getElementById("encryption-controls");
  const masterPasswordInput = document.getElementById("master-password");
  const confirmMasterPasswordInput = document.getElementById("confirm-master-password");
  const confirmPasswordContainer = document.getElementById("confirm-password-container");
  const unlockBtn = document.getElementById("unlock-btn");
  const toggleMasterPasswordBtn = document.getElementById("toggle-master-password");
  const toggleConfirmPasswordBtn = document.getElementById("toggle-confirm-password");
  const toggleOpenrouterKeyBtn = document.getElementById("toggle-openrouter-key");
  const toggleGithubTokenBtn = document.getElementById("toggle-github-token");

  // State
  let isEncrypted = false;
  let isUnlocked = false;
  let isToggling = false;
  const STATUS_TIMEOUT = 3000;

  // Initialize
  await init();

  async function init() {
    // Check if encryption is enabled
    isEncrypted = await secureStorage.isEncryptionEnabled();
    enableEncryptionCheckbox.checked = isEncrypted;
    toggleEncryptionUI(isEncrypted);

    if (isEncrypted) {
      // Show unlock UI
      lockUI();
    } else {
      // Load plain settings
      await loadSettings();
    }

    setupEventListeners();
  }

  function setupEventListeners() {
    // Toggle Password Visibility
    setupPasswordToggle(toggleMasterPasswordBtn, masterPasswordInput);
    setupPasswordToggle(toggleConfirmPasswordBtn, confirmMasterPasswordInput);
    setupPasswordToggle(toggleOpenrouterKeyBtn, openrouterApiKeyInput);
    setupPasswordToggle(toggleGithubTokenBtn, githubTokenInput);

    // Encryption Toggle
    enableEncryptionCheckbox.addEventListener("change", async (e) => {
      // Race condition prevention
      if (isToggling) {
        e.target.checked = !e.target.checked; // Revert
        return;
      }

      isToggling = true;
      enableEncryptionCheckbox.disabled = true;

      try {
        const wantsEncryption = e.target.checked;

        if (!wantsEncryption) {
          // Attempting to disable encryption
          if (!isUnlocked && isEncrypted) {
            alert("Please unlock with your master password before disabling encryption.");
            e.target.checked = true;
            return;
          }

          // Security: Re-authenticate before disabling
          let reauthPassword = prompt("Please enter your master password to confirm disabling encryption:");
          if (reauthPassword === null) {
            e.target.checked = true;
            return;
          }

          const isValid = await secureStorage.verifyMasterPassword(reauthPassword);
          // Security: Clear password from memory immediately
          reauthPassword = null;
          
          if (!isValid) {
            alert("Incorrect password. Cannot disable encryption.");
            e.target.checked = true;
            return;
          }

          // Warn user
          if (
            !confirm("Disabling encryption will store your API keys in plain text. Are you sure?")
          ) {
            e.target.checked = true;
            return;
          }

          // User confirmed and is unlocked.
          // Immediate Action: Decrypt and save as plain text
          try {
            // Security: Strict check for unlocked state before reading inputs
            if (!isUnlocked) {
              throw new Error("UI must be unlocked to disable encryption safely.");
            }

            // We can get keys from input values as they should be populated if unlocked
            const openrouterKey = openrouterApiKeyInput.value.trim();
            const githubToken = githubTokenInput.value.trim();

            await secureStorage.disableEncryption();

            // Security: Use a single set operation to avoid race conditions
            // This will overwrite any existing encrypted objects with plain text strings
            await chrome.storage.local.set({
              openrouterApiKey: openrouterKey,
              githubToken: githubToken,
              encryptionEnabled: false,
            });

            isEncrypted = false;
            toggleEncryptionUI(false);
            showStatus("Encryption disabled. Keys stored in plain text.", "success");
          } catch (err) {
            console.error("Failed to disable encryption:", err);
            showStatus("Failed to disable encryption", "error");
            e.target.checked = true; // Revert
          }
        } else {
          // Enabling encryption
          isEncrypted = true;
          toggleEncryptionUI(true);
        }
      } finally {
        enableEncryptionCheckbox.disabled = false;
        isToggling = false;
      }
    });

    // Unlock Button
    unlockBtn.addEventListener("click", handleUnlock);
    masterPasswordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !isUnlocked && isEncrypted) {
        e.preventDefault();
        handleUnlock();
      }
    });

    // Save Button
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveSettings();
    });

    // Reset Button
    resetBtn.addEventListener("click", async () => {
      if (confirm("Reset all settings and clear API keys?")) {
        await secureStorage.clearAll();
        // Clear in-memory cache too
        if (secureStorage.clearKeyCache) {
          secureStorage.clearKeyCache();
        }
        // Also clear session storage
        if (chrome.storage.session) {
          await chrome.storage.session.clear();
        }
        location.reload();
      }
    });

    // Fetch models when API key is entered
    if (openrouterApiKeyInput) {
      openrouterApiKeyInput.addEventListener("blur", async () => {
        if (isUnlocked || !isEncrypted) {
          const apiKey = openrouterApiKeyInput.value.trim();
          if (apiKey && apiKey.startsWith("sk-or-")) {
            await fetchAndPopulateModels(apiKey);
          }
        }
      });
    }

    // Auto-save model selection
    if (aiModelSelect) {
      aiModelSelect.addEventListener("change", async () => {
        // Only auto-save non-sensitive data if we can
        const selectedModel = aiModelSelect.value;
        await chrome.storage.local.set({ aiModel: selectedModel });
      });
    }
  }

  function toggleEncryptionUI(enabled) {
    if (enabled) {
      encryptionControls.classList.remove("hidden");
      masterPasswordInput.required = true;
      // Show confirm password only if we're setting up (not locked)
      if (!isUnlocked) {
        confirmPasswordContainer.classList.remove("hidden");
        confirmMasterPasswordInput.required = true;
      } else {
        confirmPasswordContainer.classList.add("hidden");
        confirmMasterPasswordInput.required = false;
      }
    } else {
      encryptionControls.classList.add("hidden");
      confirmPasswordContainer.classList.add("hidden");
      masterPasswordInput.required = false;
      confirmMasterPasswordInput.required = false;
      unlockUI(); // Ensure UI is usable if encryption is off
    }
  }

  function lockUI() {
    isUnlocked = false;
    openrouterApiKeyInput.disabled = true;
    githubTokenInput.disabled = true;
    aiModelSelect.disabled = true;
    saveBtn.disabled = true; // Cannot save if locked
    unlockBtn.classList.remove("hidden");

    // Show placeholder in fields
    openrouterApiKeyInput.placeholder = "(Encrypted - Unlock to view)";
    githubTokenInput.placeholder = "(Encrypted - Unlock to view)";
  }

  function unlockUI() {
    isUnlocked = true;
    openrouterApiKeyInput.disabled = false;
    githubTokenInput.disabled = false;
    aiModelSelect.disabled = false;
    saveBtn.disabled = false;
    unlockBtn.classList.add("hidden");
    confirmPasswordContainer.classList.add("hidden");

    openrouterApiKeyInput.placeholder = "sk-or-v1-...";
    githubTokenInput.placeholder = "ghp_...";
  }

  async function handleUnlock() {
    const password = masterPasswordInput.value.trim();
    if (!password) {
      showStatus("Please enter master password", "error");
      return;
    }

    try {
      unlockBtn.textContent = "Unlocking...";
      unlockBtn.disabled = true;

      // Brute force protection: simple delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // verifyMasterPassword tries to decrypt stored keys
      const isValid = await secureStorage.verifyMasterPassword(password);

      if (isValid) {
        // Only set unlocked state on success
        isUnlocked = true;
        unlockUI();
        await loadSettings(password);
        // Security: Clear password from input immediately after use
        masterPasswordInput.value = "";
        showStatus("Unlocked successfully", "success");
      } else {
        showStatus("Incorrect password", "error");
        // Ensure UI is ready for retry
        unlockBtn.textContent = "Unlock";
        unlockBtn.disabled = false;
      }
    } catch (error) {
      console.error(error);
      showStatus("Unlock failed", "error");
      unlockBtn.textContent = "Unlock";
      unlockBtn.disabled = false;
    }
  }

  async function loadSettings(password = null) {
    try {
      // Load non-sensitive settings
      const settings = await chrome.storage.local.get([
        "aiModel",
        "reviewDepth",
        "autoReview",
        "openrouterApiKey",
        "githubToken",
      ]);

      if (settings.reviewDepth) {
        reviewDepthSelect.value = settings.reviewDepth;
      }
      if (settings.autoReview) {
        autoReviewCheckbox.checked = settings.autoReview;
      }

      // Handle Keys
      let openrouterKey = settings.openrouterApiKey;
      let githubToken = settings.githubToken;

      if (isEncrypted && password) {
        // Decrypt
        if (openrouterKey && openrouterKey.encrypted) {
          openrouterKey = await secureStorage.decrypt(
            openrouterKey,
            await secureStorage.deriveKey(password),
          );
        }
        if (githubToken && githubToken.encrypted) {
          githubToken = await secureStorage.decrypt(
            githubToken,
            await secureStorage.deriveKey(password),
          );
        }

        // Store in Session Storage for Background Worker
        if (chrome.storage.session) {
          await chrome.storage.session.set({
            decrypted_openrouterApiKey: openrouterKey,
            decrypted_githubToken: githubToken,
            lastActivity: Date.now(),
          });
        }
      }

      // Populate Inputs
      if (openrouterKey && typeof openrouterKey === "string") {
        openrouterApiKeyInput.value = openrouterKey;
        // Fetch models
        await fetchAndPopulateModels(openrouterKey, settings.aiModel);
      } else {
        // Just set model if key is missing/locked
        if (settings.aiModel) {
          aiModelSelect.value = settings.aiModel;
        }
      }

      if (githubToken && typeof githubToken === "string") {
        githubTokenInput.value = githubToken;
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      showStatus("Error loading settings", "error");
    }
  }

  async function saveSettings() {
    const openrouterKey = openrouterApiKeyInput.value.trim();
    const githubToken = githubTokenInput.value.trim();
    const password = masterPasswordInput.value.trim();
    const confirmPassword = confirmMasterPasswordInput.value.trim();

    if (!openrouterKey) {
      showStatus("OpenRouter API key is required", "error");
      return;
    }

    if (isEncrypted && !isUnlocked) {
      if (!password) {
        showStatus("Master password is required for encryption", "error");
        return;
      }

      if (password.length < 8) {
        showStatus("Password must be at least 8 characters", "error");
        return;
      }

      if (password !== confirmPassword) {
        showStatus("Passwords do not match", "error");
        return;
      }
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      // Save non-sensitive
      await chrome.storage.local.set({
        aiModel: aiModelSelect.value,
        reviewDepth: reviewDepthSelect.value,
        autoReview: autoReviewCheckbox.checked,
        encryptionEnabled: isEncrypted,
      });

      if (isEncrypted) {
        // If we are enabling encryption for the first time or updating password
        // we should migrate existing keys if they were plain

        // If password is empty but we are unlocked, SecureStorage will use keyCache
        // If we are NOT unlocked, password is required (checked above)

        // Save Encrypted
        await secureStorage.saveSecure("openrouterApiKey", openrouterKey, password);
        await secureStorage.saveSecure("githubToken", githubToken, password);

        // Update session storage
        if (chrome.storage.session) {
          await chrome.storage.session.set({
            decrypted_openrouterApiKey: openrouterKey,
            decrypted_githubToken: githubToken,
            lastActivity: Date.now(),
          });
        }
      } else {
        // Save Plain
        await secureStorage.disableEncryption(); // Clears encryption flag
        await chrome.storage.local.set({
          openrouterApiKey: openrouterKey,
          githubToken: githubToken,
        });
        // Clear session storage as it's not needed (or keep it sync? Safe to keep)
      }

      showStatus("Settings saved!", "success");

      // If we just enabled encryption, we are now unlocked
      if (isEncrypted) {
        isUnlocked = true;
        unlockUI();
      }
    } catch (error) {
      console.error("Save error:", error);
      showStatus(`Failed to save: ${error.message}`, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg class="btn-icon" height="16" width="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
        </svg>
        Save Settings
      `;
    }
  }

  // Helper: Password Toggle
  function setupPasswordToggle(btn, input) {
    if (!btn || !input) {
      return;
    }
    btn.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
    });
  }

  // Helper: Status
  function showStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove("hidden");
    setTimeout(() => statusMessage.classList.add("hidden"), STATUS_TIMEOUT);
  }

  // --- Model Fetching Logic (Simplified from original) ---
  async function fetchAndPopulateModels(apiKey, modelToRestore) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.ok) {
        const data = await response.json();
        const models = data.data.filter(
          (m) =>
            m.id.includes("claude") ||
            m.id.includes("gpt") ||
            m.id.includes("gemini") ||
            m.id.includes("llama"),
        );

        aiModelSelect.innerHTML = "";
        models.forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.name;
          aiModelSelect.appendChild(opt);
        });

        if (modelToRestore) {
          aiModelSelect.value = modelToRestore;
        }
      }
    } catch (e) {
      console.error("Model fetch failed", e);
    }
  }
});